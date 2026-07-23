"""Bank Tier-2 rules produce suggestions without calling OpenAI."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from match_utils import match_bank_leftovers


def test_bank_rules_tier2_suggestions_without_llm():
    leftover_txns = [
        {
            "id": "t1",
            "withdrawal": 500.0,
            "allocated_amount": 0,
            "description": "UPI ACME TRADERS PVT",
            "reference_no": "",
            "txn_date": "2026-01-10",
        }
    ]
    unpaid = [
        {
            "id": "i1",
            "supplier_name": "Acme Traders Pvt Ltd",
            "invoice_number": "A-1",
            "total_amount": 500.0,
            "paid_amount": 0,
            "invoice_date": "2026-01-08",
        }
    ]
    sugg = match_bank_leftovers(leftover_txns, unpaid, amount_tol=1.0)
    assert len(sugg) == 1
    assert sugg[0]["invoice_id"] == "i1"
    assert sugg[0]["bank_transaction_id"] == "t1"
    assert sugg[0]["match_type"] in ("EXACT", "PARTIAL")
    assert os.getenv("BANK_AI_MATCH", "0") in ("0", "false", "False", "")
