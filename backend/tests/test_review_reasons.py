"""Unit tests for Phase C typed review reasons."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from review_reasons import REVIEW_FIELD_SCORE_MIN, build_review_reasons, flagged_fields


def _base_ok() -> dict:
    return {
        "Supplier_GSTIN": "27AAPFU0939F1ZV",
        "Invoice_Number": "INV-1",
        "Invoice_Date": "01/01/2026",
        "Taxable_Amount": 100.0,
        "CGST_Amount": 9.0,
        "SGST_Amount": 9.0,
        "IGST_Amount": 0.0,
        "Total_Amount": 118.0,
        "Extraction_State": "auto_accepted",
        "Confidence_Score": 100.0,
        "Line_Items": [{"Amount": 100.0, "Tax_Rate": 18}],
    }


class TestReviewReasons:
    def test_tax_math_and_gstin(self):
        data = _base_ok()
        data["Total_Amount"] = 999.0
        data["Supplier_GSTIN"] = "27AAAAA0000A1Z0"  # bad checksum
        data["Extraction_State"] = "needs_review"
        data["Confidence_Score"] = 88
        reasons = build_review_reasons(data)
        codes = {r["code"] for r in reasons}
        assert "tax_math" in codes
        assert "gstin_invalid" in codes
        assert "Supplier_GSTIN" in flagged_fields(reasons)

    def test_missing_critical(self):
        data = _base_ok()
        data["Invoice_Number"] = None
        data["Extraction_State"] = "needs_review"
        reasons = build_review_reasons(data)
        assert any(
            r["code"] == "field_missing" and r["field"] == "Invoice_Number"
            for r in reasons
        )

    def test_ungrounded_when_text_layer(self):
        data = _base_ok()
        # Text layer has no invoice number
        reasons = build_review_reasons(
            data, text_layer="GSTIN 27AAPFU0939F1ZV Total 118.00"
        )
        assert any(
            r["code"] == "field_ungrounded" and r["field"] == "Invoice_Number"
            for r in reasons
        )

    def test_qr_override_info(self):
        data = _base_ok()
        data["QR_Overridden_Fields"] = ["Invoice_Number"]
        reasons = build_review_reasons(data)
        assert any(r["code"] == "qr_override" for r in reasons)

    def test_score_threshold_constant(self):
        assert 0 < REVIEW_FIELD_SCORE_MIN <= 1.0
