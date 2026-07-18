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