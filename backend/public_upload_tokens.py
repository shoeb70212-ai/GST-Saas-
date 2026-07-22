import base64
import hashlib
import hmac
import os
import time

from fastapi import HTTPException

TOKEN_TTL_SECONDS = int(os.getenv("PUBLIC_UPLOAD_TOKEN_TTL_SECONDS", str(7 * 24 * 3600)))


def _token_secret() -> str:
    """
    HMAC secret for public portal upload tokens.

    Must be a dedicated secret — never reuse SUPABASE_SERVICE_ROLE_KEY
    (a service-key leak would otherwise allow forging unlimited upload tokens).
    """
    secret = (os.getenv("PUBLIC_UPLOAD_TOKEN_SECRET") or "").strip()
    if not secret:
        raise RuntimeError(
            "PUBLIC_UPLOAD_TOKEN_SECRET must be configured "
            "(do not reuse SUPABASE_SERVICE_ROLE_KEY as the HMAC secret)"
        )
    return secret


def assert_public_upload_token_secret_configured() -> None:
    """Call at process startup so misconfig fails fast."""
    _token_secret()


def _sign(client_id: str, expires_at: int) -> str:
    payload = f"{client_id}.{expires_at}".encode()
    return hmac.new(_token_secret().encode(), payload, hashlib.sha256).hexdigest()


def create_public_upload_token(client_id: str, ttl_seconds: int | None = None) -> tuple[str, int]:
    ttl = ttl_seconds if ttl_seconds is not None else TOKEN_TTL_SECONDS
    expires_at = int(time.time()) + ttl
    signature = _sign(client_id, expires_at)
    raw = f"{expires_at}.{signature}"
    token = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")
    return token, expires_at


def verify_public_upload_token(client_id: str, token: str) -> None:
    if not token:
        raise HTTPException(status_code=401, detail="Missing upload token")

    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode()).decode()
        expires_at_str, signature = raw.split(".", 1)
        expires_at = int(expires_at_str)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid upload token")

    if expires_at < int(time.time()):
        raise HTTPException(status_code=401, detail="Upload token expired")

    expected = _sign(client_id, expires_at)
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid upload token")
