"""
Platform-admin health aggregations over ops_events + organizations.

Kept separate from admin_routes.py so the HTTP surface stays thin.
"""
from __future__ import annotations

import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_LOW_CREDIT_THRESHOLD = 20
DEFAULT_AI_COST_MINI_PER_1K = 0.15  # INR rough default — override via env
DEFAULT_AI_COST_VERIFY_PER_1K = 1.2


def parse_window(window: str | None) -> timedelta:
    raw = (window or "24h").strip().lower()
    if raw in ("7d", "7day", "7days"):
        return timedelta(days=7)
    if raw in ("1h", "1hour"):
        return timedelta(hours=1)
    # default 24h
    return timedelta(hours=24)


def window_start_iso(window: str | None) -> str:
    delta = parse_window(window)
    return (datetime.now(timezone.utc) - delta).isoformat()


def _is_test_org_name(name: str | None) -> bool:
    return "khatalens-test" in (name or "").lower()


async def fetch_ops_since(admin_client, since_iso: str, columns: str = "*") -> list[dict]:
    try:
        resp = (
            await admin_client.table("ops_events")
            .select(columns)
            .gte("created_at", since_iso)
            .order("created_at", desc=True)
            .limit(5000)
            .execute()
        )
        return list(resp.data or [])
    except Exception as e:
        logger.warning("fetch_ops_since failed: %s", e)
        return []


def refund_status_from_meta(meta: Any) -> str:
    if not isinstance(meta, dict):
        return "unknown"
    if meta.get("refunded") is True or meta.get("credit_outcome") == "refunded":
        return "refunded"
    outcome = meta.get("credit_outcome")
    if outcome in ("deduct_failed", "no_charge", "refund_failed"):
        return str(outcome)
    if meta.get("refunded") is False:
        return "not_refunded"
    return "unknown"


async def health_credits(admin_client, window: str = "24h") -> dict:
    threshold = int(os.getenv("ADMIN_LOW_CREDIT_THRESHOLD", str(DEFAULT_LOW_CREDIT_THRESHOLD)) or DEFAULT_LOW_CREDIT_THRESHOLD)
    since = window_start_iso(window)

    low_balance_orgs: list[dict] = []
    try:
        orgs_resp = (
            await admin_client.table("organizations")
            .select("id, name, credits, created_at, suspended_at, is_test_archived")
            .lt("credits", threshold)
            .order("credits", desc=False)
            .limit(50)
            .execute()
        )
        for row in orgs_resp.data or []:
            if row.get("is_test_archived"):
                continue
            name = row.get("name") or ""
            if _is_test_org_name(name):
                continue
            low_balance_orgs.append(
                {
                    "org_id": row.get("id"),
                    "name": name or "Unknown firm",
                    "credits": int(row.get("credits") or 0),
                    "suspended": bool(row.get("suspended_at")),
                }
            )
    except Exception as e:
        logger.warning("health_credits orgs query failed: %s", e)

    events = await fetch_ops_since(
        admin_client,
        since,
        "event_type, severity, org_id, meta, created_at",
    )
    refund_events = 0
    deduct_failed = 0
    for ev in events:
        et = (ev.get("event_type") or "").lower()
        meta = ev.get("meta") if isinstance(ev.get("meta"), dict) else {}
        if et == "credit_refund" or meta.get("credit_outcome") == "refunded" or meta.get("refunded") is True:
            refund_events += 1
        if et == "credit_deduct_failed" or meta.get("credit_outcome") == "deduct_failed":
            deduct_failed += 1

    return {
        "window": window,
        "low_credit_threshold": threshold,
        "low_balance_orgs": low_balance_orgs[:20],
        "refund_events": refund_events,
        "deduct_failed": deduct_failed,
    }


