"""Hermetic tests for OCR adapters + Phase E compare scoring."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from bench.run_ocr_compare import compare_one, score_grounding, _summarize
from ocr.azure_read import parse_azure_result
from ocr.field_hints import (
    extract_gstins,
    gold_value_in_text,
    hint_fields_from_ocr,
)


class FakePage:
    def __init__(self, page_number, words):
        self.page_number = page_number
        self.words = words


class FakeWord:
    def __init__(self, content, confidence=0.99, polygon=None):
        self.content = content
        self.confidence = confidence
        self.polygon = polygon or [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]


class FakeResult:
    def __init__(self, content, pages):
        self.content = content
        self.pages = pages


class TestParseAzure:
    def test_dict_shape(self):
        raw = {
            "content": "GSTIN 27AASPK8773A1ZB Total 100.00",
            "pages": [
                {
                    "page_number": 1,
                    "words": [
                        {
                            "content": "27AASPK8773A1ZB",
                            "confidence": 0.98,
                            "polygon": [1, 2, 3, 4, 5, 6, 7, 8],
                        }
                    ],
                }
            ],
        }
        r = parse_azure_result(raw, model_id="prebuilt-read")
        assert "27AASPK8773A1ZB" in r.text
        assert len(r.words) == 1
        assert r.words[0].confidence == 0.98
        assert r.words[0].bbox == (1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0)
        assert r.provider == "azure_read"

    def test_object_shape(self):
        result = FakeResult(
            content="hello",
            pages=[FakePage(1, [FakeWord("hello", 0.9)])],
        )
        r = parse_azure_result(result)
        assert r.text == "hello"
        assert r.words[0].text == "hello"
        assert r.page_count == 1


class TestFieldHints:
    def test_extract_gstins(self):
        text = "Supplier GSTIN: 27AASPK8773A1ZB Buyer 27EGNPS6284K3ZB"
        g = extract_gstins(text)
        assert g[0] == "27AASPK8773A1ZB"
        assert g[1] == "27EGNPS6284K3ZB"

    def test_hint_fields(self):
        text = "Invoice Date 02-06-2026 GSTIN 27AASPK8773A1ZB Grand Total 244445.00"
        h = hint_fields_from_ocr(text)
        assert h["Supplier_GSTIN"] == "27AASPK8773A1ZB"
        assert h["Total_Amount"] == 244445.0

    def test_gold_grounding_gstin_and_amount(self):
        text = "GSTIN 27ALAPG0234F1ZS Amount Rs. 400.00"
        assert gold_value_in_text("Supplier_GSTIN", "27ALAPG0234F1ZS", text) is True
        assert gold_value_in_text("Total_Amount", 400.0, text) is True
        assert gold_value_in_text("Supplier_GSTIN", "27AAAAA0000A1Z5", text) is False
        assert gold_value_in_text("Invoice_Number", None, text) is None


class TestCompare:
    def test_compare_one_grounding_and_llm(self):
        label = {
            "id": "t1",
            "source_file": "x.jpeg",
            "difficulty": "handwritten",
            "fields": {
                "Supplier_GSTIN": "27ALAPG0234F1ZS",
                "Invoice_Number": "300",
                "Invoice_Date": "21/07/2026",
                "Taxable_Amount": 400.0,
                "CGST_Amount": 0.0,
                "SGST_Amount": 0.0,
                "IGST_Amount": 0.0,
                "Total_Amount": 400.0,
            },
            "critical_fields": [
                "Supplier_GSTIN",
                "Invoice_Number",
                "Total_Amount",
            ],
        }
        ocr = "NEW JANTA ... GSTIN 27ALAPG0234F1ZS Inv No 300 Total 400.00"
        llm = {
            "id": "t1",
            "Supplier_GSTIN": "27ALAPG0234F1ZS",
            "Invoice_Number": "300",
            "Total_Amount": 400.0,
            "Extraction_Model": "test-model",
        }
        row = compare_one(
            label,
            ocr_text=ocr,
            ocr_meta={"provider": "azure_read"},
            llm_pred=llm,
        )
        assert row["grounding_rate"] == 1.0
        assert row["hint_gstin_ok"] is True
        assert row["llm_critical_accuracy"] == 1.0

    def test_summarize(self):
        rows = [
            {
                "grounding_hits": 2,
                "grounding_total": 3,
                "hint_gstin_ok": True,
                "llm_hits": 3,
                "llm_total": 3,
            },
            {
                "grounding_hits": 1,
                "grounding_total": 3,
                "hint_gstin_ok": False,
                "llm_hits": 2,
                "llm_total": 3,
            },
        ]
        s = _summarize(rows)
        assert s["n_docs"] == 2
        assert abs(s["ocr_grounding_rate"] - 0.5) < 1e-9
        assert abs(s["ocr_supplier_gstin_accuracy"] - 0.5) < 1e-9
        assert abs(s["llm_critical_accuracy"] - 5 / 6) < 1e-9
