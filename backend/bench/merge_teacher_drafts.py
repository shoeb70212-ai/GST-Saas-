"""
Merge Gemini + Sonnet teacher drafts into gold labels.

Usage (from backend/):
  python -m bench.merge_teacher_drafts

Reads:
  data/labels/_drafts/gemini.json
  data/labels/_drafts/sonnet.json

Writes:
  data/labels/<id>.json          — merged gold (one file per invoice)
  data/labels/_drafts/disputes.json
  data/labels/_drafts/merge_report.json
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DRAFTS = ROOT / "data" / "labels" / "_drafts"
LABELS = ROOT / "data" / "labels"

CRITICAL = [
    "Supplier_GSTIN",
    "Invoice_Number",
    "Invoice_Date",
    "Taxable_Amount",
    "CGST_Amount",
    "SGST_Amount",
    "IGST_Amount",
    "Total_Amount",
]


def _norm_gstin(v) -> str:
    if v is None or v == "":
        return ""
    return re.sub(r"[\s\-]", "", str(v)).upper()


def _norm_num(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def _norm_date(v) -> str:
    if v is None or v == "":
        return ""
    s = str(v).strip()
    # normalize separators to -
    s = s.replace("/", "-").replace(".", "-")
    # collapse spaces
    s = re.sub(r"\s+", "", s)
    return s.upper()


def _norm_str(v) -> str:
    if v is None:
        return ""
    return str(v).strip().upper().replace(" ", "")


def field_equal(name: str, a, b) -> bool:
    if name.endswith("GSTIN"):
        return _norm_gstin(a) == _norm_gstin(b)
    if name.endswith("_Amount") or name in ("Taxable_Amount", "Total_Amount"):
        x, y = _norm_num(a), _norm_num(b)
        if x is None and y is None:
            return True
        if x is None or y is None:
            return False
        return abs(x - y) <= 1.0
    if name == "Invoice_Date":
        return _norm_date(a) == _norm_date(b)
    return _norm_str(a) == _norm_str(b)


def nullify_empty(fields: dict) -> dict:
    out = {}
    for k, v in fields.items():
        if v == "":
            out[k] = None
        else:
            out[k] = v
    return out


def tax_math_score(fields: dict) -> float:
    """Lower is better: abs((taxable+taxes)-total). Missing total → large penalty."""
    taxable = _norm_num(fields.get("Taxable_Amount")) or 0.0
    cgst = _norm_num(fields.get("CGST_Amount")) or 0.0
    sgst = _norm_num(fields.get("SGST_Amount")) or 0.0
    igst = _norm_num(fields.get("IGST_Amount")) or 0.0
    total = _norm_num(fields.get("Total_Amount"))
    if total is None:
        return 1e9
    return abs(round(taxable + cgst + sgst + igst, 2) - total)


def has_mixed_cgst_igst(fields: dict) -> bool:
    cgst = _norm_num(fields.get("CGST_Amount")) or 0.0
    sgst = _norm_num(fields.get("SGST_Amount")) or 0.0
    igst = _norm_num(fields.get("IGST_Amount")) or 0.0
    return (cgst > 0 or sgst > 0) and igst > 0


def load_array(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise SystemExit(f"{path} must be a JSON array")
    # Drop SUPERSEDED sonnet notes when a later entry exists for same source
    return data


def index_by_source(rows: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in rows:
        src = row.get("source_file")
        if not src:
            continue
        notes = (row.get("notes") or "").upper()
        # Prefer non-superseded if we see the same source again
        if src in out and "SUPERSEDED" in notes:
            continue
        if src in out and "SUPERSEDED" in (out[src].get("notes") or "").upper():
            out[src] = row
            continue
        out[src] = row
    return out


def prefer_side(g_fields: dict, s_fields: dict) -> str:
    """Return 'sonnet' | 'gemini' based on tax math + mixed-tax heuristic."""
    g_mixed = has_mixed_cgst_igst(g_fields)
    s_mixed = has_mixed_cgst_igst(s_fields)
    if g_mixed and not s_mixed:
        return "sonnet"
    if s_mixed and not g_mixed:
        return "gemini"
    g_err = tax_math_score(g_fields)
    s_err = tax_math_score(s_fields)
    if s_err + 0.5 < g_err:
        return "sonnet"
    if g_err + 0.5 < s_err:
        return "gemini"
    # default: prefer sonnet when close (more careful accountant notes)
    return "sonnet"


def merge_pair(g: dict | None, s: dict | None) -> tuple[dict, dict | None]:
    """
    Returns (label, dispute_or_none).
    """
    if g and not s:
        fields = nullify_empty(dict(g.get("fields") or {}))
        label = {
            "id": g.get("id"),
            "source_file": g.get("source_file"),
            "difficulty": g.get("difficulty") or "unknown",
            "notes": (g.get("notes") or "") + " [source=gemini_only]",
            "fields": fields,
            "critical_fields": g.get("critical_fields") or CRITICAL,
            "merge": {"status": "gemini_only", "teachers": ["gemini"]},
        }
        return label, None

    if s and not g:
        fields = nullify_empty(dict(s.get("fields") or {}))
        label = {
            "id": s.get("id"),
            "source_file": s.get("source_file"),
            "difficulty": s.get("difficulty") or "unknown",
            "notes": (s.get("notes") or "") + " [source=sonnet_only]",
            "fields": fields,
            "critical_fields": s.get("critical_fields") or CRITICAL,
            "merge": {"status": "sonnet_only", "teachers": ["sonnet"]},
        }
        return label, None

    assert g and s
    gf = nullify_empty(dict(g.get("fields") or {}))
    sf = nullify_empty(dict(s.get("fields") or {}))
    crit = g.get("critical_fields") or s.get("critical_fields") or CRITICAL

    disputed = []
    for k in crit:
        if k not in gf and k not in sf:
            continue
        if not field_equal(k, gf.get(k), sf.get(k)):
            disputed.append(
                {
                    "field": k,
                    "gemini": gf.get(k),
                    "sonnet": sf.get(k),
                }
            )

    winner = prefer_side(gf, sf)
    base = s if winner == "sonnet" else g
    other = g if winner == "sonnet" else s
    fields = nullify_empty(dict(base.get("fields") or {}))

    # On dispute, still take winner's field; record both
    status = "agree" if not disputed else f"prefer_{winner}"
    label = {
        "id": base.get("id") or other.get("id"),
        "source_file": base.get("source_file"),
        "difficulty": base.get("difficulty") or other.get("difficulty") or "unknown",
        "notes": (base.get("notes") or "")
        + (f" [merged prefer={winner}]" if disputed else " [merged agree]"),
        "fields": fields,
        "critical_fields": crit,
        "merge": {
            "status": status,
            "teachers": ["gemini", "sonnet"],
            "prefer": winner,
            "disputed_fields": [d["field"] for d in disputed],
            "gemini_math_err": tax_math_score(gf),
            "sonnet_math_err": tax_math_score(sf),
        },
    }

    dispute = None
    if disputed:
        dispute = {
            "id": label["id"],
            "source_file": label["source_file"],
            "prefer": winner,
            "disputed": disputed,
            "gemini_notes": g.get("notes"),
            "sonnet_notes": s.get("notes"),
            "chosen_fields": fields,
        }
    return label, dispute


def main() -> None:
    gemini_path = DRAFTS / "gemini.json"
    sonnet_path = DRAFTS / "sonnet.json"
    if not gemini_path.exists() and not sonnet_path.exists():
        print(f"Missing drafts under {DRAFTS}")
        sys.exit(1)

    g_idx = index_by_source(load_array(gemini_path))
    s_idx = index_by_source(load_array(sonnet_path))
    all_sources = sorted(set(g_idx) | set(s_idx))

    LABELS.mkdir(parents=True, exist_ok=True)
    # Clear previous gold json (keep _drafts)
    for p in LABELS.glob("*.json"):
        p.unlink()

    labels = []
    disputes = []
    for src in all_sources:
        label, dispute = merge_pair(g_idx.get(src), s_idx.get(src))
        labels.append(label)
        if dispute:
            disputes.append(dispute)
        out = LABELS / f"{label['id']}.json"
        # Avoid path-hostile ids
        safe_id = re.sub(r"[^\w\-]+", "_", str(label["id"]))
        out = LABELS / f"{safe_id}.json"
        out.write_text(json.dumps(label, indent=2), encoding="utf-8")

    report = {
        "total_sources": len(all_sources),
        "labels_written": len(labels),
        "gemini_count": len(g_idx),
        "sonnet_count": len(s_idx),
        "both": sum(1 for s in all_sources if s in g_idx and s in s_idx),
        "gemini_only": sum(1 for s in all_sources if s in g_idx and s not in s_idx),
        "sonnet_only": sum(1 for s in all_sources if s in s_idx and s not in g_idx),
        "disputes": len(disputes),
        "agree": sum(1 for l in labels if (l.get("merge") or {}).get("status") == "agree"),
    }
    DRAFTS.mkdir(parents=True, exist_ok=True)
    (DRAFTS / "disputes.json").write_text(json.dumps(disputes, indent=2), encoding="utf-8")
    (DRAFTS / "merge_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"wrote {len(labels)} labels -> {LABELS}")
    print(f"wrote {len(disputes)} disputes -> {DRAFTS / 'disputes.json'}")


if __name__ == "__main__":
    main()
