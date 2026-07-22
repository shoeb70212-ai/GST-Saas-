"""
Unit tests for Tally IR, XML generator, validator, and converter service.
"""
import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from converter_service import (
    apply_master_mappings,
    bank_df_to_document,
    detect_doc_type_from_dataframe,
    detect_doc_type_from_text,
    register_df_to_document,
    dataframe_to_document,
)
from tally_export import (
    balance_voucher,
    document_to_xml,
    export_document,
    invoices_to_document,
    normalize_ledger_name,
    to_tally_date,
    validate_tally_document,
    render_voucher_xml,
)
from tally_ir import (
    DocType,
    InvoiceBatchExportRequest,
    InvoiceExportItem,
    InvoiceLineItemExport,
    LedgerLeg,
    MasterDef,
    MasterKind,
    TallyDocument,
    VoucherIR,
    VoucherType,
)


class TestHelpers:
    def test_normalize_ledger_name(self):
        assert normalize_ledger_name("  Acme   Pvt  Ltd ") == "Acme Pvt Ltd"
        assert normalize_ledger_name(None) == ""

    def test_to_tally_date_formats(self):
        assert to_tally_date("2024-01-15") == "20240115"
        assert to_tally_date("20240115") == "20240115"
        assert to_tally_date("15/01/2024") == "20240115"
        assert to_tally_date("15-01-24") == "20240115"
        assert to_tally_date("") is None
        assert to_tally_date("not-a-date") is None


class TestValidator:
    def test_balanced_voucher_ok(self):
        doc = TallyDocument(
            vouchers=[
                VoucherIR(
                    vtype=VoucherType.PURCHASE,
                    date="2024-01-15",
                    number="P-1",
                    party="Vendor A",
                    ledger_legs=[
                        LedgerLeg(ledger="Vendor A", is_debit=False, amount=1180, is_party_ledger=True),
                        LedgerLeg(ledger="Purchase", is_debit=True, amount=1000),
                        LedgerLeg(ledger="CGST", is_debit=True, amount=90),
                        LedgerLeg(ledger="SGST", is_debit=True, amount=90),
                    ],
                )
            ],
            masters=[
                MasterDef(name="Vendor A", parent="Sundry Creditors"),
                MasterDef(name="Purchase", parent="Purchase Accounts"),
                MasterDef(name="CGST", parent="Duties & Taxes"),
                MasterDef(name="SGST", parent="Duties & Taxes"),
            ],
        )
        out, report = validate_tally_document(doc)
        assert report.ok
        assert report.voucher_count == 1
        assert not any(i.severity == "error" for i in report.issues)

    def test_auto_round_off(self):
        v = VoucherIR(
            vtype=VoucherType.PURCHASE,
            date="2024-01-15",
            ledger_legs=[
                LedgerLeg(ledger="Vendor", is_debit=False, amount=100.50),
                LedgerLeg(ledger="Purchase", is_debit=True, amount=100.00),
            ],
        )
        balanced, applied = balance_voucher(v, auto_balance=True)
        assert applied
        dr = sum(l.amount for l in balanced.ledger_legs if l.is_debit)
        cr = sum(l.amount for l in balanced.ledger_legs if not l.is_debit)
        assert abs(dr - cr) < 0.01

    def test_unbalanced_large_diff_errors(self):
        doc = TallyDocument(
            vouchers=[
                VoucherIR(
                    vtype=VoucherType.JOURNAL,
                    date="2024-01-15",
                    ledger_legs=[
                        LedgerLeg(ledger="A", is_debit=True, amount=500),
                        LedgerLeg(ledger="B", is_debit=False, amount=100),
                    ],
                )
            ]
        )
        _, report = validate_tally_document(doc, auto_balance=True)
        assert not report.ok
        assert any(i.code == "unbalanced" for i in report.issues)

    def test_invalid_date_errors(self):
        doc = TallyDocument(
            vouchers=[
                VoucherIR(
                    vtype=VoucherType.SALES,
                    date="bad",
                    ledger_legs=[
                        LedgerLeg(ledger="Party", is_debit=True, amount=100),
                        LedgerLeg(ledger="Sales", is_debit=False, amount=100),
                    ],
                )
            ]
        )
        _, report = validate_tally_document(doc)
        assert any(i.code == "invalid_date" for i in report.issues)


