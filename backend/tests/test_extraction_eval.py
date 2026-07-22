"""
Offline extraction eval harness.

Hermetic (always in CI):
  - Score ground_truth_extract / expected fields through apply_tax_calculations
    + compute_confidence (no LLM).
  - Assert must_not_auto_accept cases never get auto_accepted.
  - Preprocess branch checks on fixture PDFs/JPEGs.

Live LLM (opt-in):
  RUN_LIVE_EXTRACTION_EVAL=1 pytest tests/test_extraction_eval.py -k live
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from extraction import (
    apply_tax_calculations,
    compute_confidence,
    preprocess_invoice_file,
    should_escalate,
)

FIXTURES = Path(__file__).parent / "fixtures" / "invoices"
MANIFEST = FIXTURES / "manifest.json"
CRITICAL_DEFAULT = [
    "Supplier_GSTIN",
    "Invoice_Number",
    "Invoice_Date",
    "Taxable_Amount",
    "Total_Amount",
]


def _load_manifest():
    assert MANIFEST.exists(), "Run generate_fixtures.py first"
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def _case_dir(case_meta: dict) -> Path:
    return FIXTURES / case_meta["path"]


def _load_expected(case_meta: dict) -> dict:
    return json.loads((_case_dir(case_meta) / "expected.json").read_text(encoding="utf-8"))


def _source_bytes(case_meta: dict) -> tuple[bytes, str]:
    src = _case_dir(case_meta) / case_meta["source"]
    data = src.read_bytes()
    if src.suffix.lower() == ".pdf":
        return data, "application/pdf"
    if src.suffix.lower() in (".jpg", ".jpeg"):
        return data, "image/jpeg"
    if src.suffix.lower() == ".png":
        return data, "image/png"
    return data, "application/octet-stream"


def _score_extract(extract: dict) -> dict:
    """Run tax + confidence on a candidate extraction dict."""
    data = dict(extract)
    data.setdefault("Line_Items", data.get("Line_Items") or [])
    return apply_tax_calculations(data)


def _field_matches(expected_val, actual_val) -> bool:
    if expected_val is None:
        return actual_val in (None, "", 0, 0.0)
    if isinstance(expected_val, float):
        try:
            return abs(float(actual_val) - expected_val) <= 1.0
        except (TypeError, ValueError):
            return False
    return str(actual_val).strip().upper() == str(expected_val).strip().upper()


class TestHermeticFixtureGates:
    def test_manifest_has_minimum_cases(self):
        m = _load_manifest()
        assert len(m["cases"]) >= 12

    def test_math_broken_never_auto_accepted(self):
        m = _load_manifest()
        case = next(c for c in m["cases"] if c["id"] == "math_broken")
        expected = _load_expected(case)
        gt = expected["ground_truth_extract"]
        scored = _score_extract(gt)
        assert scored["Extraction_State"] != "auto_accepted"
        assert expected["must_not_auto_accept"] is True

    def test_blurry_ground_truth_not_auto_accepted(self):
        m = _load_manifest()
        case = next(c for c in m["cases"] if c["id"] == "blurry_low_dpi")
        expected = _load_expected(case)
        gt = expected["ground_truth_extract"]
        scored = _score_extract(gt)
        assert scored["Extraction_State"] != "auto_accepted"

    def test_clean_intrastate_auto_accepts_when_math_ok(self):
        m = _load_manifest()
        case = next(c for c in m["cases"] if c["id"] == "clean_intrastate")
        expected = _load_expected(case)
        extract = {
            "Supplier_GSTIN": expected["Supplier_GSTIN"],
            "Supplier_Name": "Acme Traders Pvt Ltd",
            "Buyer_GSTIN": expected["Buyer_GSTIN"],
            "Invoice_Number": expected["Invoice_Number"],
            "Invoice_Date": expected["Invoice_Date"],
            "Invoice_Type": expected["Invoice_Type"],
            "Total_Amount": expected["Total_Amount"],
            "Line_Items": expected["Line_Items"],
            "Cess_Amount": None,
            "Round_Off": None,
        }
        scored = _score_extract(extract)
        assert scored["Extraction_State"] == "auto_accepted"
        assert scored["Confidence_Score"] >= 95

    def test_line_taxable_mismatch_blocks_auto_accept(self):
        data = {
            "Supplier_GSTIN": "27AADCB2230M1Z2",
            "Supplier_Name": "Test",
            "Invoice_Number": "X",
            "Invoice_Date": "01-01-2024",
            "Total_Amount": 1180.0,
            "Taxable_Amount": 500.0,  # wrong vs lines
            "Line_Items": [{"Amount": 1000.0, "Tax_Rate": 18.0}],
            "Buyer_GSTIN": "27AADCB1234M1Z1",
            "Cess_Amount": None,
            "Round_Off": None,
        }
        # apply_tax overwrites Taxable from lines — so force confidence after
        scored = apply_tax_calculations(data)
        # Taxable will be fixed to 1000; total 1180 matches → may auto_accept.
        # Explicit reconcile failure:
        broken = dict(scored)
        broken["Taxable_Amount"] = 100.0
        conf = compute_confidence(broken, 1180.0)
        assert conf["financial_ok"] is False
        assert conf["state"] != "auto_accepted"

    @pytest.mark.parametrize(
        "case_id",
        [
            "clean_intrastate",
            "clean_interstate",
            "credit_note",
            "math_broken",
            "bill_of_supply",
        ],
    )
    def test_preprocess_runs_on_fixture_source(self, case_id):
        m = _load_manifest()
        case = next(c for c in m["cases"] if c["id"] == case_id)
        raw, mime = _source_bytes(case)
        out, out_mime = preprocess_invoice_file(raw, mime)
        assert out_mime in (
            "text/markdown",
            "image/jpeg",
            "application/pdf",
            "application/x-invoice-hybrid",
        )
        assert out is not None
        if out_mime == "text/markdown":
            assert isinstance(out, str) and len(out) > 20
        else:
            assert isinstance(out, (bytes, bytearray)) and len(out) > 50


class TestEscalateHelpers:
    def test_should_escalate_on_needs_retry(self):
        assert should_escalate({"Extraction_State": "needs_retry", "Confidence_Score": 40})

    def test_should_escalate_on_weak_review(self):
        assert should_escalate({"Extraction_State": "needs_review", "Confidence_Score": 86})

    def test_no_escalate_on_auto_accepted(self):
        assert not should_escalate(
            {"Extraction_State": "auto_accepted", "Confidence_Score": 100}
        )

    def test_no_escalate_on_strong_review(self):
        assert not should_escalate(
            {
                "Extraction_State": "needs_review",
                "Confidence_Score": 92,
                "Supplier_GSTIN": "27AADCB2230M1ZT",
                "Invoice_Number": "INV-1",
                "Invoice_Date": "01-01-2024",
                "Taxable_Amount": 1000,
                "CGST_Amount": 90,
                "SGST_Amount": 90,
                "IGST_Amount": 0,
                "Total_Amount": 1180,
            }
        )

    def test_escalate_needs_review_with_disputed_field(self):
        assert should_escalate(
            {
                "Extraction_State": "needs_review",
                "Confidence_Score": 90,
                "Supplier_GSTIN": "27AADCB2230M1ZT",
                "Invoice_Number": None,
                "Invoice_Date": "01-01-2024",
                "Total_Amount": 1180,
            }
        )


class TestHermeticScorecard:
    """Aggregate fixture scorecard for CI visibility."""

    def test_all_must_not_auto_accept_cases(self):
        m = _load_manifest()
        failures = []
        for case in m["cases"]:
            expected = _load_expected(case)
            if not expected.get("must_not_auto_accept"):
                continue
            gt = expected.get("ground_truth_extract")
            if not gt:
                continue
            scored = _score_extract(gt)
            if scored["Extraction_State"] == "auto_accepted":
                failures.append(case["id"])
        assert failures == [], f"False auto_accepted on: {failures}"


@pytest.mark.skipif(
    os.getenv("RUN_LIVE_EXTRACTION_EVAL") != "1",
    reason="Set RUN_LIVE_EXTRACTION_EVAL=1 with API keys for live LLM eval",
)
class TestLiveExtractionEval:
    @pytest.mark.asyncio
    async def test_live_mini_then_optional_escalate(self):
        from extraction import run_ai_extraction

        m = _load_manifest()
        results = []
        for case in m["cases"]:
            if case["id"] == "blurry_low_dpi":
                continue  # optional / noisy
            expected = _load_expected(case)
            raw, mime = _source_bytes(case)
            content, out_mime = preprocess_invoice_file(raw, mime)
            data, tokens = await run_ai_extraction(content, out_mime)
            critical = expected.get("critical_fields") or CRITICAL_DEFAULT
            hits = 0
            for field in critical:
                if field not in expected:
                    continue
                if _field_matches(expected[field], data.get(field)):
                    hits += 1
            denom = max(1, sum(1 for f in critical if f in expected))
            if expected.get("must_not_auto_accept"):
                assert data.get("Extraction_State") != "auto_accepted", case["id"]
            for null_field in expected.get("must_null") or []:
                val = data.get(null_field)
                assert val in (None, "", [], 0, 0.0) or val is False, (
                    f"{case['id']}: {null_field} should be null, got {val!r}"
                )
            results.append(
                {
                    "id": case["id"],
                    "accuracy": hits / denom,
                    "state": data.get("Extraction_State"),
                    "escalated": data.get("Escalated"),
                    "tokens": tokens,
                }
            )
        # Soft bar: average critical accuracy on non-broken cases
        good = [r for r in results if r["id"] != "math_broken"]
        if good:
            avg = sum(r["accuracy"] for r in good) / len(good)
            assert avg >= 0.5, f"Live critical accuracy too low: {avg:.2f} {results}"
