"""
Phase C — typed review reasons for the confidence-gated review queue.

Attaches ``Review_Reasons`` on extraction results so the CA UI can show
*why* a doc needs review and which fields to highlight (with OCR bboxes).

Thresholds (env, product-tunable):
  REVIEW_FIELD_SCORE_MIN   default 0.7 — per-field Field_Confidence.score
  (Extraction_State still uses compute_confidence 95 / 85 gates.)
"""
from __future__ import annotations

import os
from typing import Any

from extraction_meta import CRITICAL_FIELDS, compute_field_confidence
from validators import validate_extraction

REVIEW_FIELD_SCORE_MIN = float(os.getenv("REVIEW_FIELD_SCORE_MIN", "0.7") or 0.7)


def build_review_reasons(
    data_dict: dict,
    *,
    text_layer: str | None = None,
    field_confidence: dict | None = None,
) -> list[dict[str, Any]]:
    """
    Return a list of ``{code, field?, message, severity}``.

    Codes:
      gstin_invalid | tax_math | field_missing | field_invalid |
      field_ungrounded | field_low_score | low_confidence | qr_override
    """
    reasons: list[dict[str, Any]] = []
    fc = field_confidence or compute_field_confidence(
        data_dict, text_layer=text_layer
    )
    fields_meta = (fc.get("fields") or {}) if isinstance(fc, dict) else {}

    val = validate_extraction(data_dict)
    sg = val.get("supplier_gstin") or {}
    if data_dict.get("Supplier_GSTIN") and not sg.get("ok"):
        reasons.append(
            {
                "code": "gstin_invalid",
                "field": "Supplier_GSTIN",
                "message": "Supplier GSTIN failed checksum/format validation",
                "severity": "error",
                "detail": sg.get("errors") or [],
            }
        )
    bg = val.get("buyer_gstin") or {}
    if data_dict.get("Buyer_GSTIN") and not bg.get("ok"):
        reasons.append(
            {
                "code": "gstin_invalid",
                "field": "Buyer_GSTIN",
                "message": "Buyer GSTIN failed checksum/format validation",
                "severity": "error",
                "detail": bg.get("errors") or [],
            }
        )

    math = val.get("tax_arithmetic") or {}
    if not math.get("ok"):
        reasons.append(
            {
                "code": "tax_math",
                "field": "Total_Amount",
                "message": "Tax / total arithmetic does not reconcile",
                "severity": "error",
                "detail": math.get("issues") or [],
            }
        )

    for name in CRITICAL_FIELDS:
        info = fields_meta.get(name) or {}
        if not info.get("present"):
            reasons.append(
                {
                    "code": "field_missing",
                    "field": name,
                    "message": f"{name} is missing",
                    "severity": "warning",
                }
            )
            continue
        if info.get("valid") is False:
            reasons.append(
                {
                    "code": "field_invalid",
                    "field": name,
                    "message": f"{name} failed validation",
                    "severity": "error",
                }
            )
        if info.get("grounded_in_text") is False:
            reasons.append(
                {
                    "code": "field_ungrounded",
                    "field": name,
                    "message": f"{name} not found in document text layer",
                    "severity": "warning",
                }
            )
        score = info.get("score")
        if isinstance(score, (int, float)) and score < REVIEW_FIELD_SCORE_MIN:
            reasons.append(
                {
                    "code": "field_low_score",
                    "field": name,
                    "message": f"{name} confidence {score} below {REVIEW_FIELD_SCORE_MIN}",
                    "severity": "warning",
                }
            )

    state = data_dict.get("Extraction_State")
    score = data_dict.get("Confidence_Score")
    if state in ("needs_review", "needs_retry") and not any(
        r["code"] in ("gstin_invalid", "tax_math", "field_missing") for r in reasons
    ):
        reasons.append(
            {
                "code": "low_confidence",
                "field": None,
                "message": f"Overall extraction confidence {score} ({state})",
                "severity": "error" if state == "needs_retry" else "warning",
            }
        )

    overridden = data_dict.get("QR_Overridden_Fields") or []
    if overridden:
        reasons.append(
            {
                "code": "qr_override",
                "field": overridden[0] if len(overridden) == 1 else None,
                "message": "E-invoice QR overrode LLM fields: "
                + ", ".join(str(x) for x in overridden),
                "severity": "info",
                "detail": list(overridden),
            }
        )

    # De-dupe by (code, field)
    seen: set[tuple[Any, Any]] = set()
    unique: list[dict[str, Any]] = []
    for r in reasons:
        key = (r.get("code"), r.get("field"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)
    return unique


def flagged_fields(reasons: list[dict[str, Any]]) -> list[str]:
    """Ordered unique field names referenced by review reasons."""
    out: list[str] = []
    for r in reasons:
        f = r.get("field")
        if f and f not in out:
            out.append(str(f))
    return out