class TestXmlGenerator:
    def test_purchase_voucher_xml_shape(self):
        v = VoucherIR(
            vtype=VoucherType.PURCHASE,
            date="2024-03-01",
            number="INV-9",
            party="ABC Traders",
            ledger_legs=[
                LedgerLeg(ledger="ABC Traders", is_debit=False, amount=1180, is_party_ledger=True),
                LedgerLeg(ledger="Purchase", is_debit=True, amount=1000),
                LedgerLeg(ledger="CGST", is_debit=True, amount=90),
                LedgerLeg(ledger="SGST", is_debit=True, amount=90),
            ],
        )
        xml = render_voucher_xml(v)
        assert "<VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>" in xml
        assert "<DATE>20240301</DATE>" in xml
        assert "<VOUCHERNUMBER>INV-9</VOUCHERNUMBER>" in xml
        assert "<LEDGERNAME>ABC Traders</LEDGERNAME>" in xml
        assert "<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>" in xml
        assert "<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>" in xml
        assert "ALLLEDGERENTRIES.LIST" in xml

    def test_document_includes_masters(self):
        doc = TallyDocument(
            masters=[
                MasterDef(
                    name="ABC Traders",
                    parent="Sundry Creditors",
                    gstin="27AADCB2230M1Z2",
                    gst_registration_type="Regular",
                ),
                MasterDef(name="Purchase", parent="Purchase Accounts"),
            ],
            vouchers=[
                VoucherIR(
                    vtype=VoucherType.PURCHASE,
                    date="2024-03-01",
                    number="1",
                    party="ABC Traders",
                    ledger_legs=[
                        LedgerLeg(ledger="ABC Traders", is_debit=False, amount=100),
                        LedgerLeg(ledger="Purchase", is_debit=True, amount=100),
                    ],
                )
            ],
        )
        xml = document_to_xml(doc, include_masters=True)
        assert "<ENVELOPE>" in xml
        assert 'ACTION="Create"' in xml or "ACTION=\"Create\"" in xml
        assert "<LEDGER" in xml
        assert "27AADCB2230M1Z2" in xml
        assert "<VOUCHER" in xml

    def test_xml_escapes_special_chars(self):
        v = VoucherIR(
            vtype=VoucherType.JOURNAL,
            date="2024-01-01",
            narration="A & B <test>",
            ledger_legs=[
                LedgerLeg(ledger="Foo & Co", is_debit=True, amount=10),
                LedgerLeg(ledger="Bar", is_debit=False, amount=10),
            ],
        )
        xml = render_voucher_xml(v)
        assert "Foo &amp; Co" in xml
        assert "&lt;test&gt;" in xml

    def test_receipt_with_bank_alloc(self):
        from tally_ir import BankAlloc

        v = VoucherIR(
            vtype=VoucherType.RECEIPT,
            date="2024-02-10",
            party="Customer X",
            ledger_legs=[
                LedgerLeg(ledger="HDFC Bank", is_debit=True, amount=5000),
                LedgerLeg(ledger="Customer X", is_debit=False, amount=5000, is_party_ledger=True),
            ],
            bank=BankAlloc(
                date="2024-02-10",
                instrument_number="UTR123",
                transaction_type="Inter Bank Transfer",
                transfer_mode="NEFT",
                amount=5000,
            ),
        )
        xml = render_voucher_xml(v)
        assert "BANKALLOCATIONS.LIST" in xml
        assert "UTR123" in xml
        assert "NEFT" in xml


class TestInvoiceBatch:
    def test_invoices_to_document_and_export(self):
        req = InvoiceBatchExportRequest(
            invoices=[
                InvoiceExportItem(
                    id="inv1",
                    invoice_number="P-100",
                    invoice_date="2024-05-20",
                    supplier_name="Supplier One",
                    supplier_gstin="29AAAAA0000A1Z5",
                    expense_category="Office Supplies",
                    total_amount=1180,
                    taxable_amount=1000,
                    cgst_amount=90,
                    sgst_amount=90,
                )
            ],
            line_items=[
                InvoiceLineItemExport(
                    invoice_id="inv1",
                    description="Paper",
                    amount=1000,
                    quantity=10,
                    unit_price=100,
                )
            ],
        )
        doc = invoices_to_document(req)
        assert len(doc.vouchers) == 1
        assert any(m.name == "Supplier One" for m in doc.masters)
        result = export_document(doc)
        assert result["report"]["ok"]
        assert "<ENVELOPE>" in result["xml"]
        assert "Supplier One" in result["xml"]


