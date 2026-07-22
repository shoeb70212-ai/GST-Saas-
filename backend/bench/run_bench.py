"""
Score extraction outputs against human/consensus labels.

Usage (from backend/):
  python -m bench.run_bench --labels data/labels
  python -m bench.run_bench --labels data/labels --predictions results/pred.jsonl --fail-under 0.98
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from validators import normalize_gstin, validate_extraction  # noqa: E402

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


def _norm_str(v) -> str:
    if v is None:
        return ""
    return str(v).strip().upper().replace(" ", "")


def _norm_num(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def field_equal(name: str, pred, gold) -> bool:
    if name.endswith("GSTIN"):
        return normalize_gstin(pred) == normalize_gstin(gold)
    if name.endswith("_Amount") or name in ("Taxable_Amount", "Total_Amount"):
        a, b = _norm_num(pred), _norm_num(gold)
        if a is None and b is None:
            return True
        if a is None or b is None:
            return False
        return abs(a - b) <= 1.0
    return _norm_str(pred) == _norm_str(gold)


def score_one(pred: dict, label: dict) -> dict:
    fields = label.get("fields") or {}
    crit = label.get("critical_fields") or CRITICAL
    hits = 0
    total = 0
    misses = []
    for k in crit:
        if k not in fields:
            continue
        total += 1
        pv = pred.get(k)
        gv = fields.get(k)
        if field_equal(k, pv, gv):
            hits += 1
        else:
            misses.append({"field": k, "pred": pv, "gold": gv})
    val = validate_extraction(pred)
    return {
        "id": label.get("id"),
        "source_file": label.get("source_file"),
        "critical_accuracy": (hits / total) if total else None,
        "hits": hits,
        "total": total,
        "misses": misses,
        "validator_ok": val["ok"],
        "validator": val,
    }


def load_labels(labels_dir: Path) -> list[dict]:
    out = []
    if not labels_dir.exists():
        return out
    for p in sorted(labels_dir.glob("*.json")):
        out.append(json.loads(p.read_text(encoding="utf-8")))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--labels",
        type=Path,
        default=ROOT / "data" / "labels",
        help="Directory of label JSON files",
    )
    ap.add_argument(
        "--predictions",
        type=Path,
        default=None,
        help="JSONL of {id|source_file, ...fields} predictions",
    )
    ap.add_argument(
        "--fail-under",
        type=float,
        default=None,
        help="Exit 1 if avg critical accuracy is below this threshold (e.g. 0.98)",
    )
    ap.add_argument(
        "--require-labels",
        action="store_true",
        help="Exit 1 when the labels directory is empty (CI must not silently no-op)",
    )
    args = ap.parse_args()

    labels = load_labels(args.labels)
    if not labels:
        print(f"No labels in {args.labels}. Add reviewed JSON files first.")
        print("Schema: bench/labels.schema.json")
        sys.exit(1 if args.require_labels else 0)

    preds_by_key: dict[str, dict] = {}
    if args.predictions and args.predictions.exists():
        for line in args.predictions.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            key = row.get("id") or row.get("source_file")
            if key:
                preds_by_key[key] = row

    results = []
    for lab in labels:
        key = lab.get("id") or lab.get("source_file")
        pred = preds_by_key.get(key) or preds_by_key.get(lab.get("source_file", ""))
        if not pred:
            results.append({"id": key, "error": "missing_prediction"})
            continue
        results.append(score_one(pred, lab))

    scored = [r for r in results if "critical_accuracy" in r and r["critical_accuracy"] is not None]
    avg = None
    if scored:
        avg = sum(r["critical_accuracy"] for r in scored) / len(scored)
        print(f"labeled={len(labels)} scored={len(scored)} avg_critical_accuracy={avg:.3f}")
    else:
        print(f"labeled={len(labels)} scored=0 (provide --predictions JSONL)")

    out = ROOT / "results" / "last_bench.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"wrote {out}")

    exit_code = 0
    missing = sum(1 for r in results if r.get("error") == "missing_prediction")
    if missing and args.predictions:
        print(f"ERROR: {missing} label(s) missing predictions")
        exit_code = 1
    if args.fail_under is not None:
        if avg is None:
            print("ERROR: --fail-under set but no scored results")
            exit_code = 1
        elif avg < args.fail_under:
            print(f"ERROR: avg_critical_accuracy={avg:.3f} < fail-under={args.fail_under}")
            exit_code = 1
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
