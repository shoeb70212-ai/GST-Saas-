"""
ITC-at-Risk rules engine (deterministic, no LLM).

Derives invoices.itc_eligibility + itc_risk_flags from recon status and GSTIN cache.
"""
from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")


def classify_invoice(
    inv: dict,
    gstin_status: str | None,
) -> tuple[str, list[str]]:
    """
    Return (itc_eligibility, flags) for one invoice.
    Preserves manual ineligible_17_5 if already set.
    """
    flags: list[str] = []
    existing = (inv.get("itc_eligibility") or "unknown").strip()

    # Manual Section 17(5) override — keep unless we only append flags
    if existing == "ineligible_17_5":
        flags.append("SECTION_17_5")
        return "ineligible_17_5", flags

    recon = (inv.get("recon_status") or "").strip()
    if recon == "missing_in_2b":
        flags.append("MISSING_IN_2B")

    status_norm = (gstin_status or "").strip().lower()
    # Also peek supplier_gstin_status JSONB if present
    if not status_norm and isinstance(inv.get("supplier_gstin_status"), dict):
        status_norm = str(
            inv["supplier_gstin_status"].get("status")
            or inv["supplier_gstin_status"].get("gstinStatus")
            or ""
        ).lower()

    if status_norm in ("cancelled", "suspended", "inactive"):
        flags.append("VENDOR_CANCELLED" if status_norm == "cancelled" else "VENDOR_SUSPENDED")

    if "SECTION_17_5" in (inv.get("itc_risk_flags") or []):
        flags.append("SECTION_17_5")

    if "SECTION_17_5" in flags:
        return "ineligible_17_5", list(dict.fromkeys(flags))
    if "VENDOR_CANCELLED" in flags or "VENDOR_SUSPENDED" in flags:
        return "blocked_vendor", list(dict.fromkeys(flags))
    if "MISSING_IN_2B" in flags:
        return "missing_2b", list(dict.fromkeys(flags))
    if recon == "matched":
        return "eligible", []
    return "unknown", list(dict.fromkeys(flags))


def _itc_amount(inv: dict) -> float:
    try:
        igst = float(inv.get("igst") or 0)
        cgst = float(inv.get("cgst") or 0)
        sgst = float(inv.get("sgst") or 0)
        total_tax = igst + cgst + sgst
        if total_tax > 0:
            return total_tax
        # Fallback: total - taxable
        total = float(inv.get("total_amount") or 0)
        taxable = float(inv.get("taxable_amount") or 0)
        return max(0.0, total - taxable)
    except (TypeError, ValueError):
        return 0.0


async def recompute_itc_risk(
    http_client,
    *,
    token: str,
    client_id: str,
    period: str | None = None,
) -> dict[str, Any]:
    """
    Load invoices (+ optional recon_period filter), join gstin_cache, PATCH eligibility.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return {"updated": 0, "error": "supabase_not_configured"}

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    select = (
        "id,supplier_gstin,recon_status,recon_period,itc_eligibility,itc_risk_flags,"
        "supplier_gstin_status,igst,cgst,sgst,taxable_amount,total_amount,invoice_number,supplier_name"
    )
    url = f"{SUPABASE_URL}/rest/v1/invoices?client_id=eq.{client_id}&select={select}"
    if period:
        url += f"&recon_period=eq.{period}"

    resp = await http_client.get(url, headers={**headers, "Prefer": "return=representation"})
    if resp.status_code != 200:
        logger.warning("ITC risk: invoice fetch failed %s %s", resp.status_code, resp.text[:200])
        return {"updated": 0, "error": "fetch_failed"}

    invoices = resp.json() if isinstance(resp.json(), list) else []
    if not invoices:
        return {"updated": 0, "buckets": {}}

    gstins = sorted(
        {
            str(i.get("supplier_gstin") or "").strip().upper()
            for i in invoices
            if i.get("supplier_gstin")
        }
    )
    status_by_gstin: dict[str, str] = {}
    if gstins:
        # PostgREST: gstin=in.(a,b,c)
        in_list = ",".join(gstins)
        cache_url = (
            f"{SUPABASE_URL}/rest/v1/gstin_cache?gstin=in.({in_list})&select=gstin,status"
        )
        cache_resp = await http_client.get(
            cache_url, headers={**headers, "Prefer": "return=representation"}
        )
        if cache_resp.status_code == 200:
            for row in cache_resp.json() or []:
                status_by_gstin[str(row.get("gstin") or "").upper()] = row.get("status") or ""

    updated = 0
    for inv in invoices:
        g = str(inv.get("supplier_gstin") or "").strip().upper()
        elig, flags = classify_invoice(inv, status_by_gstin.get(g))
        old_elig = inv.get("itc_eligibility") or "unknown"
        old_flags = inv.get("itc_risk_flags") or []
        if isinstance(old_flags, str):
            old_flags = []
        if elig == old_elig and list(old_flags) == flags:
            continue
        patch = await http_client.patch(
            f"{SUPABASE_URL}/rest/v1/invoices?id=eq.{inv['id']}",
            headers=headers,
            json={"itc_eligibility": elig, "itc_risk_flags": flags},
        )
        if patch.status_code in (200, 204):
            updated += 1
            inv["itc_eligibility"] = elig
            inv["itc_risk_flags"] = flags

    return {"updated": updated, "invoice_count": len(invoices)}


def summarize_itc_risk(invoices: list[dict]) -> dict[str, Any]:
    buckets = {
        "blocked_vendor": {"count": 0, "amount": 0.0},
        "missing_2b": {"count": 0, "amount": 0.0},
        "ineligible_17_5": {"count": 0, "amount": 0.0},
        "eligible": {"count": 0, "amount": 0.0},
        "unknown": {"count": 0, "amount": 0.0},
    }
    risk_rows = []
    for inv in invoices:
        elig = inv.get("itc_eligibility") or "unknown"
        amt = _itc_amount(inv)
        if elig not in buckets:
            elig = "unknown"
        buckets[elig]["count"] += 1
        buckets[elig]["amount"] = round(buckets[elig]["amount"] + amt, 2)
        if elig in ("blocked_vendor", "missing_2b", "ineligible_17_5"):
            risk_rows.append(
                {
                    "id": inv.get("id"),
                    "supplier_name": inv.get("supplier_name"),
                    "supplier_gstin": inv.get("supplier_gstin"),
                    "invoice_number": inv.get("invoice_number"),
                    "invoice_date": inv.get("invoice_date"),
                    "itc_eligibility": elig,
                    "itc_risk_flags": inv.get("itc_risk_flags") or [],
                    "itc_amount": round(amt, 2),
                    "taxable_amount": inv.get("taxable_amount"),
                    "recon_status": inv.get("recon_status"),
                }
            )

    risk_rows.sort(key=lambda r: r.get("itc_amount") or 0, reverse=True)
    blocked_total = (
        buckets["blocked_vendor"]["amount"]
        + buckets["missing_2b"]["amount"]
        + buckets["ineligible_17_5"]["amount"]
    )
    return {
        "buckets": buckets,
        "blocked_itc_total": round(blocked_total, 2),
        "invoices": risk_rows[:200],
    }