class TestConverterDetection:
    def test_detect_sales_register(self):
        dtype, conf = detect_doc_type_from_text(
            "Sales Register for April 2024",
            ["Invoice Date", "Customer Name", "Invoice Amount", "CGST", "SGST"],
        )
        assert dtype == DocType.SALES_REGISTER
        assert conf >= 0.35

    def test_detect_purchase_register(self):
        dtype, conf = detect_doc_type_from_text(
            "Purchase Register",
            ["Bill Date", "Supplier Name", "GSTIN", "Taxable", "IGST"],
        )
        assert dtype == DocType.PURCHASE_REGISTER

    def test_detect_bank(self):
        dtype, conf = detect_doc_type_from_text(
            "Statement of Account",
            ["Date", "Narration", "Withdrawal", "Deposit", "Balance"],
        )
        assert dtype == DocType.BANK_STATEMENT


class TestConverterMapping:
    def test_purchase_register_df(self):
        df = pd.DataFrame(
            [
                {
                    "Invoice Date": "2024-01-10",
                    "Invoice Number": "PR-1",
                    "Supplier Name": "Vendor Z",
                    "GSTIN": "27AADCB2230M1Z2",
                    "Taxable Amount": 1000,
                    "CGST": 90,
                    "SGST": 90,
                    "Amount": 1180,
                }
            ]
        )
        doc = register_df_to_document(df, DocType.PURCHASE_REGISTER, filename="pr.xlsx")
        assert len(doc.vouchers) == 1
        assert doc.vouchers[0].vtype == VoucherType.PURCHASE
        assert doc.vouchers[0].party == "Vendor Z"
        out, report = validate_tally_document(doc)
        assert report.ok, report.issues

    def test_bank_df(self):
        df = pd.DataFrame(
            [
                {
                    "Date": "2024-01-05",
                    "Description": "NEFT from Customer A",
                    "Withdrawal": None,
                    "Deposit": 25000,
                    "Balance": 50000,
                },
                {
                    "Date": "2024-01-06",
                    "Description": "Payment to Vendor B",
                    "Withdrawal": 5000,
                    "Deposit": None,
                    "Balance": 45000,
                },
            ]
        )
        doc = bank_df_to_document(df, bank_ledger="ICICI Bank")
        assert len(doc.vouchers) == 2
        assert doc.vouchers[0].vtype == VoucherType.RECEIPT
        assert doc.vouchers[1].vtype == VoucherType.PAYMENT
        out, report = validate_tally_document(doc)
        assert report.ok, report.issues

    def test_master_mappings(self):
        doc = TallyDocument(
            masters=[MasterDef(name="Vendor Z", parent="Sundry Creditors")],
            vouchers=[
                VoucherIR(
                    vtype=VoucherType.PURCHASE,
                    date="2024-01-01",
                    party="Vendor Z",
                    ledger_legs=[
                        LedgerLeg(ledger="Vendor Z", is_debit=False, amount=100),
                        LedgerLeg(ledger="Purchase", is_debit=True, amount=100),
                    ],
                )
            ],
        )
        mapped = apply_master_mappings(doc, {"Vendor Z": "M/s Vendor Z (Tally)"})
        assert mapped.masters[0].mapped_to == "M/s Vendor Z (Tally)"
        assert mapped.masters[0].auto_create is False
        assert mapped.vouchers[0].party == "M/s Vendor Z (Tally)"
        xml = document_to_xml(mapped, include_masters=True)
        # Mapped masters should not be Create'd
        assert 'NAME="Vendor Z"' not in xml or "ACTION=\"Create\"" 
        assert "M/s Vendor Z (Tally)" in xml

    def test_dataframe_to_document_auto(self):
        df = pd.DataFrame(
            [
                {
                    "Date": "01-02-2024",
                    "Customer Name": "Buyer Co",
                    "Invoice Number": "S-1",
                    "Amount": 500,
                    "Taxable": 500,
                }
            ]
        )
        # Force sales
        doc, dtype, conf = dataframe_to_document(df, doc_type=DocType.SALES_REGISTER)
        assert dtype == DocType.SALES_REGISTER
        assert doc.vouchers[0].vtype == VoucherType.SALES
