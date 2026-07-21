#!/usr/bin/env python3
"""
Generate synthetic GST invoice golden fixtures (no real client samples).

Usage (from backend/):
  python tests/fixtures/invoices/generate_fixtures.py

Creates cases under tests/fixtures/invoices/cases/<id>/ with source.pdf|jpg
and expected.json, plus a root manifest.json.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent
CASES = ROOT / "cases"


def _pdf_from_lines(lines: list[str], multipage: bool = False) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    y = 50
    for line in lines:
        if multipage and y > 750:
            page = doc.new_page(width=595, height=842)
            y = 50
        page.insert_text((50, y), line, fontsize=11)
        y += 16
    if multipage:
        # Force a second page with continuation table
        page2 = doc.new_page(width=595, height=842)
        page2.insert_text((50, 50), "TAX INVOICE (continued)", fontsize=14)
        page2.insert_text((50, 80), "Line 2 | HSN 8471 | Qty 1 | Rate 500 | Amount 500 | GST 18%", fontsize=11)
        page2.insert_text((50, 100), "Taxable: 1500  CGST: 135  SGST: 135  Total: 1770", fontsize=11)
    out = doc.tobytes()
    doc.close()
    return out


def _blurry_jpeg(text_lines: list[str]) -> bytes:
    img = Image.new("RGB", (800, 1000), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    y = 40
    for line in text_lines:
        draw.text((40, y), line, fill=(20, 20, 20))
        y += 28
    img = img.filter(ImageFilter.GaussianBlur(radius=6))
    img = img.resize((400, 500), Image.Resampling.BILINEAR)
    from io import BytesIO

    buf = BytesIO()
    img.save(buf, format="JPEG", quality=35)
    return buf.getvalue()


def _write_case(case_id: str, source: bytes, ext: str, expected: dict, tags: list[str]):
    d = CASES / case_id
    d.mkdir(parents=True, exist_ok=True)
    (d / f"source.{ext}").write_bytes(source)
    (d / "expected.json").write_text(json.dumps(expected, indent=2), encoding="utf-8")
    return {
        "id": case_id,
        "path": f"cases/{case_id}",
        "source": f"source.{ext}",
        "tags": tags,
        "license": "synthetic-khatalens",
        "attribution": "Programmatically generated; not a real vendor invoice.",
    }


def main():
    CASES.mkdir(parents=True, exist_ok=True)
    manifest_cases = []

    # 1. Clean intrastate (MH→MH)
    lines = [
        "TAX INVOICE",
        "Supplier: Acme Traders Pvt Ltd",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer: Beta Retail LLP",
        "Buyer GSTIN: 27AADCB1234M1Z1",
        "Place of Supply: Maharashtra",
        "Invoice Number: INV-INTRA-001",
        "Invoice Date: 15-01-2024",
        "Description | HSN | Qty | Rate | Amount | Tax%",
        "Widgets | 8471 | 2 | 500 | 1000 | 18",
        "Taxable Amount: 1000.00",
        "CGST 9%: 90.00",
        "SGST 9%: 90.00",
        "Round Off: 0.00",
        "Total Amount: 1180.00",
        "Reverse Charge: No",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Buyer_GSTIN": "27AADCB1234M1Z1",
        "Invoice_Number": "INV-INTRA-001",
        "Invoice_Date": "15-01-2024",
        "Invoice_Type": "Tax Invoice",
        "Taxable_Amount": 1000.0,
        "Total_Amount": 1180.0,
        "CGST_Amount": 90.0,
        "SGST_Amount": 90.0,
        "IGST_Amount": 0.0,
        "Line_Items": [
            {
                "Description": "Widgets",
                "HSN_SAC": "8471",
                "Quantity": 2,
                "Unit_Price": 500,
                "Amount": 1000,
                "Tax_Rate": 18,
            }
        ],
        "must_match_math": True,
        "must_null": ["IRN", "Cess_Amount", "Original_Invoice_Number"],
        "must_not_auto_accept": False,
        "critical_fields": [
            "Supplier_GSTIN",
            "Invoice_Number",
            "Invoice_Date",
            "Taxable_Amount",
            "Total_Amount",
        ],
    }
    manifest_cases.append(
        _write_case("clean_intrastate", _pdf_from_lines(lines), "pdf", expected, ["intrastate"])
    )

    # 2. Clean interstate (MH→KA)
    lines = [
        "TAX INVOICE",
        "Supplier: Acme Traders Pvt Ltd",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer: South Mart Pvt Ltd",
        "Buyer GSTIN: 29AADCB1234M1Z1",
        "Place of Supply: Karnataka",
        "Invoice Number: INV-INTER-002",
        "Invoice Date: 20-02-2024",
        "Goods | HSN 8471 | Qty 1 | Rate 2000 | Amount 2000 | GST 18%",
        "Taxable: 2000.00  IGST 18%: 360.00  Total: 2360.00",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Buyer_GSTIN": "29AADCB1234M1Z1",
        "Invoice_Number": "INV-INTER-002",
        "Invoice_Date": "20-02-2024",
        "Invoice_Type": "Tax Invoice",
        "Taxable_Amount": 2000.0,
        "Total_Amount": 2360.0,
        "IGST_Amount": 360.0,
        "CGST_Amount": 0.0,
        "SGST_Amount": 0.0,
        "Line_Items": [
            {
                "Description": "Goods",
                "HSN_SAC": "8471",
                "Quantity": 1,
                "Unit_Price": 2000,
                "Amount": 2000,
                "Tax_Rate": 18,
            }
        ],
        "must_match_math": True,
        "must_null": ["Original_Invoice_Number"],
        "must_not_auto_accept": False,
        "critical_fields": [
            "Supplier_GSTIN",
            "Invoice_Number",
            "Invoice_Date",
            "Taxable_Amount",
            "Total_Amount",
        ],
    }
    manifest_cases.append(
        _write_case("clean_interstate", _pdf_from_lines(lines), "pdf", expected, ["interstate"])
    )

    # 3. Credit note
    lines = [
        "CREDIT NOTE",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer GSTIN: 27AADCB1234M1Z1",
        "Credit Note Number: CN-100",
        "Date: 01-03-2024",
        "Original Invoice Number: INV-INTRA-001",
        "Original Invoice Date: 15-01-2024",
        "Return: Widgets | Amount 500 | Tax 18%",
        "Taxable: 500  CGST: 45  SGST: 45  Total: 590",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Invoice_Number": "CN-100",
        "Invoice_Date": "01-03-2024",
        "Invoice_Type": "Credit Note",
        "Original_Invoice_Number": "INV-INTRA-001",
        "Original_Invoice_Date": "15-01-2024",
        "Taxable_Amount": 500.0,
        "Total_Amount": 590.0,
        "Line_Items": [{"Description": "Widgets", "Amount": 500, "Tax_Rate": 18}],
        "must_match_math": True,
        "must_null": [],
        "must_not_auto_accept": False,
        "critical_fields": [
            "Supplier_GSTIN",
            "Invoice_Number",
            "Invoice_Type",
            "Original_Invoice_Number",
            "Total_Amount",
        ],
    }
    manifest_cases.append(
        _write_case("credit_note", _pdf_from_lines(lines), "pdf", expected, ["credit_note"])
    )

    # 4. Debit note
    lines = [
        "DEBIT NOTE",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer GSTIN: 27AADCB1234M1Z1",
        "Debit Note Number: DN-55",
        "Date: 05-03-2024",
        "Original Invoice Number: INV-INTRA-001",
        "Original Invoice Date: 15-01-2024",
        "Additional charge | Amount 200 | Tax 18%",
        "Taxable: 200  CGST: 18  SGST: 18  Total: 236",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Invoice_Number": "DN-55",
        "Invoice_Date": "05-03-2024",
        "Invoice_Type": "Debit Note",
        "Original_Invoice_Number": "INV-INTRA-001",
        "Taxable_Amount": 200.0,
        "Total_Amount": 236.0,
        "Line_Items": [{"Description": "Additional charge", "Amount": 200, "Tax_Rate": 18}],
        "must_match_math": True,
        "must_null": [],
        "must_not_auto_accept": False,
        "critical_fields": [
            "Supplier_GSTIN",
            "Invoice_Number",
            "Invoice_Type",
            "Original_Invoice_Number",
            "Total_Amount",
        ],
    }
    manifest_cases.append(
        _write_case("debit_note", _pdf_from_lines(lines), "pdf", expected, ["debit_note"])
    )

    # 5. Mixed tax rates
    lines = [
        "TAX INVOICE",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer GSTIN: 27AADCB1234M1Z1",
        "Invoice Number: INV-MIX-010",
        "Invoice Date: 10-04-2024",
        "Item A | HSN 1001 | Amount 1000 | GST 5%",
        "Item B | HSN 8471 | Amount 1000 | GST 18%",
        "Taxable: 2000  CGST: 115  SGST: 115  Total: 2230",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Invoice_Number": "INV-MIX-010",
        "Invoice_Date": "10-04-2024",
        "Taxable_Amount": 2000.0,
        "Total_Amount": 2230.0,
        "Line_Items": [
            {"Description": "Item A", "HSN_SAC": "1001", "Amount": 1000, "Tax_Rate": 5},
            {"Description": "Item B", "HSN_SAC": "8471", "Amount": 1000, "Tax_Rate": 18},
        ],
        "must_match_math": True,
        "must_null": ["IRN"],
        "must_not_auto_accept": False,
        "critical_fields": ["Supplier_GSTIN", "Invoice_Number", "Taxable_Amount", "Total_Amount"],
    }
    manifest_cases.append(
        _write_case("mixed_tax_rates", _pdf_from_lines(lines), "pdf", expected, ["mixed_rate"])
    )

    # 6. Round off
    lines = [
        "TAX INVOICE",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer GSTIN: 27AADCB1234M1Z1",
        "Invoice Number: INV-RO-011",
        "Invoice Date: 11-04-2024",
        "Service | Amount 999.50 | GST 18%",
        "Taxable: 999.50  CGST: 89.96  SGST: 89.96  Round Off: 0.08  Total: 1179.50",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Invoice_Number": "INV-RO-011",
        "Invoice_Date": "11-04-2024",
        "Taxable_Amount": 999.50,
        "Round_Off": 0.08,
        "Total_Amount": 1179.50,
        "Line_Items": [{"Description": "Service", "Amount": 999.50, "Tax_Rate": 18}],
        "must_match_math": True,
        "must_null": [],
        "must_not_auto_accept": False,
        "critical_fields": ["Invoice_Number", "Total_Amount", "Round_Off"],
    }
    manifest_cases.append(
        _write_case("round_off", _pdf_from_lines(lines), "pdf", expected, ["round_off"])
    )

    # 7. Multipage table
    lines = [
        "TAX INVOICE",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer GSTIN: 27AADCB1234M1Z1",
        "Invoice Number: INV-MP-012",
        "Invoice Date: 12-04-2024",
        "Line 1 | HSN 8471 | Qty 2 | Rate 500 | Amount 1000 | GST 18%",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Invoice_Number": "INV-MP-012",
        "Invoice_Date": "12-04-2024",
        "Taxable_Amount": 1500.0,
        "Total_Amount": 1770.0,
        "Line_Items": [
            {"Description": "Line 1", "Amount": 1000, "Tax_Rate": 18},
            {"Description": "Line 2", "Amount": 500, "Tax_Rate": 18},
        ],
        "must_match_math": True,
        "must_null": [],
        "must_not_auto_accept": False,
        "critical_fields": ["Invoice_Number", "Taxable_Amount", "Total_Amount"],
        "min_line_count": 2,
    }
    manifest_cases.append(
        _write_case(
            "multipage_table",
            _pdf_from_lines(lines, multipage=True),
            "pdf",
            expected,
            ["multipage"],
        )
    )

    # 8. Blurry photo sim
    blur_lines = [
        "TAX INVOICE",
        "GSTIN 27AADCB2230M1Z2",
        "INV-BLUR-099",
        "Date unclear",
        "Total ?????",
    ]
    expected = {
        "must_not_auto_accept": True,
        "must_match_math": False,
        "must_null": [],
        "critical_fields": [],
        "expect_state_in": ["needs_retry", "needs_review"],
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Invoice_Number": "INV-BLUR-099",
        "Total_Amount": None,
        "Line_Items": [],
        "notes": "Synthetic blur — live LLM may fail; hermetic tests use ground_truth_extract",
        "ground_truth_extract": {
            "Supplier_GSTIN": "27AADCB2230M1Z2",
            "Supplier_Name": None,
            "Invoice_Number": None,
            "Invoice_Date": None,
            "Total_Amount": None,
            "Line_Items": [],
        },
    }
    manifest_cases.append(
        _write_case("blurry_low_dpi", _blurry_jpeg(blur_lines), "jpg", expected, ["blurry_low_dpi"])
    )

    # 9. Missing optional fields must stay null
    lines = [
        "TAX INVOICE",
        "Supplier: Sparse Co",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer GSTIN: 27AADCB1234M1Z1",
        "Invoice Number: INV-SPARSE-1",
        "Invoice Date: 01-05-2024",
        "Item | Amount 1000 | GST 18%",
        "Taxable 1000 CGST 90 SGST 90 Total 1180",
        "(No PO, no IRN, no e-way, no bank details printed)",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Invoice_Number": "INV-SPARSE-1",
        "Invoice_Date": "01-05-2024",
        "Taxable_Amount": 1000.0,
        "Total_Amount": 1180.0,
        "Line_Items": [{"Description": "Item", "Amount": 1000, "Tax_Rate": 18}],
        "must_match_math": True,
        "must_null": [
            "PO_Number",
            "IRN",
            "E_Way_Bill_Number",
            "Vehicle_Number",
            "Account_Number",
            "IFSC_Code",
            "Cess_Amount",
        ],
        "must_not_auto_accept": False,
        "critical_fields": ["Supplier_GSTIN", "Invoice_Number", "Total_Amount"],
    }
    manifest_cases.append(
        _write_case(
            "missing_optional_nulls",
            _pdf_from_lines(lines),
            "pdf",
            expected,
            ["missing_optional"],
        )
    )

    # 10. Bill of Supply
    lines = [
        "BILL OF SUPPLY",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer: Unregistered Customer",
        "Invoice Number: BOS-77",
        "Invoice Date: 02-05-2024",
        "Exempt goods | Amount 500 | Tax 0%",
        "Total Amount: 500.00",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Invoice_Number": "BOS-77",
        "Invoice_Date": "02-05-2024",
        "Invoice_Type": "Bill of Supply",
        "Taxable_Amount": 500.0,
        "Total_Amount": 500.0,
        "Line_Items": [{"Description": "Exempt goods", "Amount": 500, "Tax_Rate": 0}],
        "must_match_math": True,
        "must_null": ["IRN"],
        "must_not_auto_accept": False,
        "critical_fields": ["Invoice_Type", "Invoice_Number", "Total_Amount"],
    }
    manifest_cases.append(
        _write_case("bill_of_supply", _pdf_from_lines(lines), "pdf", expected, ["bill_of_supply"])
    )

    # 11. RCM explicit Yes
    lines = [
        "TAX INVOICE",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer GSTIN: 27AADCB1234M1Z1",
        "Invoice Number: INV-RCM-01",
        "Invoice Date: 03-05-2024",
        "Reverse Charge: Yes",
        "Legal service | Amount 10000 | GST 18%",
        "Taxable 10000 CGST 900 SGST 900 Total 11800",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Invoice_Number": "INV-RCM-01",
        "Invoice_Date": "03-05-2024",
        "Reverse_Charge_Applicable": True,
        "Taxable_Amount": 10000.0,
        "Total_Amount": 11800.0,
        "Line_Items": [{"Description": "Legal service", "Amount": 10000, "Tax_Rate": 18}],
        "must_match_math": True,
        "must_null": [],
        "must_not_auto_accept": False,
        "critical_fields": ["Reverse_Charge_Applicable", "Invoice_Number", "Total_Amount"],
    }
    manifest_cases.append(
        _write_case("rcm_explicit_yes", _pdf_from_lines(lines), "pdf", expected, ["rcm_explicit"])
    )

    # 12. Math broken — must_not_auto_accept
    lines = [
        "TAX INVOICE",
        "Supplier GSTIN: 27AADCB2230M1Z2",
        "Buyer GSTIN: 27AADCB1234M1Z1",
        "Invoice Number: INV-BAD-MATH",
        "Invoice Date: 04-05-2024",
        "Item | Amount 1000 | GST 18%",
        "Taxable Amount: 1000.00",
        "CGST: 90.00 SGST: 90.00",
        "Total Amount: 9999.00",
        "(Intentionally inconsistent total)",
    ]
    expected = {
        "Supplier_GSTIN": "27AADCB2230M1Z2",
        "Supplier_Name": "Broken Math Co",
        "Invoice_Number": "INV-BAD-MATH",
        "Invoice_Date": "04-05-2024",
        "Taxable_Amount": 1000.0,
        "Total_Amount": 9999.0,
        "Line_Items": [{"Description": "Item", "Amount": 1000, "Tax_Rate": 18}],
        "must_match_math": False,
        "must_null": [],
        "must_not_auto_accept": True,
        "critical_fields": ["Invoice_Number", "Total_Amount"],
        "ground_truth_extract": {
            "Supplier_GSTIN": "27AADCB2230M1Z2",
            "Supplier_Name": "Broken Math Co",
            "Invoice_Number": "INV-BAD-MATH",
            "Invoice_Date": "04-05-2024",
            "Taxable_Amount": 1000.0,
            "Total_Amount": 9999.0,
            "Line_Items": [{"Description": "Item", "Amount": 1000, "Tax_Rate": 18}],
            "Cess_Amount": None,
            "Round_Off": None,
        },
    }
    manifest_cases.append(
        _write_case("math_broken", _pdf_from_lines(lines), "pdf", expected, ["math_broken"])
    )

    manifest = {
        "version": 1,
        "description": "Synthetic GST invoice golden set for KhataLens extraction eval",
        "cases": manifest_cases,
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(manifest_cases)} cases to {CASES}")
    print(f"Manifest: {ROOT / 'manifest.json'}")


if __name__ == "__main__":
    main()
