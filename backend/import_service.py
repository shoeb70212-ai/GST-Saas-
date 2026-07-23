"""
Purchase-Register importer → `invoices` rows.

Milestone 1 — "Reconcile without scanning": turn an uploaded Purchase Register
(CSV/Excel, ideally a Tally export) into exactly the snake_case ``invoice_data``
+ ``line_items`` JSON shape that ``save_invoice_atomic`` already accepts, so the
whole reconciliation / ITC / IMS value chain runs with zero scans and zero AI
credits.

Deterministic + pure (no LLM). Reuses the battle-tested column-detection and
currency/date parsing from ``converter_service`` and the GSTIN / tax-math
validators from ``validators``.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import pandas as pd

from converter_service import (
    _cell_str,
    _find_col,
    _norm_header,
    _to_float,
    detect_doc_type_from_dataframe,
    read_tabular_file,
    # base alias sets (extended below with PR-specific variants)
    _AMOUNT_ALIASES,
    _CESS_ALIASES,
    _CGST_ALIASES,
    _DATE_ALIASES,
    _GSTIN_ALIASES,
    _IGST_ALIASES,
    _NARRATION_ALIASES,
    _PARTY_ALIASES,
    _SGST_ALIASES,
    _TAXABLE_ALIASES,
    _VOUCHER_NO_ALIASES,
)
from validators import (
    normalize_gstin,
    repair_gstin_ocr,
    validate_gstin,
    validate_tax_arithmetic,
)

logger = logging.getLogger(__name__)

# Cap how many rows we return in a preview payload (full file is still parsed
# server-side for the summary counts).
PREVIEW_ROW_CAP = 200

# ---------------------------------------------------------------------------
# PR-specific column aliases (extend the reusable converter_service sets)
# ---------------------------------------------------------------------------

_SUPPLIER_GSTIN_ALIASES = _GSTIN_ALIASES | {
    "gstin of supplier", "gstin/uin of supplier", "supplier gstin/uin",
    "supplier gst no", "supplier gstin no", "supplier gst number",
    "vendor gstin", "vendor gst no", "gstin no", "gst no", "gstin number",
    "gst number", "gstin/uin", "gstin uin",
}
_INVOICE_NO_ALIASES = _VOUCHER_NO_ALIASES | {
    "invoice no", "invoice no.", "invoice number", "supplier invoice no",
    "supplier invoice number", "document number", "document no", "doc number",
}
_INVOICE_DATE_ALIASES = _DATE_ALIASES | {
    "invoice date", "bill date", "document date", "doc date", "date of invoice",
    "date of supply",
}
_SUPPLIER_NAME_ALIASES = _PARTY_ALIASES | {
    "supplier", "supplier name", "vendor", "vendor name", "name of supplier",
    "trade/legal name", "legal name", "trade name",
}
_TAXABLE_PR_ALIASES = _TAXABLE_ALIASES | {
    "taxable value", "taxable amount", "assessable value", "taxable val",
}
_TOTAL_PR_ALIASES = _AMOUNT_ALIASES | {
    "invoice value", "invoice total", "total value", "total amount",
    "grand total", "total invoice value", "bill value",
}
_HSN_ALIASES = {
    "hsn", "sac", "hsn/sac", "hsn sac", "hsn code", "sac code", "hsn/sac code",
}
_TAX_RATE_ALIASES = {
    "rate", "tax rate", "gst rate", "gst %", "rate (%)", "tax %", "rate%",
}
_PLACE_OF_SUPPLY_ALIASES = {
    "place of supply", "pos", "supply place", "place of supply (pos)",
}

# Ordered so the UI shows required-first. field -> alias set.
_FIELD_ALIASES: dict[str, set[str]] = {
    "supplier_gstin": _SUPPLIER_GSTIN_ALIASES,
    "invoice_number": _INVOICE_NO_ALIASES,
    "invoice_date": _INVOICE_DATE_ALIASES,
    "supplier_name": _SUPPLIER_NAME_ALIASES,
    "taxable_amount": _TAXABLE_PR_ALIASES,
    "cgst_amount": _CGST_ALIASES,
    "sgst_amount": _SGST_ALIASES,
    "igst_amount": _IGST_ALIASES,
    "cess_amount": _CESS_ALIASES,
    "total_amount": _TOTAL_PR_ALIASES,
    "place_of_supply": _PLACE_OF_SUPPLY_ALIASES,
    "hsn_sac": _HSN_ALIASES,
    "tax_rate": _TAX_RATE_ALIASES,
    "narration": _NARRATION_ALIASES,
}

# Fields the reconciliation value-chain effectively needs.
REQUIRED_FIELDS = ("supplier_gstin", "invoice_number", "invoice_date")

_MONEY_FIELDS = (
    "taxable_amount", "cgst_amount", "sgst_amount", "igst_amount",
    "cess_amount", "total_amount",
)


# ---------------------------------------------------------------------------
# Readers
# ---------------------------------------------------------------------------

def read_purchase_register(content: bytes, filename: str) -> pd.DataFrame:
    """Read a CSV/Excel purchase register into a DataFrame.

    Thin wrapper over :func:`converter_service.read_tabular_file` (Tally XML is a
    documented TODO — export as Excel/CSV from Tally for now).
    """
    return read_tabular_file(content, filename)


def _to_iso_date(val: Any) -> Optional[str]:
    """Normalize a cell to ISO ``YYYY-MM-DD`` (Indian day-first), else None.

    Mirrors the frontend ``formatDateToIso`` plus pandas Timestamp handling from
    ``converter_service.register_df_to_document``.
    """
    if val is None:
        return None
    if isinstance(val, float) and pd.isna(val):
        return None
    # pandas Timestamp / datetime
    if hasattr(val, "strftime") and not isinstance(val, str):
        try:
            return val.strftime("%Y-%m-%d")
        except Exception:
            pass
    s = _cell_str(val)
    if not s:
        return None
    # Already ISO
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        iso = s[:10]
        try:
            pd.Timestamp(iso)
            return iso
        except Exception:
            pass
    # Day-first parse (DD-MM-YYYY, DD/MM/YYYY, etc.)
    try:
        ts = pd.to_datetime(s, dayfirst=True, errors="raise")
        if pd.isna(ts):
            return None
        return ts.strftime("%Y-%m-%d")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Column auto-detection
# ---------------------------------------------------------------------------

def auto_detect_columns(df: pd.DataFrame) -> dict[str, Any]:
    """Resolve header → field mapping for a purchase register.

    Returns ``{mapping, unmapped_required, detected_doc_type, doc_type_confidence,
    headers}`` where ``mapping`` is ``{field: header}`` for detected fields only.
    """
    cols = [str(c) for c in df.columns]
    mapping: dict[str, str] = {}
    for field, aliases in _FIELD_ALIASES.items():
        col = _find_col(cols, aliases)
        if col is not None and col not in mapping.values():
            mapping[field] = col

    unmapped_required = [f for f in REQUIRED_FIELDS if f not in mapping]
    doc_type, conf = detect_doc_type_from_dataframe(df)
    return {
        "mapping": mapping,
        "unmapped_required": unmapped_required,
        "detected_doc_type": doc_type.value,
        "doc_type_confidence": round(float(conf), 3),
        "headers": cols,
    }


def _resolve_mapping(
    df: pd.DataFrame, mapping: dict[str, str] | None
) -> dict[str, str]:
    """Merge user-supplied ``{field: header}`` overrides over auto-detection."""
    resolved = dict(auto_detect_columns(df)["mapping"])
    if mapping:
        valid_headers = {str(c) for c in df.columns}
        for field, header in mapping.items():
            if field in _FIELD_ALIASES and header and str(header) in valid_headers:
                resolved[field] = str(header)
    return resolved


# ---------------------------------------------------------------------------
# Dedupe
# ---------------------------------------------------------------------------

def compute_dedupe_key(invoice_data: dict[str, Any]) -> str:
    """Natural key mirroring the reconciliation match key: gstin|invoice_no."""
    gstin = normalize_gstin(invoice_data.get("supplier_gstin") or "")
    inv_no = _norm_header(invoice_data.get("invoice_number") or "")
    return f"{gstin}|{inv_no}"


# ---------------------------------------------------------------------------
# Per-row validation
# ---------------------------------------------------------------------------

def validate_import_row(invoice_data: dict[str, Any]) -> dict[str, Any]:
    """Validate a built ``invoice_data`` dict; reuse ``validators``.

    Returns ``{extraction_state, confidence_score, reasons, ok}`` where reasons
    mirror ``review_reasons`` shape (``{code, field, message, severity}``) so
    imported rows highlight in the grid exactly like scanned drafts.
    """
    reasons: list[dict[str, Any]] = []

    # Required-field presence
    for field in REQUIRED_FIELDS:
        if not invoice_data.get(field):
            reasons.append({
                "code": "field_missing",
                "field": field,
                "message": f"{field.replace('_', ' ').title()} is missing",
                "severity": "warning",
            })

    # GSTIN validation (attempt OCR-style repair only when it yields a valid one)
    raw_gstin = invoice_data.get("supplier_gstin")
    if raw_gstin:
        v = validate_gstin(raw_gstin)
        if not v["ok"]:
            repaired = repair_gstin_ocr(raw_gstin)
            if repaired.get("ok") and repaired.get("normalized"):
                invoice_data["supplier_gstin"] = repaired["normalized"]
            else:
                reasons.append({
                    "code": "gstin_invalid",
                    "field": "supplier_gstin",
                    "message": "Supplier GSTIN failed checksum/format validation",
                    "severity": "error",
                    "detail": v.get("errors") or [],
                })
        elif v.get("normalized"):
            invoice_data["supplier_gstin"] = v["normalized"]

    # Tax arithmetic (validators reads snake_case keys + line_items)
    math = validate_tax_arithmetic(invoice_data)
    if not math.get("ok"):
        reasons.append({
            "code": "tax_math",
            "field": "total_amount",
            "message": "Tax / total arithmetic does not reconcile",
            "severity": "error",
            "detail": math.get("issues") or [],
        })

    has_error = any(r["severity"] == "error" for r in reasons)
    has_missing_required = any(
        r["code"] == "field_missing" for r in reasons
    )
    clean = not has_error and not has_missing_required
    return {
        "ok": clean,
        "extraction_state": "auto_accepted" if clean else "needs_review",
        "confidence_score": 100 if clean else 70,
        "reasons": reasons,
    }


# ---------------------------------------------------------------------------
# Adapter: DataFrame -> invoices rows
# ---------------------------------------------------------------------------

def _build_row(
    row: "pd.Series", mapping: dict[str, str]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Build a single snake_case ``invoice_data`` dict + ``line_items``."""

    def cell(field: str) -> Any:
        col = mapping.get(field)
        return row[col] if col is not None and col in row.index else None

    def money(field: str) -> Optional[float]:
        return _to_float(cell(field))

    taxable = money("taxable_amount")
    total = money("total_amount")
    cgst = money("cgst_amount")
    sgst = money("sgst_amount")
    igst = money("igst_amount")
    cess = money("cess_amount")
    tax_sum = sum(x or 0 for x in (cgst, sgst, igst, cess))

    # Reuse converter reconciliation math (register_df_to_document lines 296-299)
    if taxable is None and total is not None:
        taxable = max(round(total - tax_sum, 2), 0)
    if total is None and taxable is not None:
        total = round(taxable + tax_sum, 2)

    gst_amount = round(tax_sum, 2) if tax_sum else None

    invoice_data: dict[str, Any] = {
        "supplier_name": _cell_str(cell("supplier_name")) or None,
        "supplier_gstin": normalize_gstin(_cell_str(cell("supplier_gstin"))) or None,
        "place_of_supply": _cell_str(cell("place_of_supply")) or None,
        "invoice_number": _cell_str(cell("invoice_number")) or None,
        "invoice_date": _to_iso_date(cell("invoice_date")),
        "taxable_amount": taxable,
        "cgst_amount": cgst,
        "sgst_amount": sgst,
        "igst_amount": igst,
        "cess_amount": cess,
        "total_amount": total,
        "gst_amount": gst_amount,
    }

    # Single header-level line item when HSN/rate/description context exists.
    line_items: list[dict[str, Any]] = []
    hsn = _cell_str(cell("hsn_sac")) or None
    tax_rate = money("tax_rate")
    description = _cell_str(cell("narration")) or invoice_data["supplier_name"]
    if (hsn or tax_rate is not None) and taxable is not None:
        line_items.append({
            "description": description,
            "hsn_sac": hsn,
            "quantity": None,
            "unit_price": None,
            "tax_rate": tax_rate,
            "amount": taxable,
        })
    if line_items:
        invoice_data["line_items"] = line_items

    return invoice_data, line_items


