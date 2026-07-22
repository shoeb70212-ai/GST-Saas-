"""Hermetic tests for Phase D vendor correction memory."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from vendor_memory import (
    apply_exact_rules,
    build_prompt_hints,
    deltas_from_snapshot,
    early_vendor_gstin,
    snapshot_fields,
)


class TestExactRules:
    def test_conditional_replace(self):
        data = {"Invoice_Number": "WRONG-1", "Total_Amount": 100.0}
        rules = [
            {
                "rule_kind": "exact",
                "field_name": "Invoice_Number",
                "from_value": "WRONG-1",
                "to_value": "INV-99",
            }
        ]
        applied = apply_exact_rules(data, rules)
        assert applied == ["Invoice_Number"]
        assert data["Invoice_Number"] == "INV-99"

    def test_no_match_leaves_value(self):
        data = {"Invoice_Number": "KEEP"}
        rules = [
            {
                "rule_kind": "exact",
                "field_name": "Invoice_Number",
                "from_value": "OTHER",
                "to_value": "X",
            }
        ]
        assert apply_exact_rules(data, rules) == []
        assert data["Invoice_Number"] == "KEEP"

    def test_gstin_normalize_match(self):
        data = {"Supplier_GSTIN": "27aapfu0939f1zv"}
        rules = [
            {
                "rule_kind": "exact",
                "field_name": "Supplier_GSTIN",
                "from_value": "27AAPFU0939F1ZV",
                "to_value": "27AAPFU0939F1ZV",
            }
        ]
        # same after normalize — still "applied" if coerce runs; from==to may still write
        apply_exact_rules(data, rules)
        assert data["Supplier_GSTIN"] == "27AAPFU0939F1ZV"


class TestHintsAndDeltas:
    def test_prompt_hints(self):
        rules = [
            {
                "rule_kind": "hint",
                "field_name": "Supplier_Name",
                "hint_text": "Prefer 'ABHISHEK TRADING' over 'ABHI SHEK'",
            }
        ]
        block = build_prompt_hints(rules)
        assert "Vendor correction memory" in block
        assert "ABHISHEK" in block

    def test_deltas_exact_and_hint(self):
        snap = {
            "Invoice_Number": "BAD",
            "Supplier_Name": "Misread Co",
            "Total_Amount": 10,
        }
        final = {
            "Invoice_Number": "GOOD",
            "Supplier_Name": "Real Co",
            "Total_Amount": 10,
            "Supplier_GSTIN": "27AAPFU0939F1ZV",
        }
        deltas = deltas_from_snapshot(snap, final)
        kinds = {d["field_name"]: d["rule_kind"] for d in deltas}
        assert kinds["Invoice_Number"] == "exact"
        assert kinds["Supplier_Name"] == "hint"
        assert "Total_Amount" not in kinds

    def test_snapshot_fields(self):
        s = snapshot_fields({"Invoice_Number": "1", "Foo": "x", "Supplier_Name": "A"})
        assert "Invoice_Number" in s
        assert "Foo" not in s


class TestEarlyGstin:
    def test_from_text_layer(self):
        text = "Supplier GSTIN: 27AAPFU0939F1ZV Invoice"
        g = early_vendor_gstin(text_layer=text)
        assert g == "27AAPFU0939F1ZV"
