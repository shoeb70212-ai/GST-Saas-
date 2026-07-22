"""
Server-side credit cost constants, wallet packs, and scaling helpers.

Keep these in sync with product pricing copy on the frontend
(`frontend/src/lib/pricing.ts`, `CREDITS_DOCUMENTATION.md`). Prefer importing
from here over scattering magic numbers in route handlers.
"""

import math

# ---------------------------------------------------------------------------
# Wallet packs (Razorpay create-order / fulfillment catalog)
# Frontend display: frontend/src/lib/pricing.ts — keep amounts aligned.
# ---------------------------------------------------------------------------
CREDIT_PACKS = {
    "starter": {"credits": 1000, "amount_inr": 2499},
    "pro": {"credits": 5000, "amount_inr": 7999},
}

# Single invoice scan (authenticated /api/scan-invoice)
INVOICE_SCAN = 1

# Public client portal upload
PUBLIC_UPLOAD = 1

# Batch ZIP: one credit per queued file
BATCH_PER_FILE = 1

# Bank statement scan (PDF pages or spreadsheet rows)
BANK_BASE = 2
BANK_PDF_PAGES_PER_UNIT = 5
BANK_EXCEL_ROWS_PER_UNIT = 50

# AI Deep Match (GSTR-2B × Purchase Register)
DEEP_MATCH_BASE = 5
DEEP_MATCH_ITEMS_PER_UNIT = 20

# Tally converter (PDF/Excel → Tally IR)
CONVERTER_BASE = 2
CONVERTER_PDF_PAGES_PER_UNIT = 5
CONVERTER_ROWS_PER_UNIT = 50


def converter_pdf_cost(page_count: int) -> int:
    """PDF converter: max(2, ceil(pages / 5) * 2)."""
    pages = max(int(page_count), 1)
    return max(CONVERTER_BASE, math.ceil(pages / CONVERTER_PDF_PAGES_PER_UNIT) * CONVERTER_BASE)


def converter_spreadsheet_cost(row_count: int) -> int:
    """Excel/CSV converter: max(2, ceil(rows / 50) * 2)."""
    rows = max(0, int(row_count))
    return max(CONVERTER_BASE, math.ceil(rows / CONVERTER_ROWS_PER_UNIT) * CONVERTER_BASE)


def batch_upload_cost(file_count: int) -> int:
    """Credits charged upfront for a batch ZIP (1 × valid queued files)."""
    return max(0, int(file_count)) * BATCH_PER_FILE


def bank_pdf_cost(page_count: int) -> int:
    """PDF bank statement: max(2, ceil(pages / 5) * 2)."""
    pages = max(int(page_count), 1)
    return max(BANK_BASE, math.ceil(pages / BANK_PDF_PAGES_PER_UNIT) * BANK_BASE)


def bank_spreadsheet_cost(row_count: int) -> int:
    """Excel/CSV bank statement: max(2, ceil(rows / 50) * 2)."""
    rows = max(0, int(row_count))
    return max(BANK_BASE, math.ceil(rows / BANK_EXCEL_ROWS_PER_UNIT) * BANK_BASE)


def deep_match_cost(total_items: int) -> int:
    """Deep match: max(5, ceil(items / 20) * 5)."""
    items = max(0, int(total_items))
    return max(DEEP_MATCH_BASE, math.ceil(items / DEEP_MATCH_ITEMS_PER_UNIT) * DEEP_MATCH_BASE)
