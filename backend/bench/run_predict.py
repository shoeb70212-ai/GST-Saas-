"""
Run production extraction on gold-labeled raw invoices → results/pred.jsonl

Usage (from backend/):
  python -m bench.run_predict --limit 5
  python -m bench.run_predict
"""
from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")

RAW = ROOT / "data" / "raw"
LABELS = ROOT / "data" / "labels"
RESULTS = ROOT / "results"


def load_labels() -> list[dict]:
    rows = []
    for p in sorted(LABELS.glob("*.json")):
        if p.name.startswith("_"):
            continue
        rows.append(json.loads(p.read_text(encoding="utf-8")))
    return rows


async def predict_one(label: dict) -> dict:
    from extraction import run_ai_extraction

    src = label.get("source_file")
    path = RAW / src
    if not path.exists():
        return {
            "id": label.get("id"),
            "source_file": src,
            "error": f"missing_raw:{src}",
        }
    raw = path.read_bytes()
    mime, _ = mimetypes.guess_type(path.name)
    if not mime:
        ext = path.suffix.lower()
        mime = {
            ".pdf": "application/pdf",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
        }.get(ext, "application/octet-stream")

    data, tokens = await run_ai_extraction(raw, mime)
    row = {
        "id": label.get("id"),
        "source_file": src,
        "tokens": tokens,
        "Extraction_Model": data.get("Extraction_Model"),
        "Extraction_State": data.get("Extraction_State"),
        "Confidence_Score": data.get("Confidence_Score"),
    }
    for k in (
        "Supplier_Name",
        "Supplier_GSTIN",
        "Buyer_Name",
        "Buyer_GSTIN",
        "Invoice_Number",
        "Invoice_Date",
        "Taxable_Amount",
        "CGST_Amount",
        "SGST_Amount",
        "IGST_Amount",
        "Total_Amount",
        "Invoice_Type",
    ):
        row[k] = data.get(k)
    return row


async def main_async(limit: int | None) -> None:
    labels = load_labels()
    if limit:
        labels = labels[:limit]
    if not labels:
        print(f"No labels in {LABELS}")
        sys.exit(1)

    RESULTS.mkdir(parents=True, exist_ok=True)
    out_path = RESULTS / "pred.jsonl"
    results = []
    print(f"predicting {len(labels)} invoices…")
    for i, lab in enumerate(labels, 1):
        src = lab.get("source_file")
        print(f"[{i}/{len(labels)}] {src}")
        try:
            row = await predict_one(lab)
        except Exception as e:
            row = {
                "id": lab.get("id"),
                "source_file": src,
                "error": str(e),
            }
            print(f"  ERROR: {e}")
        else:
            if row.get("error"):
                print(f"  ERROR: {row['error']}")
            else:
                print(
                    f"  ok model={row.get('Extraction_Model')} "
                    f"state={row.get('Extraction_State')} tokens={row.get('tokens')}"
                )
        results.append(row)
        # incremental save
        out_path.write_text(
            "\n".join(json.dumps(r, ensure_ascii=False) for r in results) + "\n",
            encoding="utf-8",
        )

    ok = sum(1 for r in results if not r.get("error"))
    print(f"done ok={ok}/{len(results)} → {out_path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    asyncio.run(main_async(args.limit))


if __name__ == "__main__":
    main()
