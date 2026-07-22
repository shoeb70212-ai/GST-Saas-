"""
Authoritative Tally XML generator + validator.

Converts TallyDocument IR -> TallyPrime / ERP 9 compatible import XML.
Pure functions; no I/O. Unit-testable.
"""

from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Optional
from xml.sax.saxutils import escape as xml_escape

from tally_ir import (
    BankAlloc,
    BillAllocation,
    DocType,
    ImportReport,
    InventoryLeg,
    InvoiceBatchExportRequest,
    InvoiceExportItem,
    InvoiceLineItemExport,
    LedgerLeg,
    MasterDef,
    MasterKind,
    TallyDocument,
    ValidationIssue,
    VoucherIR,
    VoucherType,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DATE_RE = re.compile(r"^(\d{4})-?(\d{2})-?(\d{2})$")
_DATE_DMY = re.compile(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$")


def normalize_ledger_name(name: str | None) -> str:
    """Trim and collapse whitespace so imports don't create near-duplicate ledgers."""
    if not name:
        return ""
    return re.sub(r"\s+", " ", str(name).strip())


def escape_xml(text: str | None) -> str:
    if text is None:
        return ""
    return xml_escape(str(text), {"'": "&apos;", '"': "&quot;"})


def to_tally_date(raw: str | None) -> Optional[str]:
    """Normalize common date strings to YYYYMMDD. Returns None if unparseable."""
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None

    m = _DATE_RE.match(s.replace("/", "").replace("-", "") if len(s) == 8 and s.isdigit() else s)
    # Already YYYYMMDD
    if len(s) == 8 and s.isdigit():
        try:
            datetime.strptime(s, "%Y%m%d")
            return s
        except ValueError:
            pass

    # YYYY-MM-DD or YYYYMMDD with separators
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y%m%d"):
        try:
            return datetime.strptime(s[:10] if fmt != "%Y%m%d" else s[:8], fmt).strftime("%Y%m%d")
        except ValueError:
            continue

    m = _DATE_DMY.match(s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000 if y < 70 else 1900
        try:
            return datetime(y, mo, d).strftime("%Y%m%d")
        except ValueError:
            # Try DD/MM vs MM/DD — prefer DMY (India)
            try:
                return datetime(y, d, mo).strftime("%Y%m%d")
            except ValueError:
                return None

    return None


def resolve_master_name(master: MasterDef) -> str:
    if master.mapped_to:
        return normalize_ledger_name(master.mapped_to)
    return normalize_ledger_name(master.name)


def effective_ledger_name(name: str, masters: list[MasterDef]) -> str:
    """Apply mapping overrides from masters list."""
    n = normalize_ledger_name(name)
    for m in masters:
        if m.kind == MasterKind.LEDGER and normalize_ledger_name(m.name) == n:
            return resolve_master_name(m)
    return n


# ---------------------------------------------------------------------------
# Invoice batch -> IR
# ---------------------------------------------------------------------------

_CREDIT_NOTE_HINTS = ("credit note", "creditnote", "cn")
_DEBIT_NOTE_HINTS = ("debit note", "debitnote", "dn")


def _infer_voucher_type(inv: InvoiceExportItem, default: VoucherType) -> VoucherType:
    raw = (inv.invoice_type or inv.document_type or "").lower().strip()
    if any(h in raw for h in _CREDIT_NOTE_HINTS):
        return VoucherType.CREDIT_NOTE
    if any(h in raw for h in _DEBIT_NOTE_HINTS):
        return VoucherType.DEBIT_NOTE
    if "sales" in raw or "sale" == raw:
        return VoucherType.SALES
    if "purchase" in raw:
        return VoucherType.PURCHASE
    return default


def invoices_to_document(req: InvoiceBatchExportRequest) -> TallyDocument:
    """Convert saved invoices + line items into a TallyDocument."""
    items_by_inv: dict[str, list[InvoiceLineItemExport]] = {}
    for li in req.line_items:
        key = li.invoice_id or ""
        items_by_inv.setdefault(key, []).append(li)

    masters: dict[str, MasterDef] = {}
    vouchers: list[VoucherIR] = []
    warnings: list[str] = []

    def ensure_ledger(name: str, parent: str, **kwargs) -> str:
        n = normalize_ledger_name(name)
        if not n:
            return n
        if n not in masters:
            masters[n] = MasterDef(kind=MasterKind.LEDGER, name=n, parent=parent, **kwargs)
        return n

    for inv in req.invoices:
        party = normalize_ledger_name(inv.supplier_name) or "Unknown Party"
        vtype = _infer_voucher_type(inv, req.default_voucher)
        is_sales_side = vtype in (VoucherType.SALES, VoucherType.CREDIT_NOTE)

        party_parent = "Sundry Debtors" if is_sales_side else "Sundry Creditors"
        ensure_ledger(
            party,
            party_parent,
            gstin=inv.supplier_gstin,
            gst_registration_type="Regular" if inv.supplier_gstin else "Unregistered",
        )

        expense = normalize_ledger_name(inv.expense_category) or (
            "Sales" if is_sales_side else "Purchase"
        )
        ensure_ledger(
            expense,
            "Sales Accounts" if is_sales_side else "Purchase Accounts",
            is_revenue=True,
        )

        for tax_name in ("CGST", "SGST", "IGST", "Cess"):
            amt = getattr(inv, f"{tax_name.lower()}_amount", None)
            if amt:
                ensure_ledger(tax_name, "Duties & Taxes")

        total = float(inv.total_amount or 0)
        legs: list[LedgerLeg] = []

        # Party leg
        # Purchase: party is credit (is_debit=False); Sales: party is debit (is_debit=True)
        party_is_debit = is_sales_side
        if vtype == VoucherType.CREDIT_NOTE:
            party_is_debit = False  # reverse of sales
        if vtype == VoucherType.DEBIT_NOTE:
            party_is_debit = True  # reverse of purchase? DN to supplier increases payable credit... 
            # Debit Note (purchase side): party credited? Actually DN from us to supplier:
            # We debit supplier (reduce payable) — party is debit.
            party_is_debit = True

        bill_ref = inv.invoice_number or "New Ref"
        legs.append(
            LedgerLeg(
                ledger=party,
                is_debit=party_is_debit,
                amount=abs(total),
                is_party_ledger=True,
                bill_allocations=[
                    BillAllocation(name=bill_ref, bill_type="New Ref", amount=abs(total))
                ]
                if bill_ref
                else [],
            )
        )

        inv_items = items_by_inv.get(inv.id or "", [])
        taxable_from_items = 0.0
        inventory: list[InventoryLeg] = []

        if inv_items:
            for li in inv_items:
                amt = float(li.amount or 0)
                taxable_from_items += amt
                desc = normalize_ledger_name(li.description) or expense
                # Account-only mode: one expense leg per line (more reliable across Tally configs)
                legs.append(
                    LedgerLeg(
                        ledger=expense,
                        is_debit=not party_is_debit,
                        amount=abs(amt),
                    )
                )
                if li.description and (li.quantity or li.unit_price):
                    inventory.append(
                        InventoryLeg(
                            item=desc,
                            qty=float(li.quantity or 1),
                            rate=float(li.unit_price or 0),
                            amount=abs(amt),
                            hsn=li.hsn_sac,
                            accounting_ledger=expense,
                            is_outward=is_sales_side,
                        )
                    )
                    if desc not in masters:
                        masters[desc] = MasterDef(
                            kind=MasterKind.STOCKITEM,
                            name=desc,
                            parent="Primary",
                            hsn=li.hsn_sac,
                            tax_rate=li.tax_rate,
                        )
        else:
            # Single expense from taxable or total - taxes
            tax_sum = sum(
                float(x or 0)
                for x in (inv.cgst_amount, inv.sgst_amount, inv.igst_amount, inv.cess_amount)
            )
            taxable = float(inv.taxable_amount) if inv.taxable_amount is not None else max(total - tax_sum, 0)
            if taxable > 0 or total > 0:
                legs.append(
                    LedgerLeg(
                        ledger=expense,
                        is_debit=not party_is_debit,
                        amount=abs(taxable if taxable > 0 else total - tax_sum),
                    )
                )

        for tax_name, field in (
            ("CGST", inv.cgst_amount),
            ("SGST", inv.sgst_amount),
            ("IGST", inv.igst_amount),
            ("Cess", inv.cess_amount),
        ):
            if field:
                legs.append(
                    LedgerLeg(
                        ledger=tax_name,
                        is_debit=not party_is_debit,
                        amount=abs(float(field)),
                    )
                )

        if inv.round_off:
            ensure_ledger("Round Off", "Indirect Expenses")
            ro = float(inv.round_off)
            legs.append(
                LedgerLeg(
                    ledger="Round Off",
                    is_debit=(ro > 0) if not party_is_debit else (ro < 0),
                    amount=abs(ro),
                )
            )

        narration = None
        if inv.original_invoice_number:
            narration = f"Original Invoice: {inv.original_invoice_number}"
            if inv.original_invoice_date:
                narration += f" dated {inv.original_invoice_date}"

        vouchers.append(
            VoucherIR(
                vtype=vtype,
                date=inv.invoice_date or "",
                number=inv.invoice_number,
                party=party,
                narration=narration,
                ledger_legs=legs,
                inventory=[],  # accounting-only vouchers for maximum import reliability
                place_of_supply=inv.place_of_supply,
                taxable_amount=inv.taxable_amount,
                cgst=inv.cgst_amount,
                sgst=inv.sgst_amount,
                igst=inv.igst_amount,
                cess=inv.cess_amount,
                round_off=inv.round_off,
            )
        )

        if not inv.invoice_date:
            warnings.append(f"Invoice {inv.invoice_number or party}: missing date")
        if not inv.supplier_name:
            warnings.append(f"Invoice {inv.invoice_number or '?'}: missing supplier name")

    # Always ensure Nos unit for any stock items
    if any(m.kind == MasterKind.STOCKITEM for m in masters.values()):
        masters.setdefault(
            "__UNIT_Nos__",
            MasterDef(kind=MasterKind.UNIT, name="Nos", parent=""),
        )

    return TallyDocument(
        doc_type=DocType.INVOICE_BATCH,
        masters=list(masters.values()),
        vouchers=vouchers,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------

ROUND_OFF_TOLERANCE = 0.05  # INR; auto-add Round Off within this
GST_TOLERANCE = 1.0  # INR soft check


def _leg_signed_amount(leg: LedgerLeg) -> tuple[float, float]:
    """Return (debit, credit) absolute contributions."""
    amt = abs(float(leg.amount or 0))
    if leg.is_debit:
        return amt, 0.0
    return 0.0, amt


def balance_voucher(voucher: VoucherIR, auto_balance: bool = True) -> tuple[VoucherIR, bool]:
    """
    Ensure Dr == Cr. If auto_balance and imbalance <= ROUND_OFF_TOLERANCE * 100
    (or small), insert Round Off leg. Returns (voucher, applied_round_off).
    """
    dr = sum(_leg_signed_amount(l)[0] for l in voucher.ledger_legs)
    cr = sum(_leg_signed_amount(l)[1] for l in voucher.ledger_legs)
    diff = round(dr - cr, 2)
    if abs(diff) < 0.005:
        return voucher, False
    if not auto_balance:
        return voucher, False
    # Allow auto round-off up to 1.00 INR (common Indian invoicing)
    if abs(diff) > 1.00:
        return voucher, False

    # If Dr > Cr, need credit Round Off; else debit
    need_debit = diff < 0
    new_legs = list(voucher.ledger_legs)
    new_legs.append(
        LedgerLeg(
            ledger="Round Off",
            is_debit=need_debit,
            amount=abs(diff),
        )
    )
    voucher.ledger_legs = new_legs
    if voucher.round_off is None:
        voucher.round_off = diff if need_debit else -diff
    return voucher, True


def validate_tally_document(
    doc: TallyDocument,
    auto_balance: bool = True,
) -> tuple[TallyDocument, ImportReport]:
    """Validate + optionally auto-balance. Mutates a copy of vouchers."""
    issues: list[ValidationIssue] = []
    auto_ro = 0
    new_vouchers: list[VoucherIR] = []

    # Ensure Round Off master if we might need it
    master_names = {normalize_ledger_name(m.name) for m in doc.masters}
    masters = list(doc.masters)

    for idx, v in enumerate(doc.vouchers):
        v = v.model_copy(deep=True)

        if not v.date or not to_tally_date(v.date):
            issues.append(
                ValidationIssue(
                    severity="error",
                    voucher_index=idx,
                    code="invalid_date",
                    message=f"Voucher {v.number or idx + 1}: invalid or missing date '{v.date}'",
                )
            )

        if not v.ledger_legs:
            issues.append(
                ValidationIssue(
                    severity="error",
                    voucher_index=idx,
                    code="no_legs",
                    message=f"Voucher {v.number or idx + 1}: no ledger entries",
                )
            )
            new_vouchers.append(v)
            continue

        for leg in v.ledger_legs:
            if not normalize_ledger_name(leg.ledger):
                issues.append(
                    ValidationIssue(
                        severity="error",
                        voucher_index=idx,
                        code="empty_ledger",
                        message=f"Voucher {v.number or idx + 1}: empty ledger name",
                    )
                )
            if leg.amount is None or leg.amount < 0:
                issues.append(
                    ValidationIssue(
                        severity="error",
                        voucher_index=idx,
                        code="bad_amount",
                        message=f"Voucher {v.number or idx + 1}: negative/missing amount on {leg.ledger}",
                    )
                )

        v, applied = balance_voucher(v, auto_balance=auto_balance)
        if applied:
            auto_ro += 1
            if "Round Off" not in master_names:
                masters.append(
                    MasterDef(kind=MasterKind.LEDGER, name="Round Off", parent="Indirect Expenses")
                )
                master_names.add("Round Off")

        dr = sum(_leg_signed_amount(l)[0] for l in v.ledger_legs)
        cr = sum(_leg_signed_amount(l)[1] for l in v.ledger_legs)
        if abs(round(dr - cr, 2)) >= 0.01:
            issues.append(
                ValidationIssue(
                    severity="error",
                    voucher_index=idx,
                    code="unbalanced",
                    message=(
                        f"Voucher {v.number or idx + 1}: Dr {dr:.2f} != Cr {cr:.2f} "
                        f"(diff {dr - cr:.2f})"
                    ),
                )
            )

        # Soft GST check
        if v.taxable_amount is not None and (v.cgst or v.sgst or v.igst):
            tax = float(v.cgst or 0) + float(v.sgst or 0) + float(v.igst or 0) + float(v.cess or 0)
            # Only warn if tax seems wildly off vs taxable (can't know rate)
            if tax < 0:
                issues.append(
                    ValidationIssue(
                        severity="warning",
                        voucher_index=idx,
                        code="gst_negative",
                        message=f"Voucher {v.number or idx + 1}: negative GST components",
                    )
                )
            if v.cgst and v.igst:
                issues.append(
                    ValidationIssue(
                        severity="warning",
                        voucher_index=idx,
                        code="gst_mixed",
                        message=f"Voucher {v.number or idx + 1}: both CGST and IGST present",
                    )
                )

        new_vouchers.append(v)

    create_count = sum(1 for m in masters if m.auto_create and not m.mapped_to)
    mapped_count = sum(1 for m in masters if m.mapped_to)

    out = doc.model_copy(deep=True)
    out.masters = masters
    out.vouchers = new_vouchers

    has_errors = any(i.severity == "error" for i in issues)
    report = ImportReport(
        ok=not has_errors and len(new_vouchers) > 0,
        voucher_count=len(new_vouchers),
        master_create_count=create_count,
        master_mapped_count=mapped_count,
        issues=issues,
        auto_round_off_applied=auto_ro,
    )
    return out, report


# ---------------------------------------------------------------------------
# XML emission
# ---------------------------------------------------------------------------

def _amount_xml(leg: LedgerLeg) -> str:
    """
    Tally convention: ISDEEMEDPOSITIVE Yes => amount is negative in many exports;
    we emit signed amount: debit => negative, credit => positive (common import pattern).
    """
    amt = abs(float(leg.amount or 0))
    signed = -amt if leg.is_debit else amt
    return f"{signed:.2f}"


def _yes_no(val: bool) -> str:
    return "Yes" if val else "No"


def _render_bill_allocations(legs_alloc: list[BillAllocation], signed_party_amount: float) -> str:
    parts = []
    for b in legs_alloc:
        amt = abs(float(b.amount or 0))
        # Bill amount follows party signed amount direction
        bill_signed = -amt if signed_party_amount < 0 else amt
        parts.append(
            "              <BILLALLOCATIONS.LIST>\n"
            f"                <NAME>{escape_xml(b.name)}</NAME>\n"
            f"                <BILLTYPE>{escape_xml(b.bill_type or 'New Ref')}</BILLTYPE>\n"
            f"                <AMOUNT>{bill_signed:.2f}</AMOUNT>\n"
            "              </BILLALLOCATIONS.LIST>\n"
        )
    return "".join(parts)


def _render_bank_alloc(bank: BankAlloc, leg: LedgerLeg) -> str:
    d = to_tally_date(bank.date) or ""
    amt = abs(float(bank.amount or leg.amount or 0))
    signed = -amt if leg.is_debit else amt
    lines = [
        "              <BANKALLOCATIONS.LIST>\n",
        f"                <DATE>{d}</DATE>\n" if d else "",
        f"                <INSTRUMENTDATE>{d}</INSTRUMENTDATE>\n" if d else "",
        f"                <TRANSACTIONTYPE>{escape_xml(bank.transaction_type or 'Cheque')}</TRANSACTIONTYPE>\n",
    ]
    if bank.transfer_mode:
        lines.append(f"                <TRANSFERMODE>{escape_xml(bank.transfer_mode)}</TRANSFERMODE>\n")
    if bank.instrument_number:
        lines.append(
            f"                <INSTRUMENTNUMBER>{escape_xml(bank.instrument_number)}</INSTRUMENTNUMBER>\n"
        )
    lines.append(f"                <AMOUNT>{signed:.2f}</AMOUNT>\n")
    lines.append("              </BANKALLOCATIONS.LIST>\n")
    return "".join(lines)


def _render_ledger_leg(leg: LedgerLeg, bank: Optional[BankAlloc] = None) -> str:
    signed = float(_amount_xml(leg))
    xml = (
        "            <ALLLEDGERENTRIES.LIST>\n"
        f"              <LEDGERNAME>{escape_xml(leg.ledger)}</LEDGERNAME>\n"
        f"              <ISDEEMEDPOSITIVE>{_yes_no(leg.is_debit)}</ISDEEMEDPOSITIVE>\n"
        f"              <ISPARTYLEDGER>{_yes_no(leg.is_party_ledger)}</ISPARTYLEDGER>\n"
        f"              <AMOUNT>{_amount_xml(leg)}</AMOUNT>\n"
    )
    if leg.bill_allocations:
        xml += _render_bill_allocations(leg.bill_allocations, signed)
    if bank and not leg.is_party_ledger:
        # Attach bank alloc to bank/cash leg (heuristic: caller sets bank on voucher)
        pass
    xml += "            </ALLLEDGERENTRIES.LIST>\n"
    return xml


def _render_inventory(inv: InventoryLeg) -> str:
    qty = float(inv.qty or 0)
    uom = inv.uom or "Nos"
    rate = float(inv.rate or 0)
    amt = abs(float(inv.amount or 0))
    # Outward (sales): ISDEEMEDPOSITIVE No; inward purchase: Yes
    is_pos = not inv.is_outward
    signed_amt = -amt if is_pos else amt
    xml = (
        "            <ALLINVENTORYENTRIES.LIST>\n"
        f"              <STOCKITEMNAME>{escape_xml(inv.item)}</STOCKITEMNAME>\n"
        f"              <ISDEEMEDPOSITIVE>{_yes_no(is_pos)}</ISDEEMEDPOSITIVE>\n"
        f"              <RATE>{rate:.2f}/{escape_xml(uom)}</RATE>\n"
        f"              <ACTUALQTY>{qty:g} {escape_xml(uom)}</ACTUALQTY>\n"
        f"              <BILLEDQTY>{qty:g} {escape_xml(uom)}</BILLEDQTY>\n"
        f"              <AMOUNT>{signed_amt:.2f}</AMOUNT>\n"
    )
    if inv.accounting_ledger:
        # Accounting allocation for inventory
        # Sales: sales ledger is credit (is_debit False); Purchase: debit
        sales_is_debit = not inv.is_outward
        sales_signed = -amt if sales_is_debit else amt
        xml += (
            "              <ACCOUNTINGALLOCATIONS.LIST>\n"
            f"                <LEDGERNAME>{escape_xml(inv.accounting_ledger)}</LEDGERNAME>\n"
            f"                <ISDEEMEDPOSITIVE>{_yes_no(sales_is_debit)}</ISDEEMEDPOSITIVE>\n"
            f"                <AMOUNT>{sales_signed:.2f}</AMOUNT>\n"
            "              </ACCOUNTINGALLOCATIONS.LIST>\n"
        )
    xml += "            </ALLINVENTORYENTRIES.LIST>\n"
    return xml


def _render_master(m: MasterDef) -> str:
    if m.mapped_to or not m.auto_create:
        return ""
    name = normalize_ledger_name(m.name)
    if m.kind == MasterKind.UNIT:
        return (
            "        <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">\n"
            "          <UNIT NAME=\"Nos\" ACTION=\"Create\">\n"
            "            <NAME>Nos</NAME>\n"
            "            <ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>\n"
            "          </UNIT>\n"
            "        </TALLYMESSAGE>\n"
        )
    if m.kind == MasterKind.STOCKITEM:
        return (
            "        <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">\n"
            f"          <STOCKITEM NAME=\"{escape_xml(name)}\" ACTION=\"Create\">\n"
            f"            <NAME>{escape_xml(name)}</NAME>\n"
            f"            <PARENT>{escape_xml(m.parent or 'Primary')}</PARENT>\n"
            "            <BASEUNITS>Nos</BASEUNITS>\n"
            "          </STOCKITEM>\n"
            "        </TALLYMESSAGE>\n"
        )
    if m.kind == MasterKind.GROUP:
        return (
            "        <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">\n"
            f"          <GROUP NAME=\"{escape_xml(name)}\" ACTION=\"Create\">\n"
            f"            <NAME>{escape_xml(name)}</NAME>\n"
            f"            <PARENT>{escape_xml(m.parent or 'Primary')}</PARENT>\n"
            "          </GROUP>\n"
            "        </TALLYMESSAGE>\n"
        )
    # LEDGER
    xml = (
        "        <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">\n"
        f"          <LEDGER NAME=\"{escape_xml(name)}\" ACTION=\"Create\">\n"
        f"            <NAME>{escape_xml(name)}</NAME>\n"
        f"            <PARENT>{escape_xml(m.parent)}</PARENT>\n"
    )
    if m.gstin or m.gst_registration_type:
        gst_type = m.gst_registration_type or ("Regular" if m.gstin else "Unregistered")
        xml += (
            "            <LEDGSTREGDETAILS.LIST>\n"
            "              <APPLICABLEFROM>20170701</APPLICABLEFROM>\n"
            f"              <GSTREGISTRATIONTYPE>{escape_xml(gst_type)}</GSTREGISTRATIONTYPE>\n"
        )
        if m.state:
            xml += f"              <STATE>{escape_xml(m.state)}</STATE>\n"
        if m.gstin:
            xml += f"              <GSTIN>{escape_xml(m.gstin)}</GSTIN>\n"
        xml += "            </LEDGSTREGDETAILS.LIST>\n"
        # ERP9-tolerant party GSTIN mirror
        if m.gstin:
            xml += f"            <PARTYGSTIN>{escape_xml(m.gstin)}</PARTYGSTIN>\n"
            xml += f"            <GSTREGISTRATIONTYPE>{escape_xml(gst_type)}</GSTREGISTRATIONTYPE>\n"
    xml += (
        "          </LEDGER>\n"
        "        </TALLYMESSAGE>\n"
    )
    return xml


def render_voucher_xml(v: VoucherIR, masters: list[MasterDef] | None = None) -> str:
    """Public single-voucher render (used by tests)."""
    masters = masters or []
    date = to_tally_date(v.date) or "20240101"
    vtype = v.vtype.value if isinstance(v.vtype, VoucherType) else str(v.vtype)
    party = effective_ledger_name(v.party or "", masters) if v.party else ""

    legs: list[LedgerLeg] = []
    for leg in v.ledger_legs:
        mapped = leg.model_copy()
        mapped.ledger = effective_ledger_name(leg.ledger, masters)
        legs.append(mapped)

    # Pick bank leg
    bank_leg_name = None
    if v.bank:
        for leg in legs:
            ln = leg.ledger.lower()
            if not leg.is_party_ledger and ("bank" in ln or "cash" in ln):
                bank_leg_name = leg.ledger
                break
        if bank_leg_name is None:
            for leg in legs:
                if not leg.is_party_ledger:
                    bank_leg_name = leg.ledger
                    break

    xml = (
        "        <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">\n"
        f"          <VOUCHER VCHTYPE=\"{escape_xml(vtype)}\" ACTION=\"Create\">\n"
        f"            <DATE>{date}</DATE>\n"
        f"            <VOUCHERTYPENAME>{escape_xml(vtype)}</VOUCHERTYPENAME>\n"
    )
    if v.number:
        xml += f"            <VOUCHERNUMBER>{escape_xml(v.number)}</VOUCHERNUMBER>\n"
    if party:
        xml += f"            <PARTYLEDGERNAME>{escape_xml(party)}</PARTYLEDGERNAME>\n"
        xml += f"            <PARTYNAME>{escape_xml(party)}</PARTYNAME>\n"
    if v.narration:
        xml += f"            <NARRATION>{escape_xml(v.narration)}</NARRATION>\n"
    if v.place_of_supply:
        xml += f"            <PLACEOFSUPPLY>{escape_xml(v.place_of_supply)}</PLACEOFSUPPLY>\n"

    for leg in legs:
        block = (
            "            <ALLLEDGERENTRIES.LIST>\n"
            f"              <LEDGERNAME>{escape_xml(leg.ledger)}</LEDGERNAME>\n"
            f"              <ISDEEMEDPOSITIVE>{_yes_no(leg.is_debit)}</ISDEEMEDPOSITIVE>\n"
            f"              <ISPARTYLEDGER>{_yes_no(leg.is_party_ledger)}</ISPARTYLEDGER>\n"
            f"              <AMOUNT>{_amount_xml(leg)}</AMOUNT>\n"
        )
        if leg.bill_allocations:
            block += _render_bill_allocations(leg.bill_allocations, float(_amount_xml(leg)))
        if v.bank and bank_leg_name and leg.ledger == bank_leg_name:
            block += _render_bank_alloc(v.bank, leg)
        block += "            </ALLLEDGERENTRIES.LIST>\n"
        xml += block

    for inv in v.inventory:
        xml += _render_inventory(inv)

    xml += "          </VOUCHER>\n"
    xml += "        </TALLYMESSAGE>\n"
    return xml


def document_to_xml(doc: TallyDocument, include_masters: bool = True) -> str:
    """Full import envelope: masters first, then vouchers (single ENVELOPE)."""
    combined_masters = "".join(_render_master(m) for m in doc.masters) if include_masters else ""
    voucher_body = "".join(render_voucher_xml(v, doc.masters) for v in doc.vouchers)
    # When only vouchers, use Vouchers report name; with masters, All Masters accepts both.
    report_name = "All Masters" if combined_masters.strip() else "Vouchers"
    return (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<ENVELOPE>\n"
        "  <HEADER>\n"
        "    <TALLYREQUEST>Import Data</TALLYREQUEST>\n"
        "  </HEADER>\n"
        "  <BODY>\n"
        "    <IMPORTDATA>\n"
        "      <REQUESTDESC>\n"
        f"        <REPORTNAME>{report_name}</REPORTNAME>\n"
        "      </REQUESTDESC>\n"
        "      <REQUESTDATA>\n"
        f"{combined_masters}"
        f"{voucher_body}"
        "      </REQUESTDATA>\n"
        "    </IMPORTDATA>\n"
        "  </BODY>\n"
        "</ENVELOPE>\n"
    )


def document_to_excel_rows(doc: TallyDocument) -> list[dict]:
    """Flat accounting-voucher style rows (compatible with older Excel template)."""
    rows: list[dict] = []
    for v in doc.vouchers:
        date = to_tally_date(v.date) or ""
        vtype = v.vtype.value if isinstance(v.vtype, VoucherType) else str(v.vtype)
        for leg in v.ledger_legs:
            rows.append(
                {
                    "Date": date,
                    "Voucher Type": vtype,
                    "Voucher No": v.number or "",
                    "Ledger Name": leg.ledger,
                    "Debit": abs(leg.amount) if leg.is_debit else "",
                    "Credit": abs(leg.amount) if not leg.is_debit else "",
                    "Narration": v.narration or "",
                    "Party": v.party or "",
                }
            )
    return rows


def export_document(
    doc: TallyDocument,
    auto_balance: bool = True,
    include_masters: bool = True,
) -> dict:
    """
    Validate, generate XML + excel rows + report.
    Returns dict suitable for JSON response.
    """
    validated, report = validate_tally_document(doc, auto_balance=auto_balance)
    xml = document_to_xml(validated, include_masters=include_masters) if report.ok or validated.vouchers else ""
    # Still emit XML even with warnings; block only on hard errors if caller checks report.ok
    if not xml and validated.vouchers:
        xml = document_to_xml(validated, include_masters=include_masters)
    return {
        "xml": xml,
        "excel_rows": document_to_excel_rows(validated),
        "report": report.model_dump(),
        "document": validated.model_dump(),
        "warnings": validated.warnings,
    }
