"""
Phase E — classical OCR (Azure Read) vs gold labels (+ optional LLM predictions).

Azure Read does not emit GST schema fields. This harness therefore scores:

1. **grounding_rate** — fraction of gold critical field values found in OCR text
   (answers: "can classical OCR *read* this handwriting?")
2. **hint_gstin_hit** — whether Supplier_GSTIN heuristic matches gold
3. **llm_critical_accuracy** — when ``--predictions`` is given, side-by-side with
   ``bench.run_bench`` scoring

Uses Azure Startups credit when ``AZURE_DI_*`` is configured. Offline/dry-run
modes work without credentials for CI and local tooling.

Usage (from backend/):
  # Offline: score existing LLM preds only (no Azure call)
  python -m bench.run_ocr_compare --predictions results/pred.jsonl --skip-ocr

  # Live Azure Read on gold set (spends credit — start with --limit 5)
  set OCR_ENABLED=1
  set AZURE_DI_ENDPOINT=https://....cognitiveservices.azure.com/
  set AZURE_DI_KEY=...
  python -m bench.run_ocr_compare --limit 5

  # Full compare
  python -m bench.run_ocr_compare --predictions results/pred.jsonl
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")

from bench.run_bench import CRITICAL, field_equal, score_one  # noqa: E402
from ocr.field_hints import gold_value_in_text, hint_fields_from_ocr  # noqa: E402

RAW = ROOT / "data" / "raw"
LABELS = ROOT / "data" / "labels"
RESULTS = ROOT / "results"


def load_labels(labels_dir: Path) -> list[dict]:
    rows = []
    if not labels_dir.exists():
        return rows
    for p in sorted(labels_dir.glob("*.json")):
        if p.name.startswith("_"):
            continue
        rows.append(json.loads(p.read_text(encoding="utf-8")))
    return rows


def load_predictions(path: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not path or not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        rid = row.get("id")
        if rid:
            out[str(rid)] = row
    return out


def guess_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    if mime:
        return mime
    return {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(path.suffix.lower(), "application/octet-stream")


def score_grounding(label: dict, ocr_text: str) -> dict:
    fields = label.get("fields") or {}
    crit = label.get("critical_fields") or CRITICAL
    hits = 0
    total = 0
    detail = []
    for k in crit:
        if k not in fields:
            continue
        grounded = gold_value_in_text(k, fields.get(k), ocr_text)
        if grounded is None:
            continue
        total += 1
        if grounded:
            hits += 1
        detail.append({"field": k, "grounded": grounded, "gold": fields.get(k)})
    return {
        "grounding_hits": hits,
        "grounding_total": total,
        "grounding_rate": (hits / total) if total else None,
        "grounding_detail": detail,
    }


def score_hint_gstin(label: dict, ocr_text: str) -> dict:
    fields = label.get("fields") or {}
    gold = fields.get("Supplier_GSTIN")
    hints = hint_fields_from_ocr(ocr_text)
    pred = hints.get("Supplier_GSTIN")
    ok = None
    if gold not in (None, ""):
        ok = field_equal("Supplier_GSTIN", pred, gold)
    return {
        "hint_supplier_gstin": pred,
        "hint_gstin_ok": ok,
        "ocr_gstin_count": len(hints.get("_ocr_gstins") or []),
    }


def compare_one(
    label: dict,
    *,
    ocr_text: str | None,
    ocr_meta: dict | None,
    llm_pred: dict | None,
) -> dict:
    row: dict = {
        "id": label.get("id"),
        "source_file": label.get("source_file"),
        "difficulty": label.get("difficulty"),
    }
    if ocr_text is not None:
        row.update(score_grounding(label, ocr_text))
        row.update(score_hint_gstin(label, ocr_text))
        row["ocr_chars"] = len(ocr_text)
        if ocr_meta:
            row["ocr"] = ocr_meta
    if llm_pred and not llm_pred.get("error"):
        scored = score_one(llm_pred, label)
        row["llm_critical_accuracy"] = scored.get("critical_accuracy")
        row["llm_hits"] = scored.get("hits")
        row["llm_total"] = scored.get("total")
        row["llm_misses"] = scored.get("misses")
        row["llm_model"] = llm_pred.get("Extraction_Model")
    elif llm_pred and llm_pred.get("error"):
        row["llm_error"] = llm_pred.get("error")
    return row


def _summarize(rows: list[dict]) -> dict:
    g_hits = g_tot = 0
    gstin_ok = gstin_n = 0
    llm_hits = llm_tot = 0
    for r in rows:
        if r.get("grounding_total"):
            g_hits += int(r["grounding_hits"] or 0)
            g_tot += int(r["grounding_total"] or 0)
        if r.get("hint_gstin_ok") is not None:
            gstin_n += 1
            if r["hint_gstin_ok"]:
                gstin_ok += 1
        if r.get("llm_total"):
            llm_hits += int(r["llm_hits"] or 0)
            llm_tot += int(r["llm_total"] or 0)
    return {
        "n_docs": len(rows),
        "ocr_grounding_rate": (g_hits / g_tot) if g_tot else None,
        "ocr_grounding_hits": g_hits,
        "ocr_grounding_total": g_tot,
        "ocr_supplier_gstin_accuracy": (gstin_ok / gstin_n) if gstin_n else None,
        "llm_critical_accuracy": (llm_hits / llm_tot) if llm_tot else None,
        "llm_hits": llm_hits,
        "llm_total": llm_tot,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="OCR vs gold (+ LLM) compare — Phase E")
    ap.add_argument("--labels", type=Path, default=LABELS)
    ap.add_argument("--raw", type=Path, default=RAW)
    ap.add_argument(
        "--predictions",
        type=Path,
        default=None,
        help="LLM pred.jsonl (default: bench/results/pred.jsonl if present)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write full compare report JSON (default: bench/results/ocr_compare.json)",
    )
    ap.add_argument("--limit", type=int, default=0, help="Max docs (0 = all)")
    ap.add_argument(
        "--skip-ocr",
        action="store_true",
        help="Do not call Azure; score LLM predictions only",
    )
    ap.add_argument(
        "--ocr-text-dir",
        type=Path,
        default=None,
        help="Optional dir of {id}.txt OCR dumps (offline replay)",
    )
    args = ap.parse_args()

    labels = load_labels(args.labels)
    if args.limit and args.limit > 0:
        labels = labels[: args.limit]
    if not labels:
        print("No labels found.", file=sys.stderr)
        sys.exit(2)

    out_path = args.out or (RESULTS / "ocr_compare.json")

    pred_path = args.predictions
    if pred_path is None:
        candidate = RESULTS / "pred.jsonl"
        pred_path = candidate if candidate.exists() else None
    elif not pred_path.exists():
        # Allow `results/pred.jsonl` from backend/ to mean bench/results/
        alt = RESULTS / pred_path.name
        if alt.exists():
            print(f"Note: using {alt} (resolved from missing {pred_path})")
            pred_path = alt
        else:
            print(f"Predictions not found: {pred_path}", file=sys.stderr)
            pred_path = None

    preds: dict[str, dict] = load_predictions(pred_path) if pred_path else {}
    if preds:
        print(f"Loaded {len(preds)} LLM predictions from {pred_path}")
    elif args.predictions:
        print("No LLM predictions loaded.", file=sys.stderr)

    provider = None
    if not args.skip_ocr and args.ocr_text_dir is None:
        # Enable for this process if credentials exist (bench convenience).
        if os.getenv("AZURE_DI_ENDPOINT") and os.getenv("AZURE_DI_KEY"):
            os.environ.setdefault("OCR_ENABLED", "1")
            os.environ.setdefault("OCR_PROVIDER", "azure")
        try:
            from ocr import get_ocr_provider

            provider = get_ocr_provider(require_enabled=True)
            print(f"OCR provider: {provider.name} model={getattr(provider, 'model_id', '?')}")
        except Exception as e:
            print(
                f"OCR unavailable ({e}). Re-run with --skip-ocr or configure "
                f"AZURE_DI_ENDPOINT + AZURE_DI_KEY + OCR_ENABLED=1.",
                file=sys.stderr,
            )
            if not preds:
                sys.exit(2)
            print("Continuing with LLM predictions only...", file=sys.stderr)
            args.skip_ocr = True

    rows: list[dict] = []
    for i, label in enumerate(labels, 1):
        lid = label.get("id")
        src = label.get("source_file")
        print(f"[{i}/{len(labels)}] {lid} …", flush=True)

        ocr_text: str | None = None
        ocr_meta: dict | None = None

        if args.ocr_text_dir is not None:
            dump = args.ocr_text_dir / f"{lid}.txt"
            if dump.exists():
                ocr_text = dump.read_text(encoding="utf-8")
                ocr_meta = {"source": "ocr_text_dir", "path": str(dump)}
            else:
                ocr_meta = {"error": f"missing_ocr_dump:{dump.name}"}
        elif provider is not None:
            path = args.raw / (src or "")
            if not path.exists():
                ocr_meta = {"error": f"missing_raw:{src}"}
            else:
                t0 = time.monotonic()
                try:
                    result = provider.analyze(path.read_bytes(), guess_mime(path))
                    ocr_text = result.text or ""
                    ocr_meta = {
                        "provider": result.provider,
                        "model_id": result.model_id,
                        "page_count": result.page_count,
                        "word_count": len(result.words),
                        "latency_ms": int((time.monotonic() - t0) * 1000),
                    }
                    # Persist dump for offline re-score
                    dump_dir = RESULTS / "ocr_dumps"
                    dump_dir.mkdir(parents=True, exist_ok=True)
                    (dump_dir / f"{lid}.txt").write_text(ocr_text, encoding="utf-8")
                except Exception as e:  # noqa: BLE001
                    ocr_meta = {"error": str(e)}

        llm = preds.get(str(lid)) if preds else None
        rows.append(
            compare_one(label, ocr_text=ocr_text, ocr_meta=ocr_meta, llm_pred=llm)
        )

    summary = _summarize(rows)
    report = {
        "summary": summary,
        "rows": rows,
        "config": {
            "skip_ocr": bool(args.skip_ocr),
            "labels": str(args.labels),
            "predictions": str(pred_path) if pred_path else None,
            "n_labels": len(labels),
        },
    }
    args.out = out_path
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\n=== Phase E OCR compare summary ===")
    for k, v in summary.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.4f}")
        else:
            print(f"  {k}: {v}")
    print(f"Wrote {args.out}")

    # Soft guidance — not a hard CI fail (OCR eval is advisory until Phase B ships).
    g = summary.get("ocr_grounding_rate")
    llm = summary.get("llm_critical_accuracy")
    if g is not None and llm is not None:
        if g + 0.05 < llm:
            print(
                "\nVerdict hint: vision-LLM critical accuracy leads OCR grounding "
                "by >5pp — keep LLM as primary for handwritten path; use Azure Read "
                "for bounding boxes / review UI only."
            )
        elif llm + 0.05 < g:
            print(
                "\nVerdict hint: OCR grounding leads LLM — prioritize OCR text + "
                "cheap text-normalize for readable scans; reserve vision-LLM for hard docs."
            )
        else:
            print(
                "\nVerdict hint: OCR grounding ~= LLM accuracy — hybrid (OCR grounding "
                "+ vision for structure) is justified."
            )


if __name__ == "__main__":
    main()
