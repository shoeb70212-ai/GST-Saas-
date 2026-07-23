"""
Unit tests for the Purchase-Register importer (import_service).

Covers: messy-header auto-detection, date/number normalization, taxable/total/tax
derivation, dedupe keys (in-file + against existing invoices), and per-row
validation states (clean → auto_accepted, bad GSTIN / broken math → needs_review).
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pandas as pd
import pytest

from import_service import (
    auto_detect_columns,
    compute_dedupe_key,
    purchase_register_df_to_invoices,
    validate_import_row,
    _to_iso_date,
)
from validators import gstin_check_char

# A guaranteed checksum-valid GSTIN (body + computed check char).
_BODY14 = "27AAPFU0939F1Z"
VALID_GSTIN = _BODY14 + gstin_check_char(_BODY14)


def _clean_df():
    return pd.DataFrame(
        {
            "GSTIN of Supplier": [VALID_GSTIN],
            "Invoice No.": ["INV-001"],
            "Invoice Date": ["15-05-2026"],
            "Supplier Name": ["Acme Ltd"],
            "Taxable Value": [1000],
            "CGST Amount": [90],
            "SGST Amount": [90],
            "Invoice Value": [1180],
        }
    )


class TestAutoDetectColumns:
    def test_maps_messy_headers(self):
        result = auto_detect_columns(_clean_df())
        m = result["mapping"]
        assert m["supplier_gstin"] == "GSTIN of Supplier"
        assert m["invoice_number"] == "Invoice No."
        assert m["invoice_date"] == "Invoice Date"
        assert m["supplier_name"] == "Supplier Name"
        assert m["taxable_amount"] == "Taxable Value"
        assert m["cgst_amount"] == "CGST Amount"
        assert m["sgst_amount"] == "SGST Amount"
        assert m["total_amount"] == "Invoice Value"
        assert result["unmapped_required"] == []

    def test_reports_unmapped_required(self):
        df = pd.DataFrame({"Foo": [1], "Bar": [2]})
        result = auto_detect_columns(df)
        assert set(result["unmapped_required"]) == {
            "supplier_gstin",
            "invoice_number",
            "invoice_date",
        }

    def test_detects_purchase_register_doctype(self):
        result = auto_detect_columns(_clean_df())
        # supplier + gstin + cgst signals → purchase register
        assert result["detected_doc_type"] in ("purchase_register", "sales_register")


class TestDateNormalization:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("15-05-2026", "2026-05-15"),
            ("15/05/2026", "2026-05-15"),
            ("2026-05-15", "2026-05-15"),
            ("", None),
            (None, None),
        ],
    )
    def test_to_iso_date(self, raw, expected):
        assert _to_iso_date(raw) == expected

    def test_pandas_timestamp(self):
        assert _to_iso_date(pd.Timestamp("2026-05-15")) == "2026-05-15"


class TestDedupeKey:
    def test_key_is_gstin_pipe_invoice(self):
        key = compute_dedupe_key(
            {"supplier_gstin": VALID_GSTIN, "invoice_number": "INV-001"}
        )
        assert key == f"{VALID_GSTIN}|inv-001"

    def test_key_normalizes_case_and_space(self):
        a = compute_dedupe_key(
            {"supplier_gstin": VALID_GSTIN.lower(), "invoice_number": " INV-001 "}
        )
        b = compute_dedupe_key(
            {"supplier_gstin": VALID_GSTIN, "invoice_number": "inv-001"}
        )
        assert a == b


class TestValidateImportRow:
    def test_clean_row_auto_accepted(self):
        report = validate_import_row(
            {
                "supplier_gstin": VALID_GSTIN,
                "invoice_number": "INV-001",
                "invoice_date": "2026-05-15",
                "taxable_amount": 1000,
                "cgst_amount": 90,
                "sgst_amount": 90,
                "total_amount": 1180,
            }
        )
        assert report["ok"] is True
        assert report["extraction_state"] == "auto_accepted"
        assert report["confidence_score"] == 100

    def test_bad_gstin_needs_review(self):
        report = validate_import_row(
            {
                "supplier_gstin": "27XXXXX0000X0X0",  # invalid checksum/format
                "invoice_number": "INV-002",
                "invoice_date": "2026-05-15",
                "taxable_amount": 1000,
                "total_amount": 1000,
            }
        )
        assert report["extraction_state"] == "needs_review"
        assert any(r["code"] == "gstin_invalid" for r in report["reasons"])

    def test_broken_math_needs_review(self):
        report = validate_import_row(
            {
                "supplier_gstin": VALID_GSTIN,
                "invoice_number": "INV-003",
                "invoice_date": "2026-05-15",
                "taxable_amount": 1000,
                "cgst_amount": 90,
                "sgst_amount": 90,
                "total_amount": 5000,  # does not reconcile
            }
        )
        assert report["extraction_state"] == "needs_review"
        assert any(r["code"] == "tax_math" for r in report["reasons"])

    def test_missing_required_needs_review(self):
        report = validate_import_row(
            {"supplier_gstin": VALID_GSTIN, "taxable_amount": 100, "total_amount": 100}
        )
        assert report["extraction_state"] == "needs_review"
        assert any(r["code"] == "field_missing" for r in report["reasons"])


class TestPurchaseRegisterToInvoices:
    def test_clean_file_produces_ready_row(self):
        result = purchase_register_df_to_invoices(_clean_df())
        assert result["summary"]["total"] == 1
        assert result["summary"]["ready"] == 1
        row = result["rows"][0]
        assert row["status"] == "ready"
        inv = row["invoice_data"]
        assert inv["supplier_gstin"] == VALID_GSTIN
        assert inv["invoice_number"] == "INV-001"
        assert inv["invoice_date"] == "2026-05-15"
        assert inv["taxable_amount"] == 1000
        assert inv["total_amount"] == 1180
        assert inv["gst_amount"] == 180

    def test_derives_total_from_taxable_plus_tax(self):
        df = _clean_df().drop(columns=["Invoice Value"])
        result = purchase_register_df_to_invoices(df)
        inv = result["rows"][0]["invoice_data"]
        assert inv["total_amount"] == 1180  # 1000 + 90 + 90

    def test_derives_taxable_from_total_minus_tax(self):
        df = _clean_df().drop(columns=["Taxable Value"])
        result = purchase_register_df_to_invoices(df)
        inv = result["rows"][0]["invoice_data"]
        assert inv["taxable_amount"] == 1000  # 1180 - 180

    def test_in_file_duplicate_flagged(self):
        df = pd.concat([_clean_df(), _clean_df()], ignore_index=True)
        result = purchase_register_df_to_invoices(df)
        statuses = [r["status"] for r in result["rows"]]
        assert statuses[0] == "ready"
        assert statuses[1] == "duplicate"
        assert result["summary"]["duplicates"] == 1

    def test_existing_key_flagged_duplicate(self):
        key = compute_dedupe_key(
            {"supplier_gstin": VALID_GSTIN, "invoice_number": "INV-001"}
        )
        result = purchase_register_df_to_invoices(
            _clean_df(), existing_keys={key}
        )
        assert result["rows"][0]["status"] == "duplicate"

    def test_user_mapping_override(self):
        df = pd.DataFrame(
            {
                "col_a": [VALID_GSTIN],
                "col_b": ["INV-9"],
                "col_c": ["15-05-2026"],
                "col_d": [500],
            }
        )
        mapping = {
            "supplier_gstin": "col_a",
            "invoice_number": "col_b",
            "invoice_date": "col_c",
            "taxable_amount": "col_d",
        }
        result = purchase_register_df_to_invoices(df, mapping=mapping)
        inv = result["rows"][0]["invoice_data"]
        assert inv["supplier_gstin"] == VALID_GSTIN
        assert inv["invoice_number"] == "INV-9"
        assert inv["taxable_amount"] == 500