async def health_ai(admin_client, window: str = "24h") -> dict:
    since = window_start_iso(window)
    events = await fetch_ops_since(
        admin_client,
        since,
        "event_type, severity, model_used, tokens_used, meta, created_at",
    )
    tokens_total = 0
    by_model: dict[str, int] = defaultdict(int)
    escalate = 0
    extractish = 0
    scan_count = 0
    cost_sum = 0.0
    cost_n = 0
    cache_hits = 0
    field_conf_sum = 0.0
    field_conf_n = 0
    for ev in events:
        tokens = ev.get("tokens_used") or 0
        try:
            tokens_i = int(tokens)
        except (TypeError, ValueError):
            tokens_i = 0
        tokens_total += tokens_i
        model = (ev.get("model_used") or "unknown").strip() or "unknown"
        by_model[model] += tokens_i
        et = ev.get("event_type") or ""
        meta = ev.get("meta") if isinstance(ev.get("meta"), dict) else {}
        if et == "escalated_to_verify":
            escalate += 1
        if et in (
            "escalated_to_verify",
            "needs_retry",
            "low_confidence",
            "duplicate_warning",
            "scan_success",
            "scan_cost",
        ) or (ev.get("severity") in ("info", "warning") and tokens_i > 0):
            extractish += 1
        if et == "scan_cost":
            scan_count += 1
            raw_cost = meta.get("estimated_cost_inr")
            try:
                if raw_cost is not None:
                    cost_sum += float(raw_cost)
                    cost_n += 1
            except (TypeError, ValueError):
                pass
            if meta.get("cache_hit") is True:
                cache_hits += 1
            raw_fc = meta.get("avg_field_confidence")
            try:
                if raw_fc is not None:
                    field_conf_sum += float(raw_fc)
                    field_conf_n += 1
            except (TypeError, ValueError):
                pass

    mini_rate = float(
        os.getenv("AI_COST_PER_1K_TOKENS_MINI", str(DEFAULT_AI_COST_MINI_PER_1K))
        or DEFAULT_AI_COST_MINI_PER_1K
    )
    verify_rate = float(
        os.getenv("AI_COST_PER_1K_TOKENS_VERIFY", str(DEFAULT_AI_COST_VERIFY_PER_1K))
        or DEFAULT_AI_COST_VERIFY_PER_1K
    )

    estimated = 0.0
    for model, toks in by_model.items():
        ml = model.lower()
        rate = verify_rate if ("4o" in ml and "mini" not in ml) or "verify" in ml or "gemini" in ml and "pro" in ml else mini_rate
        if "gpt-4o" in ml and "mini" not in ml:
            rate = verify_rate
        elif "mini" in ml:
            rate = mini_rate
        estimated += (toks / 1000.0) * rate

    escalate_rate = (escalate / extractish) if extractish else 0.0
    hours = parse_window(window).total_seconds() / 3600.0 or 24.0
    tokens_per_day = (tokens_total / hours) * 24.0 if hours else tokens_total
    avg_cost = round(cost_sum / cost_n, 4) if cost_n else None
    cache_hit_rate = round(cache_hits / scan_count, 4) if scan_count else None
    avg_field_conf = round(field_conf_sum / field_conf_n, 2) if field_conf_n else None

    return {
        "window": window,
        "tokens_total": tokens_total,
        "tokens_per_day_est": round(tokens_per_day, 1),
        "by_model": dict(by_model),
        "escalate_count": escalate,
        "extract_event_count": extractish,
        "escalate_rate": round(escalate_rate, 4),
        "estimated_cost_inr": round(estimated, 2),
        "rates_inr_per_1k": {"mini": mini_rate, "verify": verify_rate},
        "scan_count": scan_count,
        "avg_cost_per_scan_inr": avg_cost,
        "cache_hit_rate": cache_hit_rate,
        "avg_field_confidence": avg_field_conf,
    }


async def health_gstin(admin_client, window: str = "24h") -> dict:
    since = window_start_iso(window)
    events = await fetch_ops_since(admin_client, since, "event_type, meta, created_at")
    hits = misses = failures = 0
    for ev in events:
        et = ev.get("event_type") or ""
        if et == "gstin_cache_hit":
            hits += 1
        elif et == "gstin_cache_miss":
            misses += 1
        elif et == "gstin_verify_failure":
            failures += 1
    denom = hits + misses
    miss_rate = (misses / denom) if denom else 0.0
    return {
        "window": window,
        "cache_hits": hits,
        "cache_misses": misses,
        "verify_failures": failures,
        "miss_rate": round(miss_rate, 4),
    }


