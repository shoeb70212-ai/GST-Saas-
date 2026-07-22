"""Extract Gemini + Sonnet teacher JSON arrays from the agent transcript."""
from __future__ import annotations

import json
import re
from pathlib import Path

TRANSCRIPT = Path(
    r"C:\Users\Junaid\.cursor\projects\d-GST-SAAS\agent-transcripts"
    r"\7589602b-58fe-4a93-9f52-fa21eff82984\7589602b-58fe-4a93-9f52-fa21eff82984.jsonl"
)
OUT = Path(__file__).resolve().parent / "data" / "labels" / "_drafts"


def collect_strings(obj, acc: list[str]) -> None:
    if isinstance(obj, str):
        if "wa-12113" in obj and "Supplier_GSTIN" in obj:
            acc.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            collect_strings(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            collect_strings(v, acc)


def extract_arrays(text: str) -> tuple[list | None, list | None]:
    """
    User message has two big JSON arrays: Gemini first, Sonnet second.
    Find array starts after marker phrases.
    """
    gemini = None
    sonnet = None

    # Prefer splitting on explicit markers from the user message
    lower = text
    g_marker = "This is the output from gemini"
    s_marker = "This is the output from sonnet"

    g_idx = lower.lower().find(g_marker.lower())
    s_idx = lower.lower().find(s_marker.lower())

    def first_json_array(blob: str) -> list | None:
        start = blob.find("[")
        if start < 0:
            return None
        # bracket scan
        depth = 0
        in_str = False
        esc = False
        for i, ch in enumerate(blob[start:], start=start):
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
                continue
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(blob[start : i + 1])
                    except json.JSONDecodeError:
                        return None
        return None

    if g_idx >= 0:
        end = s_idx if s_idx > g_idx else len(text)
        gemini = first_json_array(text[g_idx:end])
    if s_idx >= 0:
        sonnet = first_json_array(text[s_idx:])

    # Fallback: any two large arrays containing source_file
    if gemini is None or sonnet is None:
        arrays = []
        for m in re.finditer(r"\[\s*\{", text):
            arr = first_json_array(text[m.start() :])
            if arr and isinstance(arr, list) and arr and isinstance(arr[0], dict):
                if "source_file" in arr[0] and "fields" in arr[0]:
                    arrays.append(arr)
        if gemini is None and arrays:
            gemini = max(arrays, key=len)
        if sonnet is None and len(arrays) >= 2:
            # pick second-largest distinct
            ranked = sorted(arrays, key=len, reverse=True)
            for a in ranked:
                if a is not gemini and len(a) >= 5:
                    sonnet = a
                    break

    return gemini, sonnet


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    gemini = sonnet = None
    if TRANSCRIPT.exists():
        # Newest-first: search lines containing both markers or wa-12113
        best = ""
        for line in reversed(TRANSCRIPT.read_text(encoding="utf-8", errors="replace").splitlines()):
            if "wa-12113" not in line or "Supplier_GSTIN" not in line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            acc: list[str] = []
            collect_strings(obj, acc)
            if not acc:
                continue
            # longest string most likely full message
            best = max(acc, key=len)
            if "sonnet" in best.lower() or "Sonnet" in best:
                break
            if len(best) > 50000:
                break
        if best:
            gemini, sonnet = extract_arrays(best)

    if gemini is None:
        raise SystemExit("Could not extract Gemini array from transcript")
    if sonnet is None:
        print("WARN: Sonnet array not found — writing Gemini only")
        sonnet = []

    (OUT / "gemini.json").write_text(json.dumps(gemini, indent=2), encoding="utf-8")
    (OUT / "sonnet.json").write_text(json.dumps(sonnet, indent=2), encoding="utf-8")
    print(f"gemini={len(gemini)} sonnet={len(sonnet)}")
    print(f"wrote {OUT / 'gemini.json'}")
    print(f"wrote {OUT / 'sonnet.json'}")


if __name__ == "__main__":
    main()
