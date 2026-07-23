"""Unit tests for deterministic match_utils."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from match_utils import (
    best_b2b_match,
    clean_str,
    match_bank_leftovers,
    match_pr_to_b2b,
    normalize_invoice_number,
    pan_from_gstin,
    score_invoice_pair,
)


class TestNormalize:
    def test_clean_str_leading_zeros(self):
        assert clean_str("inv/00123") == "INV123" or "123" in clean_str("AB/00123")

    def test_normalize_strips_inv_prefix(self):
        assert normalize_invoice_number("INV-00456") == normalize_invoice_number("456")
        assert normalize_invoice_number("#789") == "789"

    def test_pan_from_gstin(self):
        assert pan_from_gstin("27AASPK8773A1ZB") == "AASPK8773A"


class TestScoreInvoicePair:
    def test_exact_match(self):
        pr = {
            "supplier_gstin": "27AASPK8773A1ZB",
            "invoice_number": "INV-100",
            "taxable_amount": 1000.0,
            "invoice_date": "2026-01-15",
        }
        b2b = {
            "supplier_gstin": "27AASPK8773A1ZB",
            "invoice_number": "100",
            "taxable_value": 1000.0,
            "invoice_date": "2026-01-15",
        }
        r = score_invoice_pair(pr, b2b, amount_tol=1.0)
        assert r.status == "matched"
        assert r.reason_code == "EXACT"

    def test_fuzzy_typo(self):
        pr = {
            "supplier_gstin": "27AASPK8773A1ZB",
            "invoice_number": "AB1234",
            "taxable_amount": 500.0,
            "invoice_date": "2026-02-01",
        }
        b2b = {
            "supplier_gstin": "27AASPK8773A1ZB",
            "invoice_number": "AB1235",
            "taxable_value": 500.0,
            "invoice_date": "2026-02-01",
        }
        r = score_invoice_pair(pr, b2b, amount_tol=1.0)
        assert r.status == "matched"
        assert r.reason_code in ("FUZZY_INV", "EXACT", "AMT_DATE")

    def test_amount_mismatch_exact_inv(self):
        pr = {
            "supplier_gstin": "27AASPK8773A1ZB",
            "invoice_number": "X1",
            "taxable_amount": 100.0,
            "invoice_date": "2026-01-01",
        }
        b2b = {
            "supplier_gstin": "27AASPK8773A1ZB",
            "invoice_number": "X1",
            "taxable_value": 200.0,
            "invoice_date": "2026-01-01",
        }
        r = score_invoice_pair(pr, b2b, amount_tol=1.0)
        assert r.status == "mismatch"

    def test_cross_gstin_same_pan(self):
        pr = {
            "supplier_gstin": "27AASPK8773A1ZB",
            "invoice_number": "T99",
            "taxable_amount": 777.0,
            "invoice_date": "2026-03-10",
        }
        # different check digit / state but same PAN body
        b2b = {
            "supplier_gstin": "29AASPK8773A1Z9",
            "invoice_number": "T99",
            "taxable_value": 777.0,
            "invoice_date": "2026-03-11",
        }
        r = score_invoice_pair(pr, b2b, amount_tol=1.0, allow_cross_gstin=True)
        assert r.status == "matched"
        assert r.reason_code == "CROSS_GSTIN"


class TestMatchPrToB2b:
    def test_greedy_one_to_one(self):
        pr_list = [
            {
                "id": "p1",
                "supplier_gstin": "27AASPK8773A1ZB",
                "invoice_number": "A1",
                "taxable_amount": 10,
                "invoice_date": "2026-01-01",
                "recon_status": "unreconciled",
            },
            {
                "id": "p2",
                "supplier_gstin": "27AASPK8773A1ZB",
                "invoice_number": "A2",
                "taxable_amount": 20,
                "invoice_date": "2026-01-02",
                "recon_status": "unreconciled",
            },
        ]
        b2b_list = [
            {
                "supplier_gstin": "27AASPK8773A1ZB",
                "invoice_number": "A1",
                "taxable_value": 10,
                "invoice_date": "2026-01-01",
            },
        ]
        updates = match_pr_to_b2b(pr_list, b2b_list, amount_tol=1.0, period="01-2026")
        by_id = {u["id"]: u for u in updates}
        assert by_id["p1"]["recon_status"] == "matched"
        assert by_id["p2"]["recon_status"] == "missing_in_2b"


class TestBankMatch:
    def test_bank_name_and_amount(self):
        txns = [
            {
                "id": "t1",
                "withdrawal": 1180.0,
                "allocated_amount": 0,
                "description": "NEFT RELIANCE INDUSTRIES LTD",
                "reference_no": "",
                "txn_date": "2026-01-20",
            }
        ]
        invs = [
            {
                "id": "i1",
                "supplier_name": "Reliance Industries Ltd",
                "total_amount": 1180.0,
                "paid_amount": 0,
                "invoice_date": "2026-01-18",
                "invoice_number": "R-1",
            }
        ]
        sugg = match_bank_leftovers(txns, invs, amount_tol=1.0)
        assert len(sugg) == 1
        assert sugg[0]["invoice_id"] == "i1"
        assert sugg[0]["bank_transaction_id"] == "t1"
