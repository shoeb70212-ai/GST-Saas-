"""
Phase D — vendor correction / memory layer.

Keyed lookup ``(org_id, vendor_gstin)`` — not a vector DB.

Two tiers (architecture brief §8):
  * exact  — deterministic overlay for compliance-critical fields
  * hint   — soft prompt context for fuzzy free-text fields

Env: ``VENDOR_MEMORY_ENABLED`` (default ``1``). Degrades to no-op without org/client.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from validators import normalize_gstin

logger = logging.getLogger(__name__)

VENDOR_MEMORY_ENABLED = os.getenv("VENDOR_MEMORY_ENABLED", "1") not in (
    "0",
    "false",
    "False",
)

# Hard rules: never leave these to prompt suggestion alone.
EXACT_FIELDS = frozenset(
    {
        "Supplier_GSTIN",
        "Buyer_GSTIN",
        "Invoice_Number",
        "Invoice_Date",
        "HSN_SAC",
        "Taxable_Amount",
        "CGST_Amount",
        "SGST_Amount",
        "IGST_Amount",
        "Cess_Amount",
        "Total_Amount",
    }
)

# Soft hints: names / descriptions stay fuzzy.
HINT_FIELDS = frozenset(
    {
        "Supplier_Name",
        "Buyer_Name",
        "Supplier_Address",
        "Buyer_Address",
        "Expense_Category",
    }
)

SNAPSHOT_FIELDS = tuple(sorted(EXACT_FIELDS | HINT_FIELDS | {"Supplier_Name", "Invoice_Number"}))


def snapshot_fields(data: dict) -> dict[str, Any]:
    """AI/pre-edit values used later to detect CA corrections."""
    out: dict[str, Any] = {}
    for k in SNAPSHOT_FIELDS:
        if k in data and data.get(k) is not None:
            out[k] = data.get(k)
    return out


def _norm_cmp(field: str, value: Any) -> str:
    if value is None:
        return ""
    if field.endswith("GSTIN"):
        return normalize_gstin(str(value))
    if field.endswith("_Amount") or field in EXACT_FIELDS and "Amount" in field:
        try:
            return f"{round(float(value), 2):.2f}"
        except (TypeError, ValueError):
            return str(value).strip()
    return str(value).strip()


def apply_exact_rules(data_dict: dict, rules: list[dict]) -> list[str]:
    """
    Apply deterministic exact rules in-place. Returns list of field names changed.
    """
    applied: list[str] = []
    for rule in rules:
        if rule.get("rule_kind") != "exact":
            continue
        field = rule.get("field_name")
        if not field or field not in EXACT_FIELDS:
            continue
        to_val = rule.get("to_value")
        if to_val is None or to_val == "":
            continue
        from_val = rule.get("from_value")
        current = data_dict.get(field)
        if from_val is None or from_val == "":
            # Unconditional set when empty / always overlay
            if _norm_cmp(field, current) != _norm_cmp(field, to_val):
                data_dict[field] = _coerce(field, to_val)
                applied.append(field)
            continue
        if _norm_cmp(field, current) == _norm_cmp(field, from_val):
            data_dict[field] = _coerce(field, to_val)
            applied.append(field)
    return applied


def _coerce(field: str, raw: Any) -> Any:
    if field.endswith("_Amount") or field in (
        "Taxable_Amount",
        "Total_Amount",
        "CGST_Amount",
        "SGST_Amount",
        "IGST_Amount",
        "Cess_Amount",
    ):
        try:
            return round(float(raw), 2)
        except (TypeError, ValueError):
            return raw
    if field.endswith("GSTIN"):
        return normalize_gstin(str(raw)) or raw
    return raw


def build_prompt_hints(rules: list[dict]) -> str:
    """Concatenate soft hint texts for prompt injection."""
    lines: list[str] = []
    for rule in rules:
        if rule.get("rule_kind") != "hint":
            continue
        text = (rule.get("hint_text") or "").strip()
        if text:
            lines.append(f"- {text}")
    if not lines:
        return ""
    return (
        "\n\n## Vendor correction memory (hints only — prefer printed values)\n"
        + "\n".join(lines)
        + "\n"
    )


def deltas_from_snapshot(
    snapshot: dict | None,
    final: dict,
) -> list[dict[str, Any]]:
    """
    Diff CA-edited final values against the extraction snapshot.
    Only emits learnable field changes.
    """
    if not snapshot:
        return []
    out: list[dict[str, Any]] = []
    for field in SNAPSHOT_FIELDS:
        if field not in final and field not in snapshot:
            continue
        before = snapshot.get(field)
        after = final.get(field)
        if _norm_cmp(field, before) == _norm_cmp(field, after):
            continue
        if after in (None, ""):
            continue
        kind = "exact" if field in EXACT_FIELDS else "hint" if field in HINT_FIELDS else None
        if not kind:
            continue
        item: dict[str, Any] = {
            "field_name": field,
            "rule_kind": kind,
            "from_value": None if before in (None, "") else str(before),
            "to_value": str(after),
        }
        if kind == "hint":
            item["hint_text"] = (
                f"For this vendor, {field} was previously misread as "
                f"{before!r} and corrected to {after!r}."
            )
        out.append(item)
    return out


async def fetch_rules(
    sc,
    *,
    org_id: str,
    vendor_gstin: str,
) -> list[dict]:
    gstin = normalize_gstin(vendor_gstin)
    if not sc or not org_id or not gstin:
        return []
    try:
        resp = (
            await sc.table("vendor_correction_rules")
            .select("*")
            .eq("org_id", org_id)
            .eq("vendor_gstin", gstin)
            .execute()
        )
        return list(resp.data or [])
    except Exception as e:  # noqa: BLE001
        logger.warning("vendor_memory fetch failed: %s", e)
        return []


async def upsert_rules(
    sc,
    *,
    org_id: str,
    vendor_gstin: str,
    deltas: list[dict],
) -> int:
    """Insert or bump hit_count for each delta. Returns number of upserts attempted."""
    gstin = normalize_gstin(vendor_gstin)
    if not sc or not org_id or not gstin or not deltas:
        return 0
    n = 0
    for d in deltas:
        field = d.get("field_name")
        kind = d.get("rule_kind")
        if not field or kind not in ("exact", "hint"):
            continue
        from_val = d.get("from_value")
        row = {
            "org_id": org_id,
            "vendor_gstin": gstin,
            "field_name": field,
            "rule_kind": kind,
            "from_value": from_val,
            "to_value": d.get("to_value"),
            "hint_text": d.get("hint_text"),
            "hit_count": 1,
        }
        try:
            # Try find existing
            q = (
                sc.table("vendor_correction_rules")
                .select("id, hit_count")
                .eq("org_id", org_id)
                .eq("vendor_gstin", gstin)
                .eq("field_name", field)
                .eq("rule_kind", kind)
            )
            if from_val is None or from_val == "":
                q = q.is_("from_value", "null")
            else:
                q = q.eq("from_value", from_val)
            existing = await q.limit(1).execute()
            if existing.data:
                rid = existing.data[0]["id"]
                hits = int(existing.data[0].get("hit_count") or 1) + 1
                from datetime import datetime, timezone

                await (
                    sc.table("vendor_correction_rules")
                    .update(
                        {
                            "to_value": row["to_value"],
                            "hint_text": row["hint_text"],
                            "hit_count": hits,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                    .eq("id", rid)
                    .execute()
                )
            else:
                await sc.table("vendor_correction_rules").insert(row).execute()
            n += 1
        except Exception as e:  # noqa: BLE001
            logger.warning("vendor_memory upsert failed for %s: %s", field, e)
    return n


def early_vendor_gstin(
    *,
    qr_seed=None,
    text_layer: str | None = None,
) -> str | None:
    """Best-effort vendor GSTIN before / without full LLM result."""
    if qr_seed is not None:
        fields = getattr(qr_seed, "fields", None) or {}
        g = normalize_gstin(fields.get("Supplier_GSTIN"))
        if g:
            return g
    if text_layer:
        try:
            from ocr.field_hints import extract_gstins

            found = extract_gstins(text_layer)
            if found:
                return found[0]
        except Exception:  # noqa: BLE001
            pass
    return None