def purchase_register_df_to_invoices(
    df: pd.DataFrame,
    mapping: dict[str, str] | None = None,
    existing_keys: set[str] | None = None,
) -> dict[str, Any]:
    """Convert a purchase-register DataFrame into `invoices`-ready rows.

    Returns an ``ImportResult`` dict::

        {
          rows: [{row_index, invoice_data, line_items, status, extraction_state,
                  confidence_score, reasons, dedupe_key}],
          summary: {total, ready, needs_review, duplicates, errors},
          mapping, unmapped_required, detected_doc_type, doc_type_confidence,
        }

    ``status`` is one of ``ready`` | ``needs_review`` | ``duplicate`` | ``error``.
    Rows already present (by ``existing_keys``) or repeated within the file are
    flagged ``duplicate``.
    """
    detect = auto_detect_columns(df)
    resolved = _resolve_mapping(df, mapping)
    unmapped_required = [f for f in REQUIRED_FIELDS if f not in resolved]

    existing = set(existing_keys or set())
    seen_in_file: set[str] = set()

    rows: list[dict[str, Any]] = []
    summary = {"total": 0, "ready": 0, "needs_review": 0, "duplicates": 0, "errors": 0}

    for idx, row in df.iterrows():
        summary["total"] += 1
        try:
            invoice_data, line_items = _build_row(row, resolved)
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("import row %s failed: %s", idx, e)
            rows.append({
                "row_index": int(idx) if isinstance(idx, int) else summary["total"] - 1,
                "invoice_data": {},
                "line_items": [],
                "status": "error",
                "extraction_state": "needs_review",
                "confidence_score": 0,
                "reasons": [{
                    "code": "parse_error", "field": None,
                    "message": f"Could not parse row: {e}", "severity": "error",
                }],
                "dedupe_key": "",
            })
            summary["errors"] += 1
            continue

        report = validate_import_row(invoice_data)
        dedupe_key = compute_dedupe_key(invoice_data)

        # Only treat as duplicate when the natural key is meaningful (has gstin+no)
        key_is_meaningful = bool(
            invoice_data.get("supplier_gstin") and invoice_data.get("invoice_number")
        )
        is_duplicate = key_is_meaningful and (
            dedupe_key in existing or dedupe_key in seen_in_file
        )
        if key_is_meaningful:
            seen_in_file.add(dedupe_key)

        if is_duplicate:
            status = "duplicate"
            summary["duplicates"] += 1
        elif report["ok"]:
            status = "ready"
            summary["ready"] += 1
        else:
            status = "needs_review"
            summary["needs_review"] += 1

        rows.append({
            "row_index": int(idx) if isinstance(idx, (int,)) else summary["total"] - 1,
            "invoice_data": invoice_data,
            "line_items": line_items,
            "status": status,
            "extraction_state": report["extraction_state"],
            "confidence_score": report["confidence_score"],
            "reasons": report["reasons"],
            "dedupe_key": dedupe_key,
        })

    return {
        "rows": rows,
        "summary": summary,
        "mapping": resolved,
        "unmapped_required": unmapped_required,
        "detected_doc_type": detect["detected_doc_type"],
        "doc_type_confidence": detect["doc_type_confidence"],
        "headers": detect["headers"],
    }
