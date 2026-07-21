"""
Proactive ops / extraction event log (DB-backed).

Writes non-PII metadata to `ops_events` via the Supabase service role so the
KhataLens team can see scan/extraction failures before users report them.

Env:
  OPS_LOG_ENABLED   — default "true"; set "false" / "0" to disable writes
  OPS_LOG_SAMPLE_RATE — 0.0–1.0; applies to info-severity events only
                        (errors/warnings always log when enabled)
"""
from __future__ import annotations

import logging
import os
import random
from typing import Any

from utils import SUPABASE_URL, SUPABASE_SERVICE_KEY, sanitize_filename

logger = logging.getLogger(__name__)

MESSAGE_MAX_LEN = 500

# Fields we may flag as present/absent — never store values
_PRESENCE_KEYS = (
    "Supplier_GSTIN",
    "Supplier_Name",
    "Invoice_Number",
    "Invoice_Date",
    "Buyer_GSTIN",
    "Total_Amount",
    "Taxable_Amount",
    "CGST_Amount",
    "SGST_Amount",
    "IGST_Amount",
    "Line_Items",
    "IRN",
    "Invoice_Type",
)

VALID_CHANNELS = frozenset({"scan", "batch", "public", "whatsapp"})
VALID_SEVERITIES = frozenset({"error", "warning", "info"})


