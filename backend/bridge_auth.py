"""
Tally Bridge device auth: secret hashing + short-lived device tokens (HMAC JWT-like).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

from fastapi import HTTPException

BRIDGE_AUD = "khatalens-bridge"
TOKEN_TTL_SECONDS = int(os.getenv("BRIDGE_TOKEN_TTL_SECONDS", "900"))  # 15m


def _hmac_secret() -> str:
    secret = (os.getenv("BRIDGE_JWT_SECRET") or os.getenv("PUBLIC_UPLOAD_TOKEN_SECRET") or "").strip()
    if not secret:
        # Tests / local: deterministic fallback (production must set real secret)
        if os.getenv("TESTING", "").lower() in ("1", "true", "yes") or os.getenv("PYTEST_CURRENT_TEST"):
            return "test-bridge-jwt-secret"
        raise RuntimeError("BRIDGE_JWT_SECRET or PUBLIC_UPLOAD_TOKEN_SECRET required for bridge tokens")
    return secret


def _pepper() -> str:
    return _hmac_secret()


def generate_device_secret() -> str:
    return secrets.token_urlsafe(32)


def hash_device_secret(secret: str) -> str:
    return hashlib.sha256(f"{_pepper()}:{secret}".encode()).hexdigest()


def verify_device_secret(secret: str, secret_hash: str) -> bool:
    return hmac.compare_digest(hash_device_secret(secret), secret_hash)


def create_device_token(
    *,
    device_id: str,
    user_id: str,
    org_id: str,
    ttl_seconds: int | None = None,
) -> tuple[str, int]:
    ttl = ttl_seconds if ttl_seconds is not None else TOKEN_TTL_SECONDS
    exp = int(time.time()) + ttl
    payload = {
        "aud": BRIDGE_AUD,
        "sub": device_id,
        "uid": user_id,
        "oid": org_id,
        "exp": exp,
    }
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(_hmac_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}", exp


def verify_device_token(token: str) -> dict[str, Any]:
    if not token:
        raise HTTPException(status_code=401, detail="Missing bridge device token")
    try:
        body, sig = token.rsplit(".", 1)
        expected = hmac.new(_hmac_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            raise HTTPException(status_code=401, detail="Invalid bridge token")
        padded = body + "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid bridge token") from e

    if payload.get("aud") != BRIDGE_AUD:
        raise HTTPException(status_code=401, detail="Invalid bridge token audience")
    if int(payload.get("exp") or 0) < int(time.time()):
        raise HTTPException(status_code=401, detail="Bridge token expired")
    if not payload.get("sub") or not payload.get("oid"):
        raise HTTPException(status_code=401, detail="Invalid bridge token claims")
    return payload


def job_fingerprint(*, client_id: str, xml: str, source: str) -> str:
    """Stable hash for idempotent enqueue (same XML+client+source → same fingerprint)."""
    h = hashlib.sha256()
    h.update(client_id.encode())
    h.update(b"|")
    h.update(source.encode())
    h.update(b"|")
    h.update(xml.encode("utf-8", errors="replace"))
    return h.hexdigest()
