"""Phase 2 preprocess: adaptive DPI, blank skip, scoring, hybrid payload."""
from __future__ import annotations

import io
import os
import sys

import pytest
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")

from preprocess import (
    BASE_DPI,
    HARD_DPI,
    HYBRID_MIME,
    choose_dpi,
    decode_hybrid,
    encode_hybrid,
    is_blank_page,
    is_text_rich_markdown,
    score_page,
)


class TestMarkdownRichness:
    def test_rich_requires_table_and_keywords(self):
        md = (
            "| HSN | Description | Amount |\n|---|---|---|\n| 8471 | Widget | 1000 |\n"
            "| 9988 | Service | 500 |\n\n"
            "Tax Invoice GSTIN 27AAPFU0939F1ZV invoice taxable CGST SGST total amount qty rate\n"
            "Buyer details and payment terms appear below the table for length.\n"
        )
        assert len(md) >= 100
        assert is_text_rich_markdown(md) is True

    def test_short_or_no_table_not_rich(self):
        assert is_text_rich_markdown("short") is False
        assert is_text_rich_markdown("invoice gstin amount without pipes " * 5) is False


class TestPageScoring:
    def test_blank_low_text(self):
        assert is_blank_page("   ") is True
        assert is_blank_page("GSTIN invoice taxable CGST amount rate qty") is False

    def test_gst_page_scores_higher(self):
        weak = score_page("hello world page")
        strong = score_page(
            "Tax Invoice GSTIN 27AAPFU0939F1ZV HSN amount CGST SGST taxable total"
        )
        assert strong > weak

    def test_choose_dpi_hard_vs_base(self):
        assert choose_dpi("x") == HARD_DPI
        rich = "gstin invoice taxable cgst sgst igst hsn total amount qty rate " * 3
        assert choose_dpi(rich) == BASE_DPI


class TestHybridCodec:
    def test_roundtrip(self):
        img = Image.new("RGB", (40, 40), (255, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        raw = encode_hybrid("GSTIN 27AAPFU0939F1ZV", buf.getvalue())
        decoded = decode_hybrid(raw)
        assert "GSTIN" in decoded["markdown"]
        assert len(decoded["image_bytes"]) > 20
        assert decoded["image_mime"] == "image/jpeg"


class TestPreprocessPdf:
    def _pdf_bytes(self, pages_text: list[str]) -> bytes:
        import fitz

        doc = fitz.open()
        for text in pages_text:
            page = doc.new_page()
            page.insert_text((72, 72), text)
        out = io.BytesIO()
        doc.save(out)
        doc.close()
        return out.getvalue()

    def test_blank_middle_page_skipped_vision_path(self):
        from extraction import preprocess_invoice_file

        # No table markdown → vision/hybrid path; blank page should not crash
        content = self._pdf_bytes(
            [
                "Tax Invoice GSTIN 27AAPFU0939F1ZV HSN amount CGST SGST taxable total qty rate",
                "   ",
                "Page three filler without keywords",
            ]
        )
        out, mime = preprocess_invoice_file(content, "application/pdf")
        assert mime in ("image/jpeg", HYBRID_MIME, "text/markdown")
        assert out is not None

    def test_image_passthrough_small_jpeg(self):
        from extraction import preprocess_invoice_file

        img = Image.new("RGB", (100, 80), (240, 240, 240))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        raw = buf.getvalue()
        out, mime = preprocess_invoice_file(raw, "image/jpeg")
        assert mime == "image/jpeg"
        assert out == raw


class TestMessagesHybrid:
    def test_messages_content_hybrid_has_text_and_image(self):
        import extraction as ext

        img = Image.new("RGB", (32, 32), (200, 200, 200))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        payload = encode_hybrid("Invoice No INV-1 Total 1180", buf.getvalue())
        parts = ext._messages_content(payload, HYBRID_MIME)
        assert any(p.get("type") == "text" for p in parts)
        assert any(p.get("type") == "image_url" for p in parts)
        layer = ext._text_layer_from_content(payload, HYBRID_MIME)
        assert layer and "INV-1" in layer
