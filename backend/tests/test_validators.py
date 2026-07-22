"""Unit tests for deterministic invoice validators."""
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from validators import (
    gstin_check_char,
    validate_extraction,
    validate_gstin,
    validate_tax_arithmetic,
)


class TestGstin:
    def test_known_valid_gstin(self):
        # Well-known example from stdnum docs
        r = validate_gstin("27AAPFU0939F1ZV")
        assert r["ok"], r
        assert r["pan"] == "AAPFU0939F"
        assert r["state_code"] == "27"

    def test_checksum_mismatch(self):
        r = validate_gstin("27AAPFU0939F1ZO")
        assert not r["ok"]
        assert any("checksum" in e for e in r["errors"])

    def test_format_and_normalize(self):
        r = validate_gstin(" 27aapfu0939f1zv ")
        assert r["ok"]
        assert r["normalized"] == "27AAPFU0939F1ZV"

    def test_missing(self):
        r = validate_gstin(None)
        assert not r["ok"]
        assert "missing" in r["errors"]

    def test_check_char_helper(self):
        assert gstin_check_char("27AAPFU0939F1Z") == "V"


class TestTaxArithmetic:
    def test_balanced_header(self):
        data = {
            "Taxable_Amount": 1000,
            "CGST_Amount": 90,
            "SGST_Amount": 90,
            "Total_Amount": 1180,
            "Line_Items": [{"Amount": 1000, "Quantity": 10, "Unit_Price": 100}],
        }
        r = validate_tax_arithmetic(data)
        assert r["ok"], r

    def test_total_mismatch(self):
        data = {
            "Taxable_Amount": 1000,
            "CGST_Amount": 90,
            "SGST_Amount": 90,
            "Total_Amount": 2000,
        }
        r = validate_tax_arithmetic(data)
        assert not r["ok"]
        assert any("header_total" in i for i in r["issues"])

    def test_mixed_gst_flags(self):
        data = {
            "Taxable_Amount": 1000,
            "CGST_Amount": 50,
            "IGST_Amount": 50,
            "Total_Amount": 1100,
        }
        r = validate_tax_arithmetic(data)
        assert "mixed_cgst_igst" in r["issues"]


class TestAggregate:
    def test_validate_extraction(self):
        data = {
            "Supplier_GSTIN": "27AAPFU0939F1ZV",
            "Taxable_Amount": 100,
            "CGST_Amount": 9,
            "SGST_Amount": 9,
            "Total_Amount": 118,
        }
        r = validate_extraction(data)
        assert r["ok"]
        assert r["supplier_gstin"]["ok"]