def ops_log_enabled() -> bool:
    raw = (os.getenv("OPS_LOG_ENABLED", "true") or "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


def ops_sample_rate() -> float:
    try:
        rate = float(os.getenv("OPS_LOG_SAMPLE_RATE", "1.0") or "1.0")
    except (TypeError, ValueError):
        return 1.0
    return max(0.0, min(1.0, rate))


def truncate_message(message: str | None, max_len: int = MESSAGE_MAX_LEN) -> str | None:
    if message is None:
        return None
    text = str(message).strip()
    if not text:
        return None
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def sanitize_ops_filename(filename: str | None) -> str | None:
    if not filename:
        return None
    # Reuse storage sanitizer; cap length for log rows
    clean = sanitize_filename(str(filename))
    return clean[:200] if clean else None


def field_presence_flags(data: dict | None) -> dict[str, Any]:
    """Boolean / count metadata only — no financial or identity values."""
    if not data or not isinstance(data, dict):
        return {}
    flags: dict[str, Any] = {}
    for key in _PRESENCE_KEYS:
        val = data.get(key)
        if key == "Line_Items":
            items = val if isinstance(val, list) else []
            flags["has_line_items"] = len(items) > 0
            flags["line_item_count"] = len(items)
        else:
            snake = "has_" + key.lower()
            flags[snake] = val is not None and val != "" and val != []
    return flags


def build_ops_ctx(
    channel: str,
    *,
    user_id: str | None = None,
    org_id: str | None = None,
    client_id: str | None = None,
    file_name: str | None = None,
    mime_type: str | None = None,
) -> dict[str, Any]:
    ch = (channel or "").strip().lower()
    if ch not in VALID_CHANNELS:
        ch = channel  # still record unknown for debugging
    return {
        "channel": ch,
        "user_id": user_id,
        "org_id": org_id,
        "client_id": client_id,
        "file_name_sanitized": sanitize_ops_filename(file_name),
        "mime_type": mime_type,
    }


async def log_ops_event(
    *,
    severity: str,
    event_type: str,
    channel: str | None = None,
    org_id: str | None = None,
    user_id: str | None = None,
    client_id: str | None = None,
    file_name: str | None = None,
    file_name_sanitized: str | None = None,
    mime_type: str | None = None,
    extraction_state: str | None = None,
    confidence_score: float | int | None = None,
    model_used: str | None = None,
    tokens_used: int | None = None,
    latency_ms: int | None = None,
    message: str | None = None,
    meta: dict | None = None,
    supabase_client=None,
) -> bool:
    """
    Insert one ops_events row. Never raises to callers (best-effort).
    Returns True if a write was attempted successfully.
    """
    if not ops_log_enabled():
        return False

    sev = (severity or "info").lower()
    if sev not in VALID_SEVERITIES:
        sev = "info"

    # Sample info events; always keep error/warning
    if sev == "info":
        rate = ops_sample_rate()
        if rate <= 0 or (rate < 1.0 and random.random() > rate):
            return False

    row = {
        "severity": sev,
        "event_type": (event_type or "unknown")[:80],
        "channel": channel if channel in VALID_CHANNELS else channel,
        "org_id": org_id,
        "user_id": user_id,
        "client_id": client_id,
        "file_name_sanitized": file_name_sanitized or sanitize_ops_filename(file_name),
        "mime_type": mime_type,
        "extraction_state": extraction_state,
        "confidence_score": confidence_score,
        "model_used": model_used,
        "tokens_used": tokens_used,
        "latency_ms": latency_ms,
        "message": truncate_message(message),
        "meta": meta or {},
    }
    # Drop None values so PostgREST defaults apply cleanly
    payload = {k: v for k, v in row.items() if v is not None}

    try:
        sc = supabase_client
        if sc is None:
            if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
                logger.debug("ops_log skipped: missing service role config")
                return False
            from supabase import create_async_client

            sc = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        await sc.table("ops_events").insert(payload).execute()
        return True
    except Exception as e:
        logger.warning("ops_log write failed (non-blocking): %s", e)
        return False


async def log_from_ctx(
    ops_ctx: dict | None,
    *,
    severity: str,
    event_type: str,
    message: str | None = None,
    extraction_state: str | None = None,
    confidence_score: float | int | None = None,
    model_used: str | None = None,
    tokens_used: int | None = None,
    latency_ms: int | None = None,
    meta: dict | None = None,
) -> bool:
    """Convenience: merge channel context dict into log_ops_event."""
    ctx = ops_ctx or {}
    return await log_ops_event(
        severity=severity,
        event_type=event_type,
        channel=ctx.get("channel"),
        org_id=ctx.get("org_id"),
        user_id=ctx.get("user_id"),
        client_id=ctx.get("client_id"),
        file_name_sanitized=ctx.get("file_name_sanitized"),
        mime_type=ctx.get("mime_type"),
        extraction_state=extraction_state,
        confidence_score=confidence_score,
        model_used=model_used,
        tokens_used=tokens_used,
        latency_ms=latency_ms,
        message=message,
        meta=meta,
    )


async def log_extraction_quality(
    ops_ctx: dict | None,
    data_dict: dict,
    *,
    tokens_used: int | None = None,
    latency_ms: int | None = None,
) -> None:
    """
    After a successful extract: log escalate + needs_retry / weak review signals.
    Does not store extracted financial payloads.
    """
    if not ops_ctx or not data_dict:
        return

    state = data_dict.get("Extraction_State")
    try:
        score = float(data_dict.get("Confidence_Score") or 0)
    except (TypeError, ValueError):
        score = 0.0
    model = data_dict.get("Extraction_Model")
    presence = field_presence_flags(data_dict)
    base_meta = {
        **presence,
        "escalated": bool(data_dict.get("Escalated")),
    }
    if data_dict.get("Verify_Score") is not None:
        try:
            base_meta["verify_score"] = float(data_dict.get("Verify_Score"))
        except (TypeError, ValueError):
            pass

    if data_dict.get("Escalated"):
        await log_from_ctx(
            ops_ctx,
            severity="info",
            event_type="escalated_to_verify",
            message="Primary extract failed trust gate; verify model used",
            extraction_state=state,
            confidence_score=score,
            model_used=model,
            tokens_used=tokens_used,
            latency_ms=latency_ms,
            meta=base_meta,
        )

    if state == "needs_retry":
        await log_from_ctx(
            ops_ctx,
            severity="warning",
            event_type="needs_retry",
            message="Extraction marked needs_retry",
            extraction_state=state,
            confidence_score=score,
            model_used=model,
            tokens_used=tokens_used,
            latency_ms=latency_ms,
            meta=base_meta,
        )
    elif state == "needs_review" and score < 90:
        await log_from_ctx(
            ops_ctx,
            severity="warning",
            event_type="low_confidence",
            message=f"needs_review with confidence {score}",
            extraction_state=state,
            confidence_score=score,
            model_used=model,
            tokens_used=tokens_used,
            latency_ms=latency_ms,
            meta=base_meta,
        )
