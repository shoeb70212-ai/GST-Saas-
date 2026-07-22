"""Phase B — OCR grounding policy + merge helpers (hermetic)."""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ocr.base import OcrResult, OcrWord
from ocr.grounding import (
    merge_text_layers,
    should_run_ocr,
    words_to_payload,
)
from preprocess import HYBRID_MIME


class TestShouldRunOcr:
    def test_disabled_by_default(self):
        with patch("ocr.OCR_ENABLED", False):
            assert should_run_ocr("image/jpeg", None) is False

    def test_runs_on_image_when_enabled(self):
        with patch("ocr.OCR_ENABLED", True):
            assert should_run_ocr("image/jpeg", None) is True
            assert should_run_ocr(HYBRID_MIME, "short") is True

    def test_skips_rich_markdown(self):
        rich = (
            "| GSTIN | Invoice | Taxable | CGST | SGST | Total | Amount | Qty | Rate |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| x | y | 1 | 2 | 3 | 4 | 5 | 6 | 7 |\n"
        )
        with patch("ocr.OCR_ENABLED", True):
            assert should_run_ocr("text/markdown", rich) is False


class TestMergeAndWords:
    def test_merge_prefers_union(self):
        assert merge_text_layers(None, "ocr only") == "ocr only"
        assert merge_text_layers("native", None) == "native"
        assert "ocr" in (merge_text_layers("aaa", "bbb") or "").lower()

    def test_words_payload_compact(self):
        words = [
            OcrWord(text="27AASPK8773A1ZB", confidence=0.99, bbox=(1, 2, 3, 4), page=1)
        ]
        payload = words_to_payload(words)
        assert payload[0]["t"] == "27AASPK8773A1ZB"
        assert payload[0]["c"] == 0.99
        assert payload[0]["b"] == [1.0, 2.0, 3.0, 4.0]


class TestApplyOcrGrounding:
    def test_apply_merges_text_and_boxes(self):
        from extraction import _apply_ocr_grounding

        fake = OcrResult(
            text="GSTIN 27ALAPG0234F1ZS Total 400.00",
            words=[OcrWord(text="27ALAPG0234F1ZS", confidence=0.9, page=1)],
            provider="azure_read",
            model_id="prebuilt-read",
        )
        with (
            patch("ocr.OCR_ENABLED", True),
            patch("ocr.grounding.try_ocr_analyze", return_value=(fake, {"ocr_used": True})),
        ):
            text, meta, words = _apply_ocr_grounding(
                b"fake-jpeg", "image/jpeg", None
            )
        assert "27ALAPG0234F1ZS" in (text or "")
        assert meta.get("ocr_grounding") is True
        assert words and words[0]["t"] == "27ALAPG0234F1ZS"

    def test_apply_noop_when_disabled(self):
        from extraction import _apply_ocr_grounding

        with patch("ocr.OCR_ENABLED", False):
            text, meta, words = _apply_ocr_grounding(
                b"x", "image/jpeg", "native"
            )
        assert text == "native"
        assert meta.get("ocr_used") is False
        assert words is None
