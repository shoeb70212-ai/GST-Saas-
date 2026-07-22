"""
Refund credits for invoices stuck in pending after a crash/restart.

Batch and public upload deduct credits before workers finish. If the process
dies, rows can remain pending forever with no refund. This job marks them
failed (only if still pending) and refunds one credit each.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from http_client import get_shared_client
from utils import SUPABASE_URL, SUPABASE_SERVICE_KEY
import credits as credit_costs

logger = logging.getLogger(__name__)

STALE_STATUSES = ("pending", "pending_from_client")
DEFAULT_OLDER_THAN_MINUTES = int(os.getenv("STALE_INVOICE_MINUTES", "15"))


async def _refund_one(user_id: str, amount: int = 1) -> bool:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.error("Cannot refund stale invoice: missing Supabase service config")
        return False
    async with get_shared_client() as http_client:
        resp = await http_client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/refund_credits",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={"user_id_param": user_id, "amount": amount},
        )
    if resp.status_code != 200:
        logger.error("refund_credits failed for stale reconcile user=%s: %s", user_id, resp.text)
        return False
    return True


async def reconcile_stale_pending_invoices(
    admin_client,
    *,
    older_than_minutes: int | None = None,
    dry_run: bool = True,
    limit: int = 200,
) -> dict:
    minutes = DEFAULT_OLDER_THAN_MINUTES if older_than_minutes is None else older_than_minutes
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max(5, int(minutes)))
    cutoff_iso = cutoff.isoformat()

    query = (
        admin_client.table("invoices")
        .select("id, user_id, processing_status, created_at, file_name")
        .in_("processing_status", list(STALE_STATUSES))
        .lt("created_at", cutoff_iso)
        .order("created_at", desc=False)
        .limit(limit)
    )
    resp = await query.execute()
    rows = resp.data or []

    refunded = 0
    marked_failed = 0
    skipped = 0
    errors: list[str] = []
    sample: list[dict] = []

    for row in rows:
        inv_id = row.get("id")
        user_id = row.get("user_id")
        sample.append(
            {
                "id": inv_id,
                "user_id": user_id,
                "processing_status": row.get("processing_status"),
                "created_at": row.get("created_at"),
                "file_name": row.get("file_name"),
            }
        )
        if dry_run:
            continue
        if not inv_id or not user_id:
            skipped += 1
            continue
        try:
            upd = (
                await admin_client.table("invoices")
                .update(
                    {
                        "processing_status": "failed",
                        "error_message": (
                            f"Stale pending auto-reconciled after {minutes}m; credit refunded"
                        ),
                    }
                )
                .eq("id", inv_id)
                .in_("processing_status", list(STALE_STATUSES))
                .execute()
            )
            if not upd.data:
                skipped += 1
                continue
            marked_failed += 1
            if await _refund_one(user_id, credit_costs.INVOICE_SCAN):
                refunded += 1
            else:
                errors.append(f"refund_failed:{inv_id}")
        except Exception as e:
            logger.exception("stale reconcile failed for %s", inv_id)
            errors.append(f"{inv_id}:{e}")

    return {
        "older_than_minutes": minutes,
        "cutoff": cutoff_iso,
        "dry_run": dry_run,
        "candidates": len(rows),
        "marked_failed": marked_failed,
        "refunded": refunded,
        "skipped": skipped,
        "errors": errors[:20],
        "sample": sample[:20],
    }
