"""
IMS helpers: parse portal JSON, map actions, deemed-accept dates, PR sync keys.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

from match_utils import clean_str, normalize_invoice_number

ACTION_MAP = {
    "p": "pending",
    "pending": "pending",
    "n": "pending",  # no action / new
    "a": "accepted",
    "accept": "accepted",
    "accepted": "accepted",
    "r": "rejected",
    "reject": "rejected",
    "rejected": "rejected",
}


def period_end_date(period: str) -> date | None:
    """period MM-YYYY → last calendar day of month."""
    try:
        month_str, year_str = period.split("-")
        month, year = int(month_str), int(year_str)
        last = calendar.monthrange(year, month)[1]
        return date(year, month, last)
    except Exception:
        return None


def deemed_accept_by(period: str, *, days: int = 30) -> str | None:
    end = period_end_date(period)
    if not end:
        return None
    return (end + timedelta(days=days)).isoformat()


def map_ims_action(raw: Any) -> str:
    if raw is None or raw == "":
        return "pending"
    key = str(raw).strip().lower()
    return ACTION_MAP.get(key, "pending")


def extract_invoice_list(payload: Any) -> list[dict]:
    """Accept {invoices:[...]}, {ims:[...]}, {data:{b2b:[...]}} or bare array."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("invoices", "ims", "IMS", "b2b", "B2B"):
        val = payload.get(key)
        if isinstance(val, list):
            return [x for x in val if isinstance(x, dict)]
    data = payload.get("data")
    if isinstance(data, dict):
        for key in ("invoices", "b2b", "B2B", "ims"):
            val = data.get(key)
            if isinstance(val, list):
                return [x for x in val if isinstance(x, dict)]
    # Nested GST portal style: docdata / maindata
    for nest in ("docdata", "maindata", "reqdata"):
        nested = payload.get(nest)
        if isinstance(nested, dict):
            found = extract_invoice_list(nested)
            if found:
                return found
    return []


def normalize_ims_row(raw: dict, *, period: str, user_id: str, client_id: str) -> dict | None:
    gstin = str(
        raw.get("ctin")
        or raw.get("supplier_gstin")
        or raw.get("gstin")
        or raw.get("GSTIN")
        or ""
    ).strip()
    inv = str(
        raw.get("inum")
        or raw.get("invoice_number")
        or raw.get("inv_num")
        or raw.get("InvoiceNumber")
        or ""
    ).strip()
    if not gstin and not inv:
        return None

    taxable = raw.get("txval")
    if taxable is None:
        taxable = raw.get("taxable_value") or raw.get("taxable_amount") or 0
    try:
        taxable_f = float(taxable or 0)
    except (TypeError, ValueError):
        taxable_f = 0.0

    def _tax(keys: tuple[str, ...]) -> float:
        for k in keys:
            if k in raw and raw[k] is not None:
                try:
                    return float(raw[k] or 0)
                except (TypeError, ValueError):
                    return 0.0
        return 0.0

    action = map_ims_action(
        raw.get("action") or raw.get("ims_action") or raw.get("status")
    )
    return {
        "user_id": user_id,
        "client_id": client_id,
        "period": period,
        "supplier_gstin": gstin.upper(),
        "invoice_number": inv,
        "invoice_date": str(
            raw.get("idt") or raw.get("invoice_date") or raw.get("date") or ""
        ),
        "taxable_value": taxable_f,
        "igst": _tax(("iamt", "igst")),
        "cgst": _tax(("camt", "cgst")),
        "sgst": _tax(("samt", "sgst")),
        "ims_action": action,
        "deemed_accept_by": deemed_accept_by(period) if action == "pending" else None,
        "raw_json": {str(k): v for k, v in raw.items() if v is not None},
    }


def match_key(gstin: Any, invoice_number: Any) -> str:
    return f"{clean_str(gstin)}_{normalize_invoice_number(invoice_number)}"


def summarize_ims(rows: list[dict], *, today: date | None = None) -> dict:
    today = today or date.today()
    counts = {"pending": 0, "accepted": 0, "rejected": 0}
    deemed_soon = 0
    enriched = []
    for r in rows:
        action = r.get("ims_action") or "pending"
        if action in counts:
            counts[action] += 1
        days_left = None
        dab = r.get("deemed_accept_by")
        if action == "pending" and dab:
            try:
                if isinstance(dab, date):
                    d = dab
                else:
                    d = date.fromisoformat(str(dab)[:10])
                days_left = (d - today).days
                if 0 <= days_left <= 7:
                    deemed_soon += 1
            except ValueError:
                days_left = None
        enriched.append({**r, "days_to_deemed": days_left})
    return {
        "counts": counts,
        "deemed_soon": deemed_soon,
        "total": len(rows),
        "records": enriched,
    }


def sync_ims_status_updates(
    invoices: list[dict],
    ims_rows: list[dict],
) -> list[dict]:
    """
    Return invoice patches {id, ims_status}.
    PR in IMS → use IMS action; PR not in IMS → not_in_ims if previously unknown/pending.
    """
    ims_by_key: dict[str, str] = {}
    for r in ims_rows:
        ims_by_key[match_key(r.get("supplier_gstin"), r.get("invoice_number"))] = (
            r.get("ims_action") or "pending"
        )

    updates = []
    for inv in invoices:
        key = match_key(inv.get("supplier_gstin"), inv.get("invoice_number"))
        if key in ims_by_key:
            status = ims_by_key[key]
        else:
            status = "not_in_ims"
        if (inv.get("ims_status") or "unknown") != status:
            updates.append({"id": inv["id"], "ims_status": status})
    return updates
