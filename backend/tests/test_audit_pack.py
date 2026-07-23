"""Unit tests for audit claim pack classification + workbook sheets."""
from __future__ import annotations

import io
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from audit_pack import build_claim_pack_sheets, build_claim_pack_xlsx, classify_audit_row


def test_classify_priority():
    assert classify_audit_row({"itc_eligibility": "ineligible_17_5", "recon_status": "matched"})[0] == "INELIGIBLE_17_5"
    assert classify_audit_row({"itc_eligibility": "blocked_vendor"})[0] == "BLOCKED_VENDOR"
    assert classify_audit_row({"recon_status": "mismatch"})[0] == "REBOOK"
    assert classify_audit_row({"recon_status": "missing_in_2b"})[0] == "FOLLOW_UP"
    assert classify_audit_row({"recon_status": "matched", "itc_eligibility": "eligible"})[0] == "CLAIM"
    assert classify_audit_row({"ims_status": "pending", "recon_status": "matched", "itc_eligibility": "eligible"})[0] == "FOLLOW_UP"


def test_workbook_sheets():
    invoices = [
        {"id": "1", "recon_status": "matched", "itc_eligibility": "eligible", "cgst": 9, "sgst": 9},
        {"id": "2", "recon_status": "missing_in_2b", "itc_eligibility": "missing_2b", "igst": 18},
        {"id": "3", "recon_status": "mismatch", "itc_eligibility": "unknown"},
    ]
    sheets = build_claim_pack_sheets(invoices)
    assert len(sheets["Claim_Now"]) == 1
    assert len(sheets["Follow_Up"]) == 1
    assert len(sheets["Rebook"]) == 1
    assert "Summary" in sheets

    blob = build_claim_pack_xlsx(invoices)
    xl = pd.ExcelFile(io.BytesIO(blob), engine="openpyxl")
    names = set(xl.sheet_names)
    assert "Summary" in names
    assert "Claim_Now" in names
    assert "Follow_Up" in names
    assert "Rebook" in names
