"""Tenant-facing support session endpoints (end read-only impersonation)."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from supabase import create_async_client

from support_session import clear_support_session_on_user
from utils import SUPABASE_SERVICE_KEY, SUPABASE_URL, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/support/end")
async def end_support_session(auth: dict = Depends(get_current_user)):
    """
    Clear is_support_session from the current user's app_metadata.
    Allowed even while support_read_only is active (allowlisted in get_current_user).
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing Supabase service configuration")

    user_id = auth["user_id"]
    try:
        admin = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        await clear_support_session_on_user(admin, user_id)
    except Exception as e:
        logger.error("Failed to clear support session for %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Failed to end support session") from e

    return {"status": "success", "support_read_only": False}
