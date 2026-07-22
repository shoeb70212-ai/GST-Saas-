"""
Heuristic field hints from OCR text (no LLM).

Used by Phase E to estimate whether classical OCR *read* critical GST fields
well enough to ground a later text-only normalize step. Not a full extractor —
GSTIN / amount presence is reliable; invoice numbers are best scored via
substring grounding against gold.
"""
from __future__ import annotations

import re
from typing import Any

from validators import normalize_gstin

# Official GSTIN shape (loose — checksum validated separately if needed).
_GSTIN_RE = re.compile(
    r"\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9])\b",
    re.IGNORECASE,
)
# Indian-style amounts: 1,23,456.78 or 123456.78
_AMOUNT_RE = re.compile(
    r"(?<![A-Z0-9/])(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+\.\d{1,2})(?![A-Z0-9])"
)
_DATE_RE = re.compile(
    r"\b(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b"
)


def _parse_amount(raw: str) -> float | None:
    try:
        return round(float(raw.replace(",", "")), 2)
    except (TypeError, ValueError):
        return None


def extract_gstins(text: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for m in _GSTIN_RE.finditer(text or ""):
        g = normalize_gstin(m.group(1))
        if g and g not in seen:
            seen.add(g)
            found.append(g)
    return found


def extract_amounts(text: str) -> list[float]:
    out: list[float] = []
    for m in _AMOUNT_RE.finditer(text or ""):
        v = _parse_amount(m.group(1))
        if v is not None and v not in out:
            out.append(v)
    return out


def extract_dates(text: str) -> list[str]:
    return [m.group(1).strip() for m in _DATE_RE.finditer(text or "")]


def hint_fields_from_ocr(text: str) -> dict[str, Any]:
    """
    Best-effort schema-ish dict from OCR text alone.

    Only fills fields we can detect with high precision (GSTINs). Amounts/dates
    are listed as candidates; callers use grounding against gold for accuracy.
    """
    gstins = extract_gstins(text)
    amounts = extract_amounts(text)
    dates = extract_dates(text)
    out: dict[str, Any] = {
        "Supplier_GSTIN": gstins[0] if gstins else None,
        "Buyer_GSTIN": gstins[1] if len(gstins) > 1 else None,
        "Invoice_Date": dates[0] if dates else None,
        # Prefer largest amount as Total_Amount candidate (common invoice layout).
        "Total_Amount": max(amounts) if amounts else None,
        "_ocr_gstins": gstins,
        "_ocr_amounts": amounts,
        "_ocr_dates": dates,
    }
    return out


def gold_value_in_text(field: str, gold_value: Any, text: str) -> bool | None:
    """
    Return True if the gold value is grounded in OCR text.

    None = gold empty / not scorables for this field.
    """
    if gold_value is None or gold_value == "":
        return None
    hay = (text or "").upper()
    if field.endswith("GSTIN"):
        g = normalize_gstin(str(gold_value))
        compact = re.sub(r"[\s\-]", "", text or "").upper()
        return bool(g) and g in compact
    if field.endswith("_Amount") or field in ("Taxable_Amount", "Total_Amount"):
        try:
            target = round(float(gold_value), 2)
        except (TypeError, ValueError):
            return None
        # Match with and without commas / trailing .0
        candidates = {
            f"{target:.2f}",
            f"{target:.0f}" if target == int(target) else f"{target:.2f}",
            f"{target:,.2f}",
            str(int(target)) if target == int(target) else f"{target:.2f}",
        }
        compact = hay.replace(",", "").replace(" ", "")
        for c in candidates:
            if c.replace(",", "") in compact:
                return True
        # Fuzzy ±1.0 via extracted amounts
        for amt in extract_amounts(text):
            if abs(amt - target) <= 1.0:
                return True
        return False
    needle = str(gold_value).strip().upper().replace(" ", "")
    if not needle:
        return None
    return needle in hay.replace(" ", "")
