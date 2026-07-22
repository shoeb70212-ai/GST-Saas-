#!/usr/bin/env python3
"""
Smoke test: Excel/CSV register data -> IR -> validated Tally XML.
Run before deploy: python scripts/smoke_tally_excel.py
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from converter_service import dataframe_to_document, read_tabular_file  # noqa: E402
from tally_export import export_document, invoices_to_document  # noqa: E402
from tally_ir import (  # noqa: E402
    DocType,
    InvoiceBatchExportRequest,
    InvoiceExportItem,
    InvoiceLineItemExport,
)


def assert_xml_importable(xml: str, label: str) -> None:
    assert xml.startswith("<?xml"), f"{label}: missing XML declaration"
    assert "<ENVELOPE>" in xml, f"{label}: missing ENVELOPE"
    assert "<TALLYREQUEST>Import Data</TALLYREQUEST>" in xml, f"{label}: bad header"
    assert "<VOUCHER" in xml, f"{label}: no vouchers"
    assert "ALLLEDGERENTRIES.LIST" in xml, f"{label}: no ledger entries"
    print(f"  OK {label}: {xml.count('<VOUCHER')} voucher(s), {len(xml)} bytes")


def smoke_purchase_register_csv() -> None:
    csv = """Invoice Date,Invoice Number,Supplier Name,GSTIN,Taxable Amount,CGST,SGST,Amount
2024-04-01,PI-1001,Shree Supplies Pvt Ltd,27AADCB2230M1Z2,10000,900,900,11800
2024-04-02,PI-1002,Metro Traders,29AAAAA0000A1Z5,5000,450,450,5900
"""
    content = csv.encode("utf-8")
    df = read_tabular_file(content, "purchase_april.csv")
    doc, dtype, conf = dataframe_to_document(df, doc_type=DocType.PURCHASE_REGISTER, filename="purchase_april.csv")
    assert dtype == DocType.PURCHASE_REGISTER
    assert len(doc.vouchers) == 2, f"expected 2 vouchers, got {len(doc.vouchers)}"
    result = export_document(doc)
    assert result["report"]["ok"], result["report"]["issues"]
    assert_xml_importable(result["xml"], "Purchase register CSV")
    print(f"  Purchase register: confidence={conf:.2f}, masters={result['report']['master_create_count']}")


def smoke_sales_register_xlsx() -> None:
    df = pd.DataFrame(
        [
            {
                "Invoice Date": "2024-05-10",
                "Invoice Number": "SI-501",
                "Customer Name": "Retail Customer A",
                "GSTIN": "07AAAAA0000A1Z5",
                "Taxable Amount": 25000,
                "CGST": 2250,
                "SGST": 2250,
                "Amount": 29500,
            },
            {
                "Invoice Date": "2024-05-11",
                "Invoice Number": "SI-502",
                "Customer Name": "Wholesale B",
                "Taxable Amount": 8000,
                "IGST": 1440,
                "Amount": 9440,
            },
        ]
    )
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    buf.seek(0)
    df2 = read_tabular_file(buf.read(), "sales_may.xlsx")
    doc, dtype, _ = dataframe_to_document(df2, doc_type=DocType.SALES_REGISTER, filename="sales_may.xlsx")
    assert len(doc.vouchers) == 2
    result = export_document(doc)
    assert result["report"]["ok"], result["report"]["issues"]
    assert_xml_importable(result["xml"], "Sales register XLSX")
    assert "Sales" in result["xml"]


def smoke_bank_statement_csv() -> None:
    csv = """Date,Description,Withdrawal,Deposit,Balance
2024-06-01,Opening Balance,,,50000
2024-06-02,NEFT from Client Alpha,,25000,75000
2024-06-03,Payment to Vendor Beta,12000,,63000
2024-06-04,Cash deposited at branch,,5000,68000
"""
    df = read_tabular_file(csv.encode(), "hdfc_june.csv")
    doc, dtype, _ = dataframe_to_document(
        df, doc_type=DocType.BANK_STATEMENT, filename="hdfc_june.csv", bank_ledger="HDFC Current A/c"
    )
    # Opening balance row skipped; 3 txns
    assert len(doc.vouchers) >= 3, f"expected >=3 bank vouchers, got {len(doc.vouchers)}"
    result = export_document(doc)
    assert result["report"]["ok"], result["report"]["issues"]
    assert_xml_importable(result["xml"], "Bank statement CSV")
    assert "HDFC Current A/c" in result["xml"] or "HDFC" in result["xml"]


def smoke_invoice_batch_export() -> None:
    req = InvoiceBatchExportRequest(
        invoices=[
            InvoiceExportItem(
                id="x1",
                invoice_number="INV-77",
                invoice_date="2024-07-01",
                supplier_name="Test Vendor LLP",
                supplier_gstin="27AADCB2230M1Z2",
                expense_category="Professional Fees",
                total_amount=11800,
                taxable_amount=10000,
                cgst_amount=900,
                sgst_amount=900,
            )
        ],
        line_items=[
            InvoiceLineItemExport(
                invoice_id="x1",
                description="Consulting",
                amount=10000,
                quantity=1,
                unit_price=10000,
            )
        ],
    )
    doc = invoices_to_document(req)
    result = export_document(doc)
    assert result["report"]["ok"], result["report"]["issues"]
    assert_xml_importable(result["xml"], "Saved invoices batch")
    assert "Test Vendor LLP" in result["xml"]
    assert "<LEDGER" in result["xml"]


def main() -> int:
    print("Tally engine Excel smoke test")
    smoke_purchase_register_csv()
    smoke_sales_register_xlsx()
    smoke_bank_statement_csv()
    smoke_invoice_batch_export()
    print("\nAll smoke tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
