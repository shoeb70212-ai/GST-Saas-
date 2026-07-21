"""
Lightweight ops error-spike alerts (email and/or WhatsApp) with cooldown.
"""
from __future__ import annotations

import logging
import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any

logger = logging.getLogger(__name__)

ALERT_KEY = "error_spike_15m"


def spike_threshold() -> int:
    try:
        return max(1, int(os.getenv("OPS_ERROR_SPIKE_THRESHOLD", "10") or "10"))
    except (TypeError, ValueError):
        return 10


def cooldown_minutes() -> int:
    try:
        return max(1, int(os.getenv("OPS_ALERT_COOLDOWN_MIN", "30") or "30"))
    except (TypeError, ValueError):
        return 30


def alert_secret() -> str | None:
    raw = (os.getenv("OPS_ALERT_SECRET") or "").strip()
    return raw or None


def window_start_iso(minutes: int = 15) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


async def count_recent_errors(admin_client, minutes: int = 15) -> tuple[int, list[str]]:
    since = window_start_iso(minutes)
    try:
        resp = (
            await admin_client.table("ops_events")
            .select("id, event_type, org_id, created_at")
            .eq("severity", "error")
            .gte("created_at", since)
            .limit(500)
            .execute()
        )
        rows = list(resp.data or [])
    except Exception as e:
        logger.warning("count_recent_errors failed: %s", e)
        return 0, []

    # Exclude known test org names when org join available is expensive —
    # filter by event_type top counts only.
    type_counts: dict[str, int] = {}
    for r in rows:
        et = r.get("event_type") or "unknown"
        type_counts[et] = type_counts.get(et, 0) + 1
    top = sorted(type_counts.items(), key=lambda x: -x[1])[:5]
    top_labels = [f"{k}×{v}" for k, v in top]
    return len(rows), top_labels


async def get_alert_state(admin_client) -> dict[str, Any]:
    try:
        resp = (
            await admin_client.table("ops_alert_state")
            .select("*")
            .eq("alert_key", ALERT_KEY)
            .limit(1)
            .execute()
        )
        if resp.data:
            return resp.data[0]
    except Exception as e:
        logger.warning("get_alert_state failed: %s", e)
    return {"alert_key": ALERT_KEY, "last_fired_at": None, "last_count": 0, "meta": {}}


def cooldown_elapsed(state: dict, now: datetime | None = None) -> bool:
    now = now or datetime.now(timezone.utc)
    last = state.get("last_fired_at")
    if not last:
        return True
    try:
        if isinstance(last, str):
            last = last.replace("Z", "+00:00")
            last_dt = datetime.fromisoformat(last)
        elif isinstance(last, datetime):
            last_dt = last
        else:
            return True
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        return (now - last_dt) >= timedelta(minutes=cooldown_minutes())
    except Exception:
        return True


async def send_alert_email(subject: str, body: str) -> bool:
    to_addr = (os.getenv("OPS_ALERT_EMAIL") or "").strip()
    if not to_addr:
        logger.info("OPS_ALERT_EMAIL unset; skipping email alert")
        return False

    # Prefer Resend HTTP if key present; else SMTP
    resend_key = (os.getenv("RESEND_API_KEY") or "").strip()
    from_addr = (os.getenv("OPS_ALERT_EMAIL_FROM") or "ops@khatalens.app").strip()

    if resend_key:
        try:
            from http_client import get_shared_client

            async with get_shared_client() as http:
                resp = await http.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {resend_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": from_addr,
                        "to": [to_addr],
                        "subject": subject,
                        "text": body,
                    },
                )
            if resp.status_code >= 400:
                logger.warning("Resend alert failed: %s", resp.text)
                return False
            return True
        except Exception as e:
            logger.warning("Resend alert error: %s", e)
            return False

    smtp_host = (os.getenv("SMTP_HOST") or "").strip()
    if not smtp_host:
        logger.info("No email provider configured for ops alerts")
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to_addr
        msg.set_content(body)
        port = int(os.getenv("SMTP_PORT", "587") or "587")
        user = os.getenv("SMTP_USER") or ""
        password = os.getenv("SMTP_PASSWORD") or ""
        with smtplib.SMTP(smtp_host, port, timeout=15) as smtp:
            smtp.starttls()
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
        return True
    except Exception as e:
        logger.warning("SMTP alert failed: %s", e)
        return False


async def send_alert_whatsapp(body: str) -> bool:
    to_num = (os.getenv("OPS_ALERT_WHATSAPP_TO") or "").strip()
    if not to_num:
        return False
    try:
        from whatsapp_service import send_whatsapp_message

        await send_whatsapp_message(to_num, body)
        return True
    except Exception as e:
        logger.warning("WhatsApp ops alert failed: %s", e)
        return False


async def update_alert_state(admin_client, count: int, meta: dict) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "alert_key": ALERT_KEY,
        "last_fired_at": now_iso,
        "last_count": count,
        "meta": meta,
        "updated_at": now_iso,
    }
    try:
        # Upsert by alert_key
        existing = await get_alert_state(admin_client)
        if existing.get("id"):
            await (
                admin_client.table("ops_alert_state")
                .update(payload)
                .eq("id", existing["id"])
                .execute()
            )
        else:
            await admin_client.table("ops_alert_state").insert(payload).execute()
    except Exception as e:
        logger.warning("update_alert_state failed: %s", e)


async def run_spike_check(admin_client, *, force: bool = False) -> dict[str, Any]:
    threshold = spike_threshold()
    count, top_types = await count_recent_errors(admin_client, minutes=15)
    state = await get_alert_state(admin_client)
    ready = force or cooldown_elapsed(state)
    fired = False
    channels: list[str] = []

    result = {
        "alert_key": ALERT_KEY,
        "window_minutes": 15,
        "error_count": count,
        "threshold": threshold,
        "cooldown_minutes": cooldown_minutes(),
        "cooldown_ready": ready,
        "last_fired_at": state.get("last_fired_at"),
        "top_event_types": top_types,
        "fired": False,
        "channels": channels,
    }

    if count < threshold:
        return result
    if not ready:
        result["suppressed"] = "cooldown"
        return result

    subject = f"[KhataLens Ops] Error spike: {count} errors in 15m"
    body = (
        f"KhataLens ops alert\n"
        f"Errors in last 15 minutes: {count} (threshold {threshold})\n"
        f"Top types: {', '.join(top_types) or 'n/a'}\n"
        f"Open admin Ops → severity=error & resolved=open\n"
    )
    if await send_alert_email(subject, body):
        channels.append("email")
    if await send_alert_whatsapp(body[:900]):
        channels.append("whatsapp")
    if not channels:
        logger.warning("Spike threshold met but no alert channel succeeded/configured")
        channels.append("log_only")

    await update_alert_state(
        admin_client,
        count,
        {"top_event_types": top_types, "channels": channels},
    )
    result["fired"] = True
    result["channels"] = channels
    return result
