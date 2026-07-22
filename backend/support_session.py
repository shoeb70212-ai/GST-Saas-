"""
Read-only support (impersonation) session helpers.

Super-admins open a tenant magic link after we stamp app_metadata
(is_support_session + expiry). FastAPI and Postgres triggers both enforce
read-only while that claim is active.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

SUPPORT_SESSION_TTL_SECONDS = int(os.getenv("SUPPORT_SESSION_TTL_SECONDS", str(60 * 60)))
SUPPORT_META_FLAG = "is_support_session"
SUPPORT_META_EXPIRES = "support_session_expires_at"
SUPPORT_META_OPENED_BY = "support_opened_by"


def _as_dict(meta: Any) -> dict:
    if meta is None:
        return {}
    if isinstance(meta, dict):
        return dict(meta)
    # supabase-py may return a Mapping-like object
    try:
        return dict(meta)
    except Exception:
        return {}


def app_metadata_of(user: Any) -> dict:
    return _as_dict(getattr(user, "app_metadata", None))


def support_expiry_unix(meta: dict | None = None, *, ttl_seconds: int | None = None) -> int:
    ttl = SUPPORT_SESSION_TTL_SECONDS if ttl_seconds is None else ttl_seconds
    return int(time.time()) + int(ttl)


def is_support_session_active(user: Any) -> bool:
    """True when JWT/user app_metadata marks an unexpired support session."""
    meta = app_metadata_of(user)
    if str(meta.get(SUPPORT_META_FLAG, "")).lower() not in ("true", "1", "yes"):
        return False
    exp = meta.get(SUPPORT_META_EXPIRES)
    if exp is None or exp == "":
        return True
    try:
        return int(time.time()) <= int(exp)
    except (TypeError, ValueError):
        return True


def support_session_needs_clear(user: Any) -> bool:
    """Flag present but expired — clear so the real tenant is not stuck read-only."""
    meta = app_metadata_of(user)
    if str(meta.get(SUPPORT_META_FLAG, "")).lower() not in ("true", "1", "yes"):
        return False
    exp = meta.get(SUPPORT_META_EXPIRES)
    if exp is None or exp == "":
        return False
    try:
        return int(time.time()) > int(exp)
    except (TypeError, ValueError):
        return False


def merge_support_metadata(existing: Any, *, admin_user_id: str, ttl_seconds: int | None = None) -> dict:
    meta = _as_dict(existing)
    meta[SUPPORT_META_FLAG] = True
    meta[SUPPORT_META_EXPIRES] = support_expiry_unix(ttl_seconds=ttl_seconds)
    meta[SUPPORT_META_OPENED_BY] = admin_user_id
    return meta


def strip_support_metadata(existing: Any) -> dict:
    meta = _as_dict(existing)
    meta.pop(SUPPORT_META_FLAG, None)
    meta.pop(SUPPORT_META_EXPIRES, None)
    meta.pop(SUPPORT_META_OPENED_BY, None)
    return meta


async def set_support_session_on_user(admin_client, user_id: str, *, admin_user_id: str) -> dict:
    auth_user = await admin_client.auth.admin.get_user_by_id(user_id)
    user_obj = getattr(auth_user, "user", auth_user)
    existing = app_metadata_of(user_obj)
    new_meta = merge_support_metadata(existing, admin_user_id=admin_user_id)
    await admin_client.auth.admin.update_user_by_id(user_id, {"app_metadata": new_meta})
    return new_meta


async def clear_support_session_on_user(admin_client, user_id: str) -> dict:
    auth_user = await admin_client.auth.admin.get_user_by_id(user_id)
    user_obj = getattr(auth_user, "user", auth_user)
    new_meta = strip_support_metadata(app_metadata_of(user_obj))
    await admin_client.auth.admin.update_user_by_id(user_id, {"app_metadata": new_meta})
    return new_meta
