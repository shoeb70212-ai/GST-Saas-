"""Unit tests for IMS parse / deemed dates / sync."""
from __future__ import annotations

import os
import sys
from datetime import date

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ims import (
    deemed_accept_by,
    extract_invoice_list,
    map_ims_action,
    normalize_ims_row,
    summarize_ims,
    sync_ims_status_updates,
)


def test_map_actions():
    assert map_ims_action("P") == "pending"
    assert map_ims_action("A") == "accepted"
    assert map_ims_action("R") == "rejected"
    assert map_ims_action("accepted") == "accepted"


def test_deemed_accept_by():
    # March 2026 ends 31st + 30 = April 30
    assert deemed_accept_by("03-2026") == "2026-04-30"


def test_extract_list_variants():
    assert len(extract_invoice_list([{"inum": "1"}])) == 1
    assert len(extract_invoice_list({"invoices": [{"inum": "1"}]})) == 1
    assert len(extract_invoice_list({"data": {"b2b": [{"inum": "1"}]}})) == 1


def test_normalize_and_summarize():
    row = normalize_ims_row(
        {
            "ctin": "27AASPK8773A1ZB",
            "inum": "INV-1",
            "idt": "01-03-2026",
            "txval": 100,
            "action": "P",
        },
        period="03-2026",
        user_id="u1",
        client_id="c1",
    )
    assert row is not None
    assert row["ims_action"] == "pending"
    assert row["deemed_accept_by"] == "2026-04-30"
    s = summarize_ims([row], today=date(2026, 4, 25))
    assert s["counts"]["pending"] == 1
    assert s["deemed_soon"] == 1


def test_sync_ims_status():
    ims = [{"supplier_gstin": "27AASPK8773A1ZB", "invoice_number": "100", "ims_action": "accepted"}]
    invs = [
        {"id": "i1", "supplier_gstin": "27AASPK8773A1ZB", "invoice_number": "INV-100", "ims_status": "unknown"},
        {"id": "i2", "supplier_gstin": "27AASPK8773A1ZB", "invoice_number": "999", "ims_status": "unknown"},
    ]
    patches = sync_ims_status_updates(invs, ims)
    by_id = {p["id"]: p["ims_status"] for p in patches}
    assert by_id["i1"] == "accepted"
    assert by_id["i2"] == "not_in_ims"