async def health_funnel(admin_client, days: int = 7) -> dict:
    days = max(1, min(int(days or 7), 30))
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    per_day: dict[str, int] = defaultdict(int)
    zero_client: list[dict] = []
    zero_invoice: list[dict] = []

    try:
        orgs_resp = (
            await admin_client.table("organizations")
            .select("id, name, owner_id, created_at, is_test_archived")
            .gte("created_at", since)
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        orgs = [o for o in (orgs_resp.data or []) if not o.get("is_test_archived") and not _is_test_org_name(o.get("name"))]
        for o in orgs:
            created = (o.get("created_at") or "")[:10]
            if created:
                per_day[created] += 1
    except Exception as e:
        logger.warning("health_funnel orgs failed: %s", e)
        orgs = []

    # Zombie scan: sample recent orgs (broader than signup window)
    try:
        all_orgs_resp = (
            await admin_client.table("organizations")
            .select("id, name, owner_id, created_at, is_test_archived")
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        candidates = [
            o
            for o in (all_orgs_resp.data or [])
            if not o.get("is_test_archived") and not _is_test_org_name(o.get("name"))
        ]
        owner_ids = [o.get("owner_id") for o in candidates if o.get("owner_id")]
        client_counts: dict[str, int] = defaultdict(int)
        invoice_counts: dict[str, int] = defaultdict(int)
        if owner_ids:
            try:
                clients_resp = (
                    await admin_client.table("clients")
                    .select("user_id")
                    .in_("user_id", owner_ids[:100])
                    .execute()
                )
                for c in clients_resp.data or []:
                    uid = c.get("user_id")
                    if uid:
                        client_counts[uid] += 1
            except Exception as e:
                logger.warning("health_funnel clients failed: %s", e)
            try:
                usage_resp = (
                    await admin_client.table("tenant_usage")
                    .select("user_id, invoice_count")
                    .in_("user_id", owner_ids[:100])
                    .execute()
                )
                for row in usage_resp.data or []:
                    uid = row.get("user_id")
                    if uid:
                        invoice_counts[uid] = int(row.get("invoice_count") or 0)
            except Exception as e:
                logger.warning("health_funnel usage failed: %s", e)

        for o in candidates:
            uid = o.get("owner_id")
            entry = {
                "org_id": o.get("id"),
                "name": o.get("name") or "Unknown",
                "owner_id": uid,
                "created_at": o.get("created_at"),
            }
            if uid and client_counts.get(uid, 0) == 0:
                zero_client.append(entry)
            if uid and invoice_counts.get(uid, 0) == 0:
                zero_invoice.append(entry)
    except Exception as e:
        logger.warning("health_funnel zombie scan failed: %s", e)

    orgs_created_per_day = [
        {"date": d, "count": per_day[d]} for d in sorted(per_day.keys())
    ]
    return {
        "days": days,
        "orgs_created_per_day": orgs_created_per_day,
        "zero_client_orgs": zero_client[:20],
        "zero_invoice_orgs": zero_invoice[:20],
    }


async def health_channels(admin_client, window: str = "24h") -> dict:
    since = window_start_iso(window)
    events = await fetch_ops_since(admin_client, since, "channel, severity, created_at")
    channels = ("scan", "batch", "public", "whatsapp")
    stats = {ch: {"total": 0, "errors": 0, "error_rate": 0.0} for ch in channels}
    for ev in events:
        ch = ev.get("channel")
        if ch not in stats:
            continue
        stats[ch]["total"] += 1
        if (ev.get("severity") or "").lower() == "error":
            stats[ch]["errors"] += 1
    for ch, s in stats.items():
        s["error_rate"] = round((s["errors"] / s["total"]) if s["total"] else 0.0, 4)
    return {"window": window, "note": "Ops-weighted volume (biased toward failures/warnings)", "channels": stats}


async def health_quality(admin_client, window: str = "24h") -> dict:
    since = window_start_iso(window)
    events = await fetch_ops_since(
        admin_client,
        since,
        "event_type, extraction_state, confidence_score, created_at",
    )
    needs_retry = needs_review = duplicate = 0
    scores: list[float] = []
    for ev in events:
        et = ev.get("event_type") or ""
        state = ev.get("extraction_state") or ""
        if et == "needs_retry" or state == "needs_retry":
            needs_retry += 1
        if et == "low_confidence" or state == "needs_review":
            needs_review += 1
        if et == "duplicate_warning" or state == "duplicate_warning":
            duplicate += 1
        if ev.get("confidence_score") is not None:
            try:
                scores.append(float(ev["confidence_score"]))
            except (TypeError, ValueError):
                pass
    total = len(events) or 1
    avg_conf = round(sum(scores) / len(scores), 2) if scores else None
    return {
        "window": window,
        "event_count": len(events),
        "needs_retry": needs_retry,
        "needs_retry_rate": round(needs_retry / total, 4),
        "needs_review": needs_review,
        "needs_review_rate": round(needs_review / total, 4),
        "duplicate_warning": duplicate,
        "duplicate_rate": round(duplicate / total, 4),
        "avg_confidence_score": avg_conf,
    }


async def health_summary(admin_client, window: str = "24h") -> dict:
    credits = await health_credits(admin_client, window)
    ai = await health_ai(admin_client, window)
    gstin = await health_gstin(admin_client, window)
    channels = await health_channels(admin_client, window)
    quality = await health_quality(admin_client, window)
    funnel = await health_funnel(admin_client, days=7 if parse_window(window).days >= 7 else 7)
    return {
        "window": window,
        "credits": credits,
        "ai": ai,
        "gstin": gstin,
        "channels": channels,
        "quality": quality,
        "funnel": funnel,
    }
