"""
Invoice ingestion / preprocess helpers (Phase 2).

Adaptive DPI, blank-page skip, best-page scoring, hybrid markdown+image payloads.
"""
from __future__ import annotations

import base64
import io
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

HYBRID_MIME = "application/x-invoice-hybrid"

BASE_DPI = 150
HARD_DPI = 220
MAX_VISION_PAGES = 4
JPEG_QUALITY = 85
COMPACT_MAX_EDGE = 1280
BLANK_TEXT_CHARS = 30
BLANK_STDDEV = 10.0

GST_KEYWORDS = (
    "gstin",
    "invoice",
    "taxable",
    "cgst",
    "sgst",
    "igst",
    "hsn",
    "total",
    "amount",
    "qty",
    "rate",
)


def encode_hybrid(markdown: str, image_bytes: bytes, image_mime: str = "image/jpeg") -> bytes:
    payload = {
        "markdown": markdown or "",
        "image_b64": base64.b64encode(image_bytes).decode("ascii"),
        "image_mime": image_mime,
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def decode_hybrid(content: bytes | str) -> dict[str, Any]:
    raw = content if isinstance(content, str) else content.decode("utf-8")
    data = json.loads(raw)
    return {
        "markdown": str(data.get("markdown") or ""),
        "image_bytes": base64.b64decode(data.get("image_b64") or ""),
        "image_mime": str(data.get("image_mime") or "image/jpeg"),
    }


def hybrid_text_layer(content: bytes | str) -> str | None:
    try:
        md = decode_hybrid(content)["markdown"]
        return md or None
    except Exception:
        return None


def is_text_rich_markdown(md: str | None) -> bool:
    if not md or len(md) < 100:
        return False
    if "|" not in md:
        return False
    lower = md.lower()
    kw = sum(lower.count(k) for k in GST_KEYWORDS)
    return kw >= 3


def _page_text_stats(text: str) -> tuple[int, int]:
    lower = (text or "").lower()
    kw_score = sum(lower.count(kw) for kw in GST_KEYWORDS)
    return len(text.strip()), kw_score


def _pixmap_ink_stddev(pix) -> float:
    """Rough ink density via sampled grayscale stddev (no numpy)."""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("L")
        img.thumbnail((256, 256))
        pixels = list(img.getdata())
        if not pixels:
            return 0.0
        step = max(1, len(pixels) // 2000)
        sample = pixels[::step]
        mean = sum(sample) / len(sample)
        var = sum((p - mean) ** 2 for p in sample) / len(sample)
        return var**0.5
    except Exception:
        return 50.0  # assume non-blank if measure fails


def is_blank_page(text: str, pix=None) -> bool:
    chars, _kw = _page_text_stats(text)
    if chars >= BLANK_TEXT_CHARS:
        return False
    if pix is None:
        return chars < 8
    return _pixmap_ink_stddev(pix) < BLANK_STDDEV


def score_page(text: str, pix=None) -> float:
    """Higher = more relevant for GST invoice extraction."""
    chars, kw = _page_text_stats(text)
    if is_blank_page(text, pix):
        return -1.0
    score = float(kw * 12)
    score += min(chars / 40.0, 25.0)
    if "hsn" in text.lower() and "amount" in text.lower():
        score += 8.0
    if pix is not None:
        ink = _pixmap_ink_stddev(pix)
        score += min(ink / 5.0, 15.0)
    return score


def choose_dpi(text: str) -> int:
    """Hard/scanned pages get higher DPI for small tax digits."""
    chars, kw = _page_text_stats(text)
    if chars < 80 or kw < 2:
        return HARD_DPI
    return BASE_DPI


def select_best_pages(doc, *, max_pages: int = MAX_VISION_PAGES) -> list[tuple[int, float, int]]:
    """
    Returns list of (page_index, score, dpi) sorted by relevance, blanks skipped.
    """
    ranked: list[tuple[int, float, int]] = []
    for i in range(len(doc)):
        page = doc[i]
        text = page.get_text() or ""
        # Lightweight preview pixmap for blank/ink (72 dpi)
        try:
            preview = page.get_pixmap(dpi=72)
        except Exception:
            preview = None
        if is_blank_page(text, preview):
            logger.debug("Skipping blank page %s", i)
            continue
        sc = score_page(text, preview)
        dpi = choose_dpi(text)
        ranked.append((i, sc, dpi))

    ranked.sort(key=lambda t: t[1], reverse=True)
    if not ranked:
        # Fallback: first page at hard DPI
        return [(0, 0.0, HARD_DPI)]
    return ranked[:max_pages]


def render_pages_jpeg(doc, page_specs: list[tuple[int, float, int]]) -> bytes:
    """Render selected pages at adaptive DPI; stack vertically if multiple."""
    from PIL import Image

    images = []
    for idx, _score, dpi in page_specs:
        pix = doc[idx].get_pixmap(dpi=dpi)
        img = Image.open(io.BytesIO(pix.tobytes("jpeg")))
        images.append(img)

    if not images:
        raise ValueError("No pages to render.")

    if len(images) == 1:
        out = io.BytesIO()
        images[0].save(out, format="JPEG", quality=JPEG_QUALITY)
        return out.getvalue()

    total_h = sum(im.height for im in images)
    max_w = max(im.width for im in images)
    combined = Image.new("RGB", (max_w, total_h), (255, 255, 255))
    y = 0
    for im in images:
        combined.paste(im, (0, y))
        y += im.height
    out = io.BytesIO()
    combined.save(out, format="JPEG", quality=JPEG_QUALITY)
    return out.getvalue()


def compact_jpeg(image_bytes: bytes, *, max_edge: int = COMPACT_MAX_EDGE) -> bytes:
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes))
    if img.mode != "RGB":
        img = img.convert("RGB")
    img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=80, optimize=True)
    return out.getvalue()


