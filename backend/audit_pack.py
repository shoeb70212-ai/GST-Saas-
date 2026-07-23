"""
Audit claim-code multi-sheet Excel pack (deterministic).
"""
from __future__ import annotations

import io
from typing import Any

import pandas as pd

# Priority documented in classify_audit_row (worst risk first)


def _itc_amount(inv: dict) -> float:
    try:
        tax = float(inv.get("igst") or 0) + float(inv.get("cgst") or 0) + float(inv.get("sgst") or 0)
        if tax > 0:
            return tax
        return max(0.0, float(inv.get("total_amount") or 0) - float(inv.get("taxable_amount") or 0))
    except (TypeError, ValueError):
        return 0.0


def classify_audit_row(inv: dict) -> tuple[str, str]:
    """
    Return (audit_code, sheet_name) for one invoice.
    Exclusive buckets by priority.
    """
    elig = (inv.get("itc_eligibility") or "unknown").strip()
    recon = (inv.get("recon_status") or "").strip()
    ims = (inv.get("ims_status") or "unknown").strip()

    if elig == "ineligible_17_5":
        return "INELIGIBLE_17_5", "Ineligible_17_5"
    if elig == "blocked_vendor":
        return "BLOCKED_VENDOR", "Blocked_Vendor"
    if recon == "mismatch":
        return "REBOOK", "Rebook"
    if (
        recon == "missing_in_2b"
        or elig == "missing_2b"
        or ims == "pending"
    ):
        return "FOLLOW_UP", "Follow_Up"
    if recon == "matched" and elig in ("eligible", "unknown"):
        return "CLAIM", "Claim_Now"
    if recon == "matched" and elig == "eligible":
        return "CLAIM", "Claim_Now"
    return "EXCLUDED", "Excluded"


def invoice_to_pack_row(inv: dict) -> dict[str, Any]:
    code, sheet = classify_audit_row(inv)
    return {
        "audit_code": code,
        "sheet": sheet,
        "invoice_id": inv.get("id"),
        "supplier_name": inv.get("supplier_name"),
        "supplier_gstin": inv.get("supplier_gstin"),
        "invoice_number": inv.get("invoice_number"),
        "invoice_date": inv.get("invoice_date"),
        "taxable_amount": inv.get("taxable_amount"),
        "total_amount": inv.get("total_amount"),
        "itc_amount": round(_itc_amount(inv), 2),
        "recon_status": inv.get("recon_status"),
        "itc_eligibility": inv.get("itc_eligibility"),
        "itc_risk_flags": inv.get("itc_risk_flags"),
        "ims_status": inv.get("ims_status"),
        "error_message": inv.get("error_message"),
    }


def build_claim_pack_sheets(invoices: list[dict]) -> dict[str, list[dict]]:
    buckets: dict[str, list[dict]] = {
        "Claim_Now": [],
        "Follow_Up": [],
        "Rebook": [],
        "Ineligible_17_5": [],
        "Blocked_Vendor": [],
        "Excluded": [],
    }
    for inv in invoices:
        row = invoice_to_pack_row(inv)
        sheet = row.pop("sheet")
        buckets.setdefault(sheet, []).append(row)

    summary_rows = []
    for sheet_name, rows in buckets.items():
        amt = sum(float(r.get("itc_amount") or 0) for r in rows)
        summary_rows.append(
            {
                "sheet": sheet_name,
                "audit_code": rows[0]["audit_code"] if rows else "",
                "count": len(rows),
                "itc_amount": round(amt, 2),
            }
        )
    return {"Summary": summary_rows, **buckets}


def build_claim_pack_xlsx(invoices: list[dict]) -> bytes:
    sheets = build_claim_pack_sheets(invoices)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        for name, rows in sheets.items():
            df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=["audit_code"])
            df.to_excel(writer, index=False, sheet_name=name[:31])
    output.seek(0)
    return output.read()
