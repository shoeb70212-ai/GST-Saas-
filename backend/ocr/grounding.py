"""
Phase B — when/how to use classical OCR as grounding for extraction.

Policy (env-gated, safe defaults):
- ``OCR_ENABLED=0`` → never call the provider (production default).
- Skip digital-native ``text/markdown`` that is already text-rich.
- Run on ``image/*`` and hybrid payloads (and thin text) to produce a
  ``text_layer`` for field grounding + optional word boxes for review UI.
- OCR failures never fail the scan — caller gets ``None`` / empty meta.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from ocr.base import OcrResult, OcrWord
from preprocess import HYBRID_MIME, is_text_rich_markdown

logger = logging.getLogger(__name__)

# Cap boxes returned to the client (review UI); full text still used for grounding.
MAX_OCR_WORDS = int(os.getenv("OCR_MAX_WORDS", "400") or 400)
# Skip OCR when native markdown is already rich (saves $ / latency).
OCR_SKIP_IF_TEXT_RICH = os.getenv("OCR_SKIP_IF_TEXT_RICH", "1") not in (
    "0",
    "false",
    "False",
)
# Always attach boxes even when native text exists (costs an OCR call).
OCR_FORCE_BBOX = os.getenv("OCR_FORCE_BBOX", "0") in ("1", "true", "True")


def should_run_ocr(mime_type: str, text_layer: str | None) -> bool:
    """Decide whether to call the classical OCR provider for this payload."""
    from ocr import OCR_ENABLED

    if not OCR_ENABLED:
        return False
    if mime_type == "text/markdown":
        if OCR_FORCE_BBOX:
            return False  # no raster to OCR
        if OCR_SKIP_IF_TEXT_RICH and is_text_rich_markdown(text_layer):
            return False
        # Thin markdown without force → still skip (nothing to rasterize here)
        return False
    if mime_type.startswith("image/") or mime_type == HYBRID_MIME:
        if OCR_FORCE_BBOX:
            return True
        if OCR_SKIP_IF_TEXT_RICH and is_text_rich_markdown(text_layer):
            return False
        return True
    return False


def merge_text_layers(native: str | None, ocr_text: str | None) -> str | None:
    """Prefer the longer informative layer; concatenate when both useful."""
    n = (native or "").strip()
    o = (ocr_text or "").strip()
    if not n and not o:
        return None
    if not n:
        return o or None
    if not o:
        return n or None
    if o in n or n in o:
        return n if len(n) >= len(o) else o
    # OCR often catches handwritten bits missing from PDF text layer
    return f"{n}\n\n--- ocr ---\n\n{o}"


def words_to_payload(
    words: list[OcrWord],
    *,
    limit: int = MAX_OCR_WORDS,
    page_dims: dict[int, tuple[float, float]] | None = None,
) -> list[dict[str, Any]]:
    """
    Compact JSON-serializable word boxes for the review UI.

    When ``page_dims`` is known (Azure inches), polygons are normalized to 0–1
    so the frontend can overlay without knowing page units.
    """
    dims = page_dims or {}
    out: list[dict[str, Any]] = []
    for w in words[: max(0, limit)]:
        item: dict[str, Any] = {"t": w.text, "p": w.page}
        if w.confidence is not None:
            item["c"] = round(float(w.confidence), 3)
        if w.bbox:
            pw_ph = dims.get(w.page)
            if pw_ph and pw_ph[0] > 0 and pw_ph[1] > 0:
                pw, ph = pw_ph
                norm: list[float] = []
                for i, v in enumerate(w.bbox):
                    norm.append(round(float(v) / (pw if i % 2 == 0 else ph), 4))
                item["b"] = norm
                item["n"] = True  # normalized 0–1
            else:
                item["b"] = [round(float(x), 2) for x in w.bbox]
                item["n"] = False
        out.append(item)
    return out


def ocr_meta_from_result(
    result: OcrResult,
    *,
    latency_ms: int | None = None,
    used_for_grounding: bool = True,
) -> dict[str, Any]:
    return {
        "ocr_used": True,
        "ocr_provider": result.provider,
        "ocr_model": result.model_id,
        "ocr_page_count": result.page_count,
        "ocr_word_count": len(result.words),
        "ocr_chars": len(result.text or ""),
        "ocr_latency_ms": latency_ms,
        "ocr_grounding": used_for_grounding,
    }


def try_ocr_analyze(
    content: bytes | str,
    mime_type: str,
) -> tuple[OcrResult | None, dict[str, Any]]:
    """
    Best-effort OCR. Returns (result|None, meta). Never raises to caller.
    """
    import time

    from qr_decode import image_bytes_from_content

    meta: dict[str, Any] = {"ocr_used": False}
    try:
        from ocr import get_ocr_provider

        image_bytes = image_bytes_from_content(content, mime_type)
        if not image_bytes and isinstance(content, (bytes, bytearray)):
            # Direct PDF/image bytes when mime is image/* already handled;
            # for application/pdf preprocess usually already converted.
            if mime_type.startswith("image/"):
                image_bytes = bytes(content)
        if not image_bytes:
            meta["ocr_skip_reason"] = "no_raster"
            return None, meta

        provider = get_ocr_provider(require_enabled=True)
        t0 = time.monotonic()
        # Analyze as image/jpeg when we extracted a compact hybrid frame
        analyze_mime = mime_type if mime_type.startswith("image/") else "image/jpeg"
        result = provider.analyze(image_bytes, analyze_mime)
        latency = int((time.monotonic() - t0) * 1000)
        meta = ocr_meta_from_result(result, latency_ms=latency)
        return result, meta
    except Exception as e:  # noqa: BLE001 - never fail the scan
        logger.warning("OCR grounding skipped: %s", e)
        return None, {"ocr_used": False, "ocr_error": str(e)[:240]}
