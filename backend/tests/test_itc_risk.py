"""Tests for ITC risk classification."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from itc_risk import classify_invoice, summarize_itc_risk


def test_missing_in_2b():
    elig, flags = classify_invoice(
        {"recon_status": "missing_in_2b", "itc_eligibility": "unknown"},
        None,
    )
    assert elig == "missing_2b"
    assert "MISSING_IN_2B" in flags


def test_cancelled_vendor():
    elig, flags = classify_invoice(
        {"recon_status": "matched", "itc_eligibility": "unknown"},
        "Cancelled",
    )
    assert elig == "blocked_vendor"
    assert "VENDOR_CANCELLED" in flags


def test_manual_17_5_preserved():
    elig, flags = classify_invoice(
        {"recon_status": "matched", "itc_eligibility": "ineligible_17_5"},
        "Active",
    )
    assert elig == "ineligible_17_5"
    assert "SECTION_17_5" in flags


def test_summarize_buckets():
    rows = [
        {
            "id": "1",
            "itc_eligibility": "missing_2b",
            "igst": 0,
            "cgst": 90,
            "sgst": 90,
            "itc_risk_flags": ["MISSING_IN_2B"],
        },
        {
            "id": "2",
            "itc_eligibility": "blocked_vendor",
            "igst": 180,
            "cgst": 0,
            "sgst": 0,
            "itc_risk_flags": ["VENDOR_CANCELLED"],
        },
    ]
    s = summarize_itc_risk(rows)
    assert s["buckets"]["missing_2b"]["amount"] == 180.0
    assert s["buckets"]["blocked_vendor"]["amount"] == 180.0
    assert s["blocked_itc_total"] == 360.0
