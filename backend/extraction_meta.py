"""
Per-field confidence, text-layer grounding, and rough INR cost estimates.
Pure helpers used by extraction.run_ai_extraction (Phase 1).
"""
from __future__ import annotations

import os
import re
from typing import Any

from validators import normalize_gstin, validate_gstin, validate_tax_arithmetic

CRITICAL_FIELDS = (
    "Supplier_GSTIN",
    "Invoice_Number",
    "Invoice_Date",
    "Taxable_Amount",
    "CGST_Amount",
    "SGST_Amount",
    "IGST_Amount",
    "Total_Amount",
)

# Rough blended INR per 1k tokens (OpenRouter mini-heavy). Override via env.
_DEFAULT_INR_PER_1K = float(os.getenv("SCAN_COST_INR_PER_1K_TOKENS", "0.025"))


def estimate_cost_inr(tokens: int, *, inr_per_1k: float | None = None) -> float:
    rate = _DEFAULT_INR_PER_1K if inr_per_1k is None else float(inr_per_1k)
    return round(max(0, int(tokens)) / 1000.0 * rate, 4)


def _normalize_haystack(text: str) -> str:
    return re.sub(r"[\s\-_/]", "", text or "").upper()


def value_grounded_in_text(value: Any, text_layer: str | None) -> bool | None:
    """
    Return True/False if text_layer provided; None if no text layer (vision path).
    """
    if text_layer is None:
        return None
    if value is None or value == "":
        return False
    hay = _normalize_haystack(text_layer)
    if not hay:
        return False
    if isinstance(value, float):
        # Match integer part and common 2-decimal form
        needle = _normalize_haystack(f"{value:.2f}")
        alt = _normalize_haystack(str(int(value)) if value == int(value) else str(value))
        return needle in hay or alt in hay
    s = str(value).strip()
    if not s:
        return False
    # GSTIN: require full normalized match
    if len(s) == 15 and normalize_gstin(s):
        return normalize_gstin(s) in hay
    needle = _normalize_haystack(s)
    if len(needle) < 3:
        return needle in hay
    return needle in hay


def compute_field_confidence(
    extracted: dict,
    *,
    text_layer: str | None = None,
) -> dict[str, Any]:
    """
    Per critical field: present, valid (GSTIN/math-aware), grounded_in_text.
    """
    gstin = validate_gstin(extracted.get("Supplier_GSTIN"))
    math = validate_tax_arithmetic(extracted)
    out: dict[str, Any] = {}

    for name in CRITICAL_FIELDS:
        val = extracted.get(name)
        present = val is not None and val != ""
        valid = present
        if name == "Supplier_GSTIN":
            valid = gstin["ok"]
        elif name in (
            "Taxable_Amount",
            "CGST_Amount",
            "SGST_Amount",
            "IGST_Amount",
            "Total_Amount",
        ):
            # Mark invalid if overall tax math failed and field is part of mismatch
            if present and not math["ok"] and name == "Total_Amount":
                valid = not any("header_total" in i for i in math["issues"])
        grounded = value_grounded_in_text(val, text_layer)
        score = 0.0
        if present:
            score += 0.5
        if valid:
            score += 0.3
        if grounded is True:
            score += 0.2
        elif grounded is None and present and valid:
            score += 0.1  # vision path: no text to ground against
        out[name] = {
            "present": present,
            "valid": bool(valid),
            "grounded_in_text": grounded,
            "score": round(min(1.0, score), 2),
        }

    return {
        "fields": out,
        "text_layer_available": text_layer is not None,
        "avg_critical_score": round(
            sum(f["score"] for f in out.values()) / max(len(out), 1), 3
        ),
    }


def attach_scan_meta(
    data_dict: dict,
    *,
    tokens: int,
    cache_hit: bool,
    text_layer: str | None,
    prompt_version: str,
    latency_ms: int | None = None,
) -> dict:
    """Mutates data_dict with Field_Confidence + Scan_Meta; returns it."""
    fc = compute_field_confidence(data_dict, text_layer=text_layer)
    cost = estimate_cost_inr(tokens)
    data_dict["Field_Confidence"] = fc
    data_dict["Estimated_Cost_INR"] = cost
    data_dict["Scan_Meta"] = {
        "tokens_used": tokens,
        "estimated_cost_inr": cost,
        "cache_hit": cache_hit,
        "prompt_version": prompt_version,
        "text_layer": bool(text_layer),
        "latency_ms": latency_ms,
        "avg_field_confidence": fc["avg_critical_score"],
    }
    return data_dict
