import os
import uuid
import re
import hashlib
import logging
from fastapi import HTTPException, Header
from supabase import create_async_client

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def get_supabase_client():
    """
    Creates a synchronous Supabase client using the service role key.
    Used for admin/service-level operations that bypass RLS.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing Supabase service key configuration.")
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


from supabase.client import ClientOptions


async def get_user_supabase_client(authorization: str):
    """
    Creates an async Supabase client using the user's JWT.
    This enforces Postgres Row Level Security (RLS) on all backend queries,
    preventing users from bypassing RBAC by hitting the API directly.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # We use ANON_KEY + User's JWT so RLS applies correctly
    return await create_async_client(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        options=ClientOptions(headers={"Authorization": authorization})
    )


async def get_current_user(authorization: str = Header(None)):
    """
    Centralized FastAPI dependency for user authentication.
    Verifies the JWT token and returns a dict with user_id and supabase client.

    Usage in route:
        @router.get("/example")
        async def example(auth: dict = Depends(get_current_user)):
            user_id = auth["user_id"]
            sc = auth["supabase_client"]
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: Missing or invalid Authorization header")

    token = authorization.split(" ")[1]
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid token")

    sc = await get_user_supabase_client(authorization)
    try:
        user_resp = await sc.auth.get_user(token)
        if not user_resp or not user_resp.user:
            raise HTTPException(status_code=401, detail="Unauthorized: Invalid session token")
        sc.postgrest.auth(token)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth verification failed: {e}")
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid session token")

    return {
        "user_id": user_resp.user.id,
        "supabase_client": sc,
        "token": token
    }


def validate_file_content(content: bytes, filename: str) -> str:
    """
    Validates file magic bytes and size, returns verified mime type.
    """
    MAX_SIZE = 10 * 1024 * 1024  # 10 MB limit
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail=f"File {filename} is too large. Max 10MB allowed.")

    if content.startswith(b'%PDF-'):
        return "application/pdf"
    elif content.startswith(b'\xff\xd8\xff'):
        return "image/jpeg"
    elif content.startswith(b'\x89PNG\r\n\x1a\n'):
        return "image/png"
    elif content.startswith(b'RIFF') and content[8:12] == b'WEBP':
        return "image/webp"
    else:
        raise HTTPException(status_code=400, detail=f"Invalid file format for {filename}. Only PDF, JPEG, PNG, and WEBP are allowed.")


def sanitize_filename(filename: str) -> str:
    if not filename:
        return f"{uuid.uuid4()}.bin"
    # Keep only alphanumeric characters, dots, dashes, and underscores
    clean_name = re.sub(r'[^a-zA-Z0-9.\-_]', '', filename)
    # Remove leading dots or slashes
    clean_name = clean_name.lstrip('./\\')
    if not clean_name:
        return f"{uuid.uuid4()}.bin"
    return clean_name


def compute_file_hash(content: bytes) -> str:
    """
    Computes SHA-256 hash of file content for deduplication.
    """
    return hashlib.sha256(content).hexdigest()


_ROLE_RANK = {"owner": 0, "admin": 1, "accountant": 2}


async def resolve_active_org_id(sc, user_id: str) -> str | None:
    """
    Resolve the organization wallet for a user (multi-org safe).

    Order:
      1. profiles.active_org_id when set
      2. organization_members for the user (owner > admin > accountant, then created_at)
      3. earliest organizations row owned by the user (last resort)

    Avoids arbitrary owner_id LIMIT 1 when memberships exist.
    """
    try:
        profile_resp = await sc.table("profiles").select("active_org_id").eq("id", user_id).execute()
        active_org_id = profile_resp.data[0].get("active_org_id") if profile_resp.data else None
        if active_org_id:
            return active_org_id

        members_resp = (
            await sc.table("organization_members")
            .select("org_id, role, created_at")
            .eq("user_id", user_id)
            .execute()
        )
        rows = members_resp.data or []
        if rows:
            rows_sorted = sorted(
                rows,
                key=lambda r: (
                    _ROLE_RANK.get((r.get("role") or "").lower(), 9),
                    r.get("created_at") or "",
                ),
            )
            org_id = rows_sorted[0].get("org_id")
            if org_id:
                return org_id

        owned_resp = (
            await sc.table("organizations")
            .select("id, created_at")
            .eq("owner_id", user_id)
            .order("created_at")
            .limit(1)
            .execute()
        )
        if owned_resp.data:
            return owned_resp.data[0].get("id")
    except Exception as e:
        logger.warning(f"Could not resolve active org for {user_id}: {e}")
    return None


async def get_org_credits(sc, user_id: str) -> int:
    """Return the active organization's credit balance for a user."""
    try:
        org_id = await resolve_active_org_id(sc, user_id)
        if not org_id:
            return 0
        org_resp = await sc.table("organizations").select("credits").eq("id", org_id).execute()
        if org_resp.data:
            return int(org_resp.data[0].get("credits") or 0)
    except Exception as e:
        logger.warning(f"Could not fetch org credits for {user_id}: {e}")
    return 0


async def ensure_sufficient_credits(sc, user_id: str, cost: int) -> None:
    """Raise 402 if the user's organization cannot afford `cost` credits."""
    if cost <= 0:
        return
    credits = await get_org_credits(sc, user_id)
    if credits < cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. This statement requires {cost} credits. Please recharge your wallet.",
        )


async def verify_client_access(sc, client_id: str) -> None:
    """
    Require firm-wide org membership (or cross-org assignment) via
    has_client_access RPC. Product default is any org member — not
    clients.user_id owner-only.

    Never trusts client_id alone — caller must already be authenticated
    (JWT-backed supabase client). Raises 403 when the RPC denies access
    or fails (fail closed).
    """
    if not client_id:
        raise HTTPException(status_code=403, detail="Access denied: client not found")
    try:
        access = await sc.rpc("has_client_access", {"check_client_id": client_id}).execute()
        if access.data is True:
            return
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"has_client_access RPC failed for client {client_id}: {e}")
    raise HTTPException(status_code=403, detail="Access denied: client not found")


import io


def remove_pdf_password_if_present(pdf_bytes: bytes, password: str) -> bytes:
    try:
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if reader.is_encrypted:
            res = reader.decrypt(password)
            if res:
                writer = PdfWriter()
                for page in reader.pages:
                    writer.add_page(page)
                out = io.BytesIO()
                writer.write(out)
                return out.getvalue()
    except Exception as e:
        logger.error(f"Error removing PDF password: {e}")
    return pdf_bytes