"""List gold-set files under bench/data/raw (gitignored)."""
from __future__ import annotations

import hashlib
import json
import mimetypes
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".pdf", ".tif", ".tiff"}


def inventory() -> list[dict]:
    if not RAW.exists():
        return []
    rows = []
    for p in sorted(RAW.iterdir()):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        if ext not in IMAGE_EXTS and ext != ".md":
            continue
        data = p.read_bytes()
        mime, _ = mimetypes.guess_type(p.name)
        rows.append(
            {
                "file": p.name,
                "ext": ext,
                "bytes": len(data),
                "mime": mime or "application/octet-stream",
                "sha256": hashlib.sha256(data).hexdigest()[:16],
                "is_document": ext in IMAGE_EXTS,
            }
        )
    return rows


def main() -> None:
    rows = inventory()
    docs = [r for r in rows if r["is_document"]]
    print(f"raw_dir={RAW}")
    print(f"total_files={len(rows)} documents={len(docs)}")
    print(json.dumps(docs[:5], indent=2))
    if len(docs) > 5:
        print(f"... and {len(docs) - 5} more")


if __name__ == "__main__":
    main()
