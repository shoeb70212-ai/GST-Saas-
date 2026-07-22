"""
Phase 3 — difficulty routing + disputed-field helpers.

Gold-set acceptance still gates turning Gemini on for hard docs
(`ROUTING_USE_GEMINI_FOR_HARD=1`).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Literal

from extraction_meta import CRITICAL_FIELDS, compute_field_confidence
from preprocess import HYBRID_MIME, is_text_rich_markdown

Difficulty = Literal["easy", "hard"]

ROUTING_ENABLED = os.getenv("EXTRACTION_ROUTING_ENABLED", "1") not in (
    "0",
    "false",
    "False",
)
# Off by default until run_bench shows accuracy↑ + cost OK on gold set
ROUTING_USE_GEMINI_FOR_HARD = os.getenv("ROUTING_USE_GEMINI_FOR_HARD", "0") in (
    "1",
    "true",
    "True",
)


@dataclass(frozen=True)
class RoutePlan:
    tier: Difficulty
    first_pass: Literal["primary", "verify", "gemini"]
    reason: str
    allow_targeted_followup: bool


def classify_difficulty(mime_type: str, text_layer: str | None) -> Difficulty:
    """
    text-rich markdown → easy (cheap mini).
    image / hybrid / thin text → hard (strong vision first).
    """
    if mime_type == "text/markdown" and is_text_rich_markdown(text_layer or ""):
        return "easy"
    if mime_type == "text/markdown" and text_layer and len(text_layer) > 400:
        # Long text without tables still cheaper on mini
        return "easy"
    if mime_type == HYBRID_MIME:
        return "hard"
    if mime_type.startswith("image/"):
        return "hard"
    return "hard"


def plan_route(mime_type: str, text_layer: str | None) -> RoutePlan:
    if not ROUTING_ENABLED:
        return RoutePlan(
            tier="easy",
            first_pass="primary",
            reason="routing_disabled",
            allow_targeted_followup=True,
        )
    tier = classify_difficulty(mime_type, text_layer)
    if tier == "easy":
        return RoutePlan(
            tier="easy",
            first_pass="primary",
            reason="text_rich_markdown",
            allow_targeted_followup=True,
        )
    if ROUTING_USE_GEMINI_FOR_HARD:
        return RoutePlan(
            tier="hard",
            first_pass="gemini",
            reason="hard_doc_gemini_enabled",
            allow_targeted_followup=True,
        )
    return RoutePlan(
        tier="hard",
        first_pass="verify",
        reason="hard_doc_skip_mini",
        allow_targeted_followup=True,
    )


def disputed_fields(
    extracted: dict,
    *,
    text_layer: str | None = None,
) -> list[str]:
    """Critical fields that are missing, invalid, or ungrounded in text."""
    fc = compute_field_confidence(extracted, text_layer=text_layer)
    out: list[str] = []
    for name in CRITICAL_FIELDS:
        info = (fc.get("fields") or {}).get(name) or {}
        if not info.get("present"):
            out.append(name)
            continue
        if not info.get("valid"):
            out.append(name)
            continue
        if info.get("grounded_in_text") is False:
            out.append(name)
    return out


def prefer_targeted_reextract(data_dict: dict, text_layer: str | None) -> bool:
    """
    Use cheap targeted pass on needs_review with a small disputed set.
    Full verify for needs_retry / many disputes.
    """
    state = data_dict.get("Extraction_State")
    if state == "needs_retry":
        return False
    if state != "needs_review":
        return False
    disputed = disputed_fields(data_dict, text_layer=text_layer)
    return 1 <= len(disputed) <= 5


def build_targeted_prompt(base_prompt: str, fields: list[str]) -> str:
    field_list = ", ".join(fields)
    return (
        f"{base_prompt}\n\n"
        "## Targeted re-extraction\n"
        f"Only the following fields are disputed and must be re-read from the document: {field_list}.\n"
        "For every other schema field, return null (do not invent values).\n"
        "Prefer literal printed values; do not guess missing tax splits.\n"
    )


def merge_targeted_fields(
    base: dict,
    patch: dict,
    fields: list[str],
) -> dict:
    """Overwrite only disputed fields when patch provides a non-empty value."""
    out = dict(base)
    for name in fields:
        val = patch.get(name)
        if val is None or val == "":
            continue
        out[name] = val
    out["Targeted_Fields"] = list(fields)
    out["Targeted_Reextract"] = True
    return out


def better_result(candidate: dict, incumbent: dict) -> bool:
    state_rank = {
        "needs_retry": 0,
        "needs_review": 1,
        "auto_accepted": 2,
        "duplicate_warning": 2,
    }
    c_state = candidate.get("Extraction_State")
    i_state = incumbent.get("Extraction_State")
    if state_rank.get(c_state, 0) > state_rank.get(i_state, 0):
        return True
    if c_state == i_state:
        return float(candidate.get("Confidence_Score") or 0) >= float(
            incumbent.get("Confidence_Score") or 0
        )
    return False


def route_fingerprint(plan: RoutePlan) -> str:
    gem = "1" if ROUTING_USE_GEMINI_FOR_HARD else "0"
    return f"{plan.tier}:{plan.first_pass}:g{gem}"
