"""
Canonical Intermediate Representation for Tally import.

Everything (invoice export, register converter, bank converter) converges here.
Only tally_export.py knows Tally XML syntax.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MasterKind(str, Enum):
    LEDGER = "ledger"
    STOCKITEM = "stockitem"
    GROUP = "group"
    UNIT = "unit"


class VoucherType(str, Enum):
    SALES = "Sales"
    PURCHASE = "Purchase"
    RECEIPT = "Receipt"
    PAYMENT = "Payment"
    CONTRA = "Contra"
    JOURNAL = "Journal"
    CREDIT_NOTE = "Credit Note"
    DEBIT_NOTE = "Debit Note"


class DocType(str, Enum):
    SALES_REGISTER = "sales_register"
    PURCHASE_REGISTER = "purchase_register"
    BANK_STATEMENT = "bank_statement"
    JOURNAL = "journal"
    GENERIC_TABLE = "generic_table"
    INVOICE_BATCH = "invoice_batch"


class BillAllocation(BaseModel):
    name: str = Field(description="Bill / invoice reference number")
    bill_type: str = Field(default="New Ref", description="New Ref | Agst Ref | Advance | On Account")
    amount: float = Field(description="Bill allocation amount (absolute)")


class LedgerLeg(BaseModel):
    ledger: str = Field(description="Ledger name as it should appear in Tally")
    is_debit: bool = Field(description="True = debit (ISDEEMEDPOSITIVE Yes for most voucher conventions)")
    amount: float = Field(description="Absolute amount (>= 0)")
    is_party_ledger: bool = False
    bill_allocations: list[BillAllocation] = Field(default_factory=list)


class InventoryLeg(BaseModel):
    item: str
    qty: float = 1.0
    rate: float = 0.0
    amount: float = 0.0
    uom: str = "Nos"
    hsn: Optional[str] = None
    accounting_ledger: Optional[str] = Field(
        default=None,
        description="Sales/Purchase ledger for ACCOUNTINGALLOCATIONS",
    )
    is_outward: bool = Field(
        default=True,
        description="True for sales (ISDEEMEDPOSITIVE No on inventory); False for purchase",
    )


class BankAlloc(BaseModel):
    date: Optional[str] = Field(default=None, description="YYYY-MM-DD or YYYYMMDD")
    instrument_number: Optional[str] = None
    transaction_type: str = "Cheque"
    transfer_mode: Optional[str] = None  # NEFT / RTGS / IMPS / UPI
    amount: float = 0.0
    bankers_date: Optional[str] = None


class MasterDef(BaseModel):
    kind: MasterKind = MasterKind.LEDGER
    name: str
    parent: str = Field(
        default="Sundry Creditors",
        description="Tally parent group / stock group / unit base",
    )
    gst_registration_type: Optional[str] = None  # Regular / Unregistered / Composition
    gstin: Optional[str] = None
    state: Optional[str] = None
    tax_rate: Optional[float] = None
    hsn: Optional[str] = None
    opening_balance: Optional[float] = None
    is_revenue: bool = False
    mapped_to: Optional[str] = Field(
        default=None,
        description="If set, use this existing Tally name instead of creating",
    )
    auto_create: bool = True


class VoucherIR(BaseModel):
    vtype: VoucherType
    date: str = Field(description="Prefer YYYY-MM-DD; generator normalizes to YYYYMMDD")
    number: Optional[str] = None
    party: Optional[str] = None
    narration: Optional[str] = None
    ledger_legs: list[LedgerLeg] = Field(default_factory=list)
    inventory: list[InventoryLeg] = Field(default_factory=list)
    bank: Optional[BankAlloc] = None
    place_of_supply: Optional[str] = None
    taxable_amount: Optional[float] = None
    cgst: Optional[float] = None
    sgst: Optional[float] = None
    igst: Optional[float] = None
    cess: Optional[float] = None
    round_off: Optional[float] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=1)


class TallyDocument(BaseModel):
    company_hint: Optional[str] = None
    doc_type: Optional[DocType] = None
    masters: list[MasterDef] = Field(default_factory=list)
    vouchers: list[VoucherIR] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    source_filename: Optional[str] = None


class ValidationIssue(BaseModel):
    severity: str  # error | warning
    voucher_index: Optional[int] = None
    code: str
    message: str


class ImportReport(BaseModel):
    ok: bool
    voucher_count: int = 0
    master_create_count: int = 0
    master_mapped_count: int = 0
    issues: list[ValidationIssue] = Field(default_factory=list)
    auto_round_off_applied: int = 0


class TallyExportRequest(BaseModel):
    """Request body for POST /export/tally when sending IR directly."""
    document: TallyDocument
    auto_balance: bool = True
    include_masters: bool = True


class InvoiceExportItem(BaseModel):
    """Lightweight invoice payload from frontend SavedInvoicesPage."""
    id: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    created_at: Optional[str] = None  # fallback when invoice_date missing
    supplier_name: Optional[str] = None
    supplier_gstin: Optional[str] = None
    expense_category: Optional[str] = None
    total_amount: Optional[float] = None
    taxable_amount: Optional[float] = None
    cgst_amount: Optional[float] = None
    sgst_amount: Optional[float] = None
    igst_amount: Optional[float] = None
    cess_amount: Optional[float] = None
    round_off: Optional[float] = None
    invoice_type: Optional[str] = None
    original_invoice_number: Optional[str] = None
    original_invoice_date: Optional[str] = None
    place_of_supply: Optional[str] = None
    document_type: Optional[str] = None  # purchase | sales


class InvoiceLineItemExport(BaseModel):
    invoice_id: Optional[str] = None
    description: Optional[str] = None
    hsn_sac: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None
    tax_rate: Optional[float] = None


class InvoiceBatchExportRequest(BaseModel):
    invoices: list[InvoiceExportItem]
    line_items: list[InvoiceLineItemExport] = Field(default_factory=list)
    default_voucher: VoucherType = VoucherType.PURCHASE
    auto_balance: bool = True
    include_masters: bool = True