def preprocess_pdf(
    content: bytes,
    password: str | None = None,
) -> tuple[bytes | str, str]:
    """
    PDF path: text-rich → markdown; hard → hybrid (md + compact image) or vision JPEG.
    """
    import fitz

    doc = fitz.open(stream=content, filetype="pdf")
    if not doc:
        raise ValueError("Could not read PDF pages.")
    if doc.needs_pass:
        if password and doc.authenticate(password):
            from utils import remove_pdf_password_if_present

            content = remove_pdf_password_if_present(content, password)
            doc = fitz.open(stream=content, filetype="pdf")
            if doc.needs_pass:
                doc.authenticate(password)
        else:
            raise ValueError(
                "This PDF is password-protected. Please provide the correct password."
            )

    md_text = ""
    try:
        import pymupdf4llm

        md_text = pymupdf4llm.to_markdown(doc) or ""
    except Exception as e:
        logger.info("Markdown extraction failed or skipped: %s", e)

    if is_text_rich_markdown(md_text):
        return md_text, "text/markdown"

    page_specs = select_best_pages(doc, max_pages=MAX_VISION_PAGES)
    jpeg = render_pages_jpeg(doc, page_specs)

    # Hard doc with some text layer → hybrid for grounding
    if md_text.strip() and len(md_text.strip()) >= 40:
        compact = compact_jpeg(jpeg)
        return encode_hybrid(md_text, compact), HYBRID_MIME

    return jpeg, "image/jpeg"


def preprocess_image(content: bytes, mime_type: str) -> tuple[bytes, str]:
    from PIL import Image

    img = Image.open(io.BytesIO(content))
    if img.width <= 2048 and img.height <= 2048 and img.format == "JPEG":
        return content, mime_type

    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "RGBA":
            bg.paste(img, mask=img.split()[3])
        else:
            bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[3])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    img.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    img.save(output, format="JPEG", quality=JPEG_QUALITY)
    return output.getvalue(), "image/jpeg"
