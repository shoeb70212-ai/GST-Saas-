"""
Deterministic validators for extracted invoice fields.

No LLM. Used by extraction confidence, export gates, and the bench harness.
"""

from __future__ import annotations

import re
from typing import Any

MATH_TOLERANCE = 1.0  # INR

GSTIN_REGEX = re.compile(
    r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
)
PAN_IN_GSTIN_REGEX = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def normalize_gstin(raw: str | None) -> str:
    if not raw:
        return ""
    return re.sub(r"[\s\-]", "", str(raw)).upper()


def gstin_check_char(gstin14: str) -> str | None:
    """
    GSTIN check character (Luhn mod-36 over first 14 chars).

    Factor alternates 1, 2, 1, 2, … by 0-based index.
    Charset: 0-9A-Z. For each product: add quotient + remainder when / 36.
    """
    if len(gstin14) != 14:
        return None
    total = 0
    for i, ch in enumerate(gstin14):
        idx = _CHARSET.find(ch)
        if idx < 0:
            return None
        factor = 1 if i % 2 == 0 else 2
        product = idx * factor
        q, r = divmod(product, 36)
        total += q + r
    check_val = (36 - (total % 36)) % 36
    return _CHARSET[check_val]


def validate_gstin(raw: str | None) -> dict[str, Any]:
    """
    Returns {ok, normalized, errors[], warnings[], pan, state_code}.
    """
    errors: list[str] = []
    warnings: list[str] = []
    n = normalize_gstin(raw)
    if not n:
        return {
            "ok": False,
            "normalized": "",
            "errors": ["missing"],
            "warnings": [],
            "pan": None,
            "state_code": None,
        }
    if len(n) != 15:
        errors.append(f"length_{len(n)}")
    if not GSTIN_REGEX.match(n):
        errors.append("format")
    pan = n[2:12] if len(n) >= 12 else None
    if pan and not PAN_IN_GSTIN_REGEX.match(pan):
        errors.append("pan_in_gstin")
    if len(n) == 15 and n[13] != "Z":
        errors.append("missing_z")
    if len(n) == 15:
        expected = gstin_check_char(n[:14])
        if expected is None:
            errors.append("checksum_uncomputable")
        elif n[14] != expected:
            errors.append(f"checksum_expected_{expected}")
    return {
        "ok": len(errors) == 0,
        "normalized": n,
        "errors": errors,
        "warnings": warnings,
        "pan": pan if pan and PAN_IN_GSTIN_REGEX.match(pan or "") else pan,
        "state_code": n[:2] if len(n) >= 2 else None,
    }


def _f(v: Any) -> float:
    try:
        if v is None or v == "":
            return 0.0
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def validate_tax_arithmetic(extracted: dict, *, tolerance: float = MATH_TOLERANCE) -> dict[str, Any]:
    """
    Check line math and header totals.

    Issues are strings; ok=False if any hard financial mismatch.
    """
    issues: list[str] = []
    line_items = extracted.get("Line_Items") or extracted.get("line_items") or []
    taxable = _f(extracted.get("Taxable_Amount") or extracted.get("taxable_amount"))
    cgst = _f(extracted.get("CGST_Amount") or extracted.get("cgst_amount"))
    sgst = _f(extracted.get("SGST_Amount") or extracted.get("sgst_amount"))
    igst = _f(extracted.get("IGST_Amount") or extracted.get("igst_amount"))
    cess = _f(extracted.get("Cess_Amount") or extracted.get("cess_amount"))
    round_off = _f(extracted.get("Round_Off") or extracted.get("round_off"))
    total = _f(extracted.get("Total_Amount") or extracted.get("total_amount"))

    line_sum = 0.0
    for i, item in enumerate(line_items):
        amt = _f(item.get("Amount") or item.get("amount"))
        qty = item.get("Quantity") if "Quantity" in item else item.get("quantity")
        rate = item.get("Unit_Price") if "Unit_Price" in item else item.get("unit_price")
        line_sum += amt
        if qty is not None and rate is not None:
            expected = round(_f(qty) * _f(rate), 2)
            if abs(expected - amt) > tolerance and amt > 0:
                issues.append(f"line_{i}_qty_rate_mismatch")

    if line_items and taxable > 0 and abs(line_sum - taxable) > tolerance:
        issues.append(
            f"line_sum_vs_taxable diff={round(line_sum - taxable, 2)}"
        )

    tax_sum = cgst + sgst + igst + cess
    computed = round(taxable + tax_sum + round_off, 2) if taxable or tax_sum else 0.0
    # Only reconcile taxable+tax vs total when tax components are present.
    # Taxable_Amount alone (common in thin extracts / unit fixtures) must not
    # flag a false mismatch against invoice total (which includes GST).
    if tax_sum > 0 and total > 0 and abs(computed - total) > tolerance:
        issues.append(f"header_total_mismatch computed={computed} total={total}")

    if cgst > 0 and igst > 0:
        issues.append("mixed_cgst_igst")

    hard = [x for x in issues if not x.startswith("mixed_")]
    return {
        "ok": len(hard) == 0,
        "issues": issues,
        "line_sum": round(line_sum, 2),
        "computed_total": computed,
        "tolerance": tolerance,
    }


def validate_extraction(extracted: dict) -> dict[str, Any]:
    """Aggregate validators for confidence / bench."""
    gstin = validate_gstin(
        extracted.get("Supplier_GSTIN") or extracted.get("supplier_gstin")
    )
    buyer = validate_gstin(
        extracted.get("Buyer_GSTIN") or extracted.get("buyer_gstin")
    )
    math = validate_tax_arithmetic(extracted)
    return {
        "ok": gstin["ok"] and math["ok"],
        "supplier_gstin": gstin,
        "buyer_gstin": buyer,
        "tax_arithmetic": math,
    }
