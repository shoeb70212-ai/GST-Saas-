"""
Draft gold labels via multi-model consensus (optional; needs API keys).

Does NOT auto-accept labels — writes drafts under data/labels/_drafts/
for human review before moving into data/labels/.

Usage (from backend/):
  python -m bench.build_labels --limit 5
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
DRAFTS = ROOT / "data" / "labels" / "_drafts"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=5)
    args = ap.parse_args()

    DRAFTS.mkdir(parents=True, exist_ok=True)
    if not RAW.exists():
        print(f"Missing {RAW} — copy samples first.")
        sys.exit(1)

    docs = [
        p
        for p in sorted(RAW.iterdir())
        if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
    ][: args.limit]

    print(
        "build_labels: consensus extraction not wired in this scaffold.\n"
        "Next step: call run_ai_extraction with primary+verify+optional Gemini,\n"
        "merge field votes, write draft JSON matching labels.schema.json.\n"
        f"Found {len(docs)} documents to draft (limit={args.limit}).\n"
        f"Drafts dir: {DRAFTS}"
    )
    manifest = [{"source_file": p.name, "status": "pending_consensus"} for p in docs]
    (DRAFTS / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {(DRAFTS / 'manifest.json')}")


if __name__ == "__main__":
    main()
