"""
Document-type detection + conversion of PDF/Excel/CSV into TallyDocument IR.

Deterministic spreadsheet parsing first; LLM only for column mapping / PDF assist.
"""

from __future__ import annotations

import io
import logging
import math
import re
from typing import Any, Optional

import pandas as pd

from tally_export import normalize_ledger_name, to_tally_date
from tally_ir import (
    BankAlloc,
    BillAllocation,
    DocType,
    LedgerLeg,
    MasterDef,
    MasterKind,
    TallyDocument,
    VoucherIR,
    VoucherType,
)

logger = logging.getLogger(__name__)

# Credit cost helpers (mirrors bank statement scaling)
CONVERTER_BASE = 2
CONVERTER_ROWS_PER_UNIT = 50
CONVERTER_PDF_PAGES_PER_UNIT = 5


def converter_spreadsheet_cost(row_count: int) -> int:
    rows = max(0, int(row_count))
    return max(CONVERTER_BASE, math.ceil(rows / CONVERTER_ROWS_PER_UNIT) * CONVERTER_BASE)


def converter_pdf_cost(page_count: int) -> int:
    pages = max(int(page_count), 1)
    return max(CONVERTER_BASE, math.ceil(pages / CONVERTER_PDF_PAGES_PER_UNIT) * CONVERTER_BASE)


# ---------------------------------------------------------------------------
# Column alias maps
# ---------------------------------------------------------------------------

_DATE_ALIASES = {
    "date", "txn date", "txn_date", "transaction date", "voucher date",
    "invoice date", "inv date", "bill date", "doc date", "value date",
}
_VOUCHER_NO_ALIASES = {
    "voucher no", "voucher number", "vch no", "invoice no", "invoice number",
    "inv no", "bill no", "bill number", "doc no", "reference", "ref no", "ref",
}
_PARTY_ALIASES = {
    "party", "party name", "customer", "customer name", "supplier", "supplier name",
    "vendor", "vendor name", "account", "ledger", "particulars", "name",
}
_DEBIT_ALIASES = {"debit", "dr", "withdrawal", "withdrawals", "amount dr", "debit amount"}
_CREDIT_ALIASES = {"credit", "cr", "deposit", "deposits", "amount cr", "credit amount"}
_AMOUNT_ALIASES = {"amount", "total", "invoice amount", "bill amount", "net amount", "value"}
_TAXABLE_ALIASES = {"taxable", "taxable amount", "taxable value", "assessable value", "net"}
_CGST_ALIASES = {"cgst", "cgst amount", "central tax"}
_SGST_ALIASES = {"sgst", "sgst amount", "state tax"}
_IGST_ALIASES = {"igst", "igst amount", "integrated tax"}
_CESS_ALIASES = {"cess", "cess amount"}
_GSTIN_ALIASES = {"gstin", "gstin/uin", "party gstin", "supplier gstin", "customer gstin"}
_NARRATION_ALIASES = {"narration", "description", "remarks", "particulars", "details", "memo"}
_CHEQUE_ALIASES = {"cheque", "cheque no", "cheque number", "chq no", "instrument no"}
_BALANCE_ALIASES = {"balance", "running balance", "closing balance"}


def _norm_header(h: Any) -> str:
    return re.sub(r"\s+", " ", str(h or "").strip().lower())


def _find_col(columns: list[str], aliases: set[str]) -> Optional[str]:
    normalized = {_norm_header(c): c for c in columns}
    for a in aliases:
        if a in normalized:
            return normalized[a]
    # partial contains
    for nh, orig in normalized.items():
        for a in aliases:
            if a and a in nh:
                return orig
    return None


def _to_float(val: Any) -> Optional[float]:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(",", "").replace("₹", "").replace("Rs.", "").replace("INR", "")
    s = s.replace("(", "-").replace(")", "").strip()
    if not s or s == "-":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _cell_str(val: Any) -> str:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return ""
    return str(val).strip()


# ---------------------------------------------------------------------------
# Doc-type detection
# ---------------------------------------------------------------------------

_SALES_HINTS = ("sales register", "sales book", " outward supply", "gstr-1", "sales summary")
_PURCHASE_HINTS = ("purchase register", "purchase book", "inward supply", "gstr-2", "purchase summary")
_BANK_HINTS = (
    "bank statement", "statement of account", "account statement",
    "withdrawal", "deposit", "opening balance", "closing balance", "narration",
)
_JOURNAL_HINTS = ("journal register", "journal voucher", "jv register", "day book")


def detect_doc_type_from_text(text: str, headers: list[str] | None = None) -> tuple[DocType, float]:
    """
    Heuristic detector. Returns (doc_type, confidence 0..1).
    """
    t = (text or "").lower()
    hdrs = [_norm_header(h) for h in (headers or [])]
    hdr_blob = " ".join(hdrs)

    scores: dict[DocType, float] = {
        DocType.SALES_REGISTER: 0.0,
        DocType.PURCHASE_REGISTER: 0.0,
        DocType.BANK_STATEMENT: 0.0,
        DocType.JOURNAL: 0.0,
        DocType.GENERIC_TABLE: 0.1,
    }

    for h in _SALES_HINTS:
        if h in t or h in hdr_blob:
            scores[DocType.SALES_REGISTER] += 0.45
    for h in _PURCHASE_HINTS:
        if h in t or h in hdr_blob:
            scores[DocType.PURCHASE_REGISTER] += 0.45
    for h in _BANK_HINTS:
        if h in t or h in hdr_blob:
            scores[DocType.BANK_STATEMENT] += 0.25
    for h in _JOURNAL_HINTS:
        if h in t or h in hdr_blob:
            scores[DocType.JOURNAL] += 0.4

    # Column-shape signals
    has_debit = _find_col(headers or [], _DEBIT_ALIASES) is not None
    has_credit = _find_col(headers or [], _CREDIT_ALIASES) is not None
    has_party = _find_col(headers or [], _PARTY_ALIASES) is not None
    has_gstin = _find_col(headers or [], _GSTIN_ALIASES) is not None
    has_cgst = _find_col(headers or [], _CGST_ALIASES) is not None
    has_amount = _find_col(headers or [], _AMOUNT_ALIASES) is not None

    if has_debit and has_credit:
        scores[DocType.BANK_STATEMENT] += 0.35
        scores[DocType.JOURNAL] += 0.15
    if has_gstin or has_cgst:
        scores[DocType.SALES_REGISTER] += 0.15
        scores[DocType.PURCHASE_REGISTER] += 0.15
    if "customer" in hdr_blob or "buyer" in hdr_blob:
        scores[DocType.SALES_REGISTER] += 0.25
    if "supplier" in hdr_blob or "vendor" in hdr_blob:
        scores[DocType.PURCHASE_REGISTER] += 0.25
    if has_party and has_amount and not (has_debit and has_credit):
        # Could be either register
        scores[DocType.SALES_REGISTER] += 0.1
        scores[DocType.PURCHASE_REGISTER] += 0.1

    best = max(scores, key=scores.get)
    conf = min(1.0, scores[best])
    if conf < 0.35:
        return DocType.GENERIC_TABLE, max(conf, 0.2)
    return best, conf


def detect_doc_type_from_dataframe(df: pd.DataFrame, filename: str = "") -> tuple[DocType, float]:
    headers = [str(c) for c in df.columns]
    sample = " ".join(headers) + " " + (filename or "")
    # peek first rows as text
    try:
        sample += " " + " ".join(str(x) for x in df.head(3).astype(str).values.flatten()[:30])
    except Exception:
        pass
    return detect_doc_type_from_text(sample, headers)


# ---------------------------------------------------------------------------
# Spreadsheet readers
# ---------------------------------------------------------------------------

def read_tabular_file(content: bytes, filename: str) -> pd.DataFrame:
    _, ext = filename.rsplit(".", 1) if "." in filename else ("", "")
    ext = ("." + ext).lower() if ext and not ext.startswith(".") else ext.lower()
    if not ext.startswith("."):
        ext = "." + ext if ext else ""

    bio = io.BytesIO(content)
    if ext == ".csv":
        df = pd.read_csv(bio)
    elif ext in (".xlsx", ".xls"):
        df = pd.read_excel(bio, engine="openpyxl" if ext == ".xlsx" else None)
    else:
        # try csv then excel
        try:
            df = pd.read_csv(io.BytesIO(content))
        except Exception:
            df = pd.read_excel(io.BytesIO(content))
    # Drop fully empty rows
    df = df.dropna(how="all")
    df.columns = [str(c).strip() for c in df.columns]
    return df


# ---------------------------------------------------------------------------
# Register / bank / journal -> IR
# ---------------------------------------------------------------------------

def _ensure_master(masters: dict[str, MasterDef], name: str, parent: str, **kwargs) -> str:
    n = normalize_ledger_name(name)
    if not n:
        return n
    if n not in masters:
        masters[n] = MasterDef(kind=MasterKind.LEDGER, name=n, parent=parent, **kwargs)
    return n


def register_df_to_document(
    df: pd.DataFrame,
    doc_type: DocType,
    filename: str | None = None,
) -> TallyDocument:
    """Sales or Purchase register rows -> vouchers."""
    cols = list(df.columns)
    date_c = _find_col(cols, _DATE_ALIASES)
    no_c = _find_col(cols, _VOUCHER_NO_ALIASES)
    party_c = _find_col(cols, _PARTY_ALIASES)
    amount_c = _find_col(cols, _AMOUNT_ALIASES)
    taxable_c = _find_col(cols, _TAXABLE_ALIASES)
    cgst_c = _find_col(cols, _CGST_ALIASES)
    sgst_c = _find_col(cols, _SGST_ALIASES)
    igst_c = _find_col(cols, _IGST_ALIASES)
    cess_c = _find_col(cols, _CESS_ALIASES)
    gstin_c = _find_col(cols, _GSTIN_ALIASES)
    narr_c = _find_col(cols, _NARRATION_ALIASES)

    is_sales = doc_type == DocType.SALES_REGISTER
    vtype = VoucherType.SALES if is_sales else VoucherType.PURCHASE
    party_parent = "Sundry Debtors" if is_sales else "Sundry Creditors"
    income_parent = "Sales Accounts" if is_sales else "Purchase Accounts"
    income_ledger = "Sales" if is_sales else "Purchase"

    masters: dict[str, MasterDef] = {}
    vouchers: list[VoucherIR] = []
    warnings: list[str] = []

    _ensure_master(masters, income_ledger, income_parent, is_revenue=True)

    if not date_c or not party_c or not (amount_c or taxable_c):
        warnings.append(
            "Could not confidently map register columns "
            f"(date={date_c}, party={party_c}, amount={amount_c}). "
            "Check header names."
        )

    for i, row in df.iterrows():
        party = normalize_ledger_name(_cell_str(row[party_c]) if party_c else "") or "Unknown Party"
        gstin = _cell_str(row[gstin_c]) if gstin_c else None
        _ensure_master(
            masters,
            party,
            party_parent,
            gstin=gstin or None,
            gst_registration_type="Regular" if gstin else "Unregistered",
        )

        total = _to_float(row[amount_c]) if amount_c else None
        taxable = _to_float(row[taxable_c]) if taxable_c else None
        cgst = _to_float(row[cgst_c]) if cgst_c else None
        sgst = _to_float(row[sgst_c]) if sgst_c else None
        igst = _to_float(row[igst_c]) if igst_c else None
        cess = _to_float(row[cess_c]) if cess_c else None
        tax_sum = sum(x or 0 for x in (cgst, sgst, igst, cess))

        if taxable is None and total is not None:
            taxable = max(total - tax_sum, 0)
        if total is None and taxable is not None:
            total = taxable + tax_sum
        if total is None:
            warnings.append(f"Row {i}: skipped — no amount")
            continue

        for tax_name, tax_val in (("CGST", cgst), ("SGST", sgst), ("IGST", igst), ("Cess", cess)):
            if tax_val:
                _ensure_master(masters, tax_name, "Duties & Taxes")

        party_is_debit = is_sales
        legs: list[LedgerLeg] = [
            LedgerLeg(
                ledger=party,
                is_debit=party_is_debit,
                amount=abs(total),
                is_party_ledger=True,
                bill_allocations=[
                    BillAllocation(
                        name=_cell_str(row[no_c]) if no_c else f"Row-{i}",
                        bill_type="New Ref",
                        amount=abs(total),
                    )
                ],
            ),
            LedgerLeg(
                ledger=income_ledger,
                is_debit=not party_is_debit,
                amount=abs(taxable if taxable is not None else total - tax_sum),
            ),
        ]
        for tax_name, tax_val in (("CGST", cgst), ("SGST", sgst), ("IGST", igst), ("Cess", cess)):
            if tax_val:
                legs.append(
                    LedgerLeg(
                        ledger=tax_name,
                        is_debit=not party_is_debit,
                        amount=abs(tax_val),
                    )
                )

        raw_date = _cell_str(row[date_c]) if date_c else ""
        # pandas Timestamp
        if date_c and hasattr(row[date_c], "strftime"):
            raw_date = row[date_c].strftime("%Y-%m-%d")

        vouchers.append(
            VoucherIR(
                vtype=vtype,
                date=raw_date,
                number=_cell_str(row[no_c]) if no_c else None,
                party=party,
                narration=_cell_str(row[narr_c]) if narr_c else None,
                ledger_legs=legs,
                taxable_amount=taxable,
                cgst=cgst,
                sgst=sgst,
                igst=igst,
                cess=cess,
                confidence=0.85,
            )
        )

    return TallyDocument(
        doc_type=doc_type,
        masters=list(masters.values()),
        vouchers=vouchers,
        warnings=warnings,
        source_filename=filename,
    )


def bank_df_to_document(
    df: pd.DataFrame,
    filename: str | None = None,
    bank_ledger: str = "Bank Account",
) -> TallyDocument:
    """Bank statement rows -> Receipt / Payment / Contra vouchers."""
    cols = list(df.columns)
    date_c = _find_col(cols, _DATE_ALIASES)
    debit_c = _find_col(cols, _DEBIT_ALIASES)
    credit_c = _find_col(cols, _CREDIT_ALIASES)
    amount_c = _find_col(cols, _AMOUNT_ALIASES)
    narr_c = _find_col(cols, _NARRATION_ALIASES) or _find_col(cols, {"particulars", "description"})
    ref_c = _find_col(cols, _VOUCHER_NO_ALIASES)
    cheque_c = _find_col(cols, _CHEQUE_ALIASES)
    party_c = _find_col(cols, _PARTY_ALIASES)

    masters: dict[str, MasterDef] = {}
    vouchers: list[VoucherIR] = []
    warnings: list[str] = []

    bank_name = _ensure_master(masters, bank_ledger, "Bank Accounts")
    _ensure_master(masters, "Suspense", "Suspense A/c")

    for i, row in df.iterrows():
        withdrawal = _to_float(row[debit_c]) if debit_c else None
        deposit = _to_float(row[credit_c]) if credit_c else None
        # Single amount column with signed values
        if withdrawal is None and deposit is None and amount_c:
            amt = _to_float(row[amount_c])
            if amt is None:
                continue
            if amt < 0:
                withdrawal = abs(amt)
            else:
                deposit = abs(amt)

        narr = _cell_str(row[narr_c]) if narr_c else ""
        # Skip opening/closing balance rows
        low = narr.lower()
        if any(x in low for x in ("opening balance", "b/f", "brought forward", "closing balance", "c/f", "carried forward")):
            continue

        if not withdrawal and not deposit:
            continue

        counterparty = normalize_ledger_name(_cell_str(row[party_c]) if party_c else "") 
        if not counterparty:
            # Use narration truncated as party
            counterparty = normalize_ledger_name(narr[:60]) if narr else "Suspense"
        if not counterparty:
            counterparty = "Suspense"

        is_contra = any(x in low for x in ("self", "transfer to", "transfer from", "contra", "cash deposit", "cash withdrawal"))
        if "cash" in counterparty.lower() or is_contra:
            vtype = VoucherType.CONTRA
            _ensure_master(masters, counterparty if "cash" in counterparty.lower() else "Cash", "Cash-in-hand")
            if "cash" not in counterparty.lower():
                counterparty = "Cash"
                _ensure_master(masters, "Cash", "Cash-in-hand")
        elif deposit:
            vtype = VoucherType.RECEIPT
            _ensure_master(masters, counterparty, "Sundry Debtors")
        else:
            vtype = VoucherType.PAYMENT
            _ensure_master(masters, counterparty, "Sundry Creditors")

        raw_date = _cell_str(row[date_c]) if date_c else ""
        if date_c and hasattr(row[date_c], "strftime"):
            raw_date = row[date_c].strftime("%Y-%m-%d")

        ref = _cell_str(row[ref_c]) if ref_c else None
        cheque = _cell_str(row[cheque_c]) if cheque_c else None
        instrument = cheque or ref

        if deposit:
            amt = abs(deposit)
            # Receipt: Bank Dr, Party Cr
            legs = [
                LedgerLeg(ledger=bank_name, is_debit=True, amount=amt),
                LedgerLeg(
                    ledger=counterparty,
                    is_debit=False,
                    amount=amt,
                    is_party_ledger=True,
                ),
            ]
        else:
            amt = abs(withdrawal or 0)
            # Payment: Party/Expense Dr, Bank Cr
            legs = [
                LedgerLeg(
                    ledger=counterparty,
                    is_debit=True,
                    amount=amt,
                    is_party_ledger=True,
                ),
                LedgerLeg(ledger=bank_name, is_debit=False, amount=amt),
            ]

        vouchers.append(
            VoucherIR(
                vtype=vtype,
                date=raw_date,
                number=ref,
                party=counterparty,
                narration=narr or None,
                ledger_legs=legs,
                bank=BankAlloc(
                    date=raw_date,
                    instrument_number=instrument,
                    transaction_type="Cheque" if cheque else "Inter Bank Transfer",
                    transfer_mode="NEFT" if not cheque else None,
                    amount=amt,
                ),
                confidence=0.75,
            )
        )

    if not date_c or not (debit_c or credit_c or amount_c):
        warnings.append("Bank columns not fully detected; review mappings carefully.")

    return TallyDocument(
        doc_type=DocType.BANK_STATEMENT,
        masters=list(masters.values()),
        vouchers=vouchers,
        warnings=warnings,
        source_filename=filename,
    )


def journal_df_to_document(df: pd.DataFrame, filename: str | None = None) -> TallyDocument:
    """Generic Dr/Cr table -> Journal vouchers (one voucher per row if both sides, else group by date+ref)."""
    cols = list(df.columns)
    date_c = _find_col(cols, _DATE_ALIASES)
    debit_c = _find_col(cols, _DEBIT_ALIASES)
    credit_c = _find_col(cols, _CREDIT_ALIASES)
    amount_c = _find_col(cols, _AMOUNT_ALIASES)
    ledger_c = _find_col(cols, _PARTY_ALIASES) or _find_col(cols, {"ledger", "account", "account name"})
    narr_c = _find_col(cols, _NARRATION_ALIASES)
    no_c = _find_col(cols, _VOUCHER_NO_ALIASES)

    masters: dict[str, MasterDef] = {}
    vouchers: list[VoucherIR] = []
    warnings: list[str] = []

    # Group by voucher number or date+index
    groups: dict[str, list] = {}
    for i, row in df.iterrows():
        key = _cell_str(row[no_c]) if no_c else ""
        if not key:
            d = _cell_str(row[date_c]) if date_c else str(i)
            key = f"{d}#{i}"
        groups.setdefault(key, []).append((i, row))

    for key, rows in groups.items():
        legs: list[LedgerLeg] = []
        narr = None
        raw_date = ""
        for i, row in rows:
            ledger = normalize_ledger_name(_cell_str(row[ledger_c]) if ledger_c else "") or "Suspense"
            _ensure_master(masters, ledger, "Indirect Expenses")
            dr = _to_float(row[debit_c]) if debit_c else None
            cr = _to_float(row[credit_c]) if credit_c else None
            if dr is None and cr is None and amount_c:
                # Need a Dr/Cr indicator — treat positive as debit
                amt = _to_float(row[amount_c])
                if amt and amt >= 0:
                    dr = amt
                elif amt:
                    cr = abs(amt)
            if dr:
                legs.append(LedgerLeg(ledger=ledger, is_debit=True, amount=abs(dr)))
            if cr:
                legs.append(LedgerLeg(ledger=ledger, is_debit=False, amount=abs(cr)))
            if narr_c and not narr:
                narr = _cell_str(row[narr_c]) or None
            if date_c and not raw_date:
                if hasattr(row[date_c], "strftime"):
                    raw_date = row[date_c].strftime("%Y-%m-%d")
                else:
                    raw_date = _cell_str(row[date_c])

        if len(legs) < 2:
            # Single-sided row — pair with Suspense
            if len(legs) == 1:
                other_debit = not legs[0].is_debit
                _ensure_master(masters, "Suspense", "Suspense A/c")
                legs.append(
                    LedgerLeg(ledger="Suspense", is_debit=other_debit, amount=legs[0].amount)
                )
            else:
                warnings.append(f"Voucher {key}: skipped — insufficient legs")
                continue

        vouchers.append(
            VoucherIR(
                vtype=VoucherType.JOURNAL,
                date=raw_date,
                number=key if not key.startswith(raw_date) else None,
                narration=narr,
                ledger_legs=legs,
                confidence=0.7,
            )
        )

    return TallyDocument(
        doc_type=DocType.JOURNAL if DocType.JOURNAL else DocType.GENERIC_TABLE,
        masters=list(masters.values()),
        vouchers=vouchers,
        warnings=warnings,
        source_filename=filename,
    )


def dataframe_to_document(
    df: pd.DataFrame,
    doc_type: DocType | None = None,
    filename: str | None = None,
    bank_ledger: str = "Bank Account",
) -> tuple[TallyDocument, DocType, float]:
    detected, conf = detect_doc_type_from_dataframe(df, filename or "")
    dtype = doc_type or detected

    if dtype == DocType.BANK_STATEMENT:
        doc = bank_df_to_document(df, filename=filename, bank_ledger=bank_ledger)
    elif dtype in (DocType.SALES_REGISTER, DocType.PURCHASE_REGISTER):
        doc = register_df_to_document(df, dtype, filename=filename)
    elif dtype == DocType.JOURNAL:
        doc = journal_df_to_document(df, filename=filename)
    else:
        # generic: try bank shape first else journal
        if _find_col(list(df.columns), _DEBIT_ALIASES) and _find_col(list(df.columns), _CREDIT_ALIASES):
            if _find_col(list(df.columns), _BALANCE_ALIASES):
                doc = bank_df_to_document(df, filename=filename, bank_ledger=bank_ledger)
                dtype = DocType.BANK_STATEMENT
            else:
                doc = journal_df_to_document(df, filename=filename)
                dtype = DocType.JOURNAL
        else:
            # Prefer purchase register as default for CA purchase books
            doc = register_df_to_document(df, DocType.PURCHASE_REGISTER, filename=filename)
            dtype = DocType.PURCHASE_REGISTER
            doc.warnings.append("Treated as purchase register (generic table fallback).")

    doc.doc_type = dtype
    return doc, dtype, conf


async def pdf_text_to_dataframe_hint(text: str) -> Optional[pd.DataFrame]:
    """
    Best-effort: if PDF text looks like a pipe/space table, let pandas read via csv.
    Returns None if not tabular enough — caller may fall back to bank_service chunking.
    """
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    if len(lines) < 3:
        return None
    # Try pipe-delimited
    if sum(1 for ln in lines[:20] if "|" in ln) > 5:
        try:
            return pd.read_csv(io.StringIO("\n".join(lines)), sep="|", engine="python")
        except Exception:
            return None
    return None


def apply_master_mappings(doc: TallyDocument, mappings: dict[str, str]) -> TallyDocument:
    """
    mappings: original_name -> existing_tally_name
    Marks masters as mapped and rewrites voucher ledger names.
    """
    if not mappings:
        return doc
    norm_map = {normalize_ledger_name(k): normalize_ledger_name(v) for k, v in mappings.items() if k and v}
    out = doc.model_copy(deep=True)
    for m in out.masters:
        key = normalize_ledger_name(m.name)
        if key in norm_map:
            m.mapped_to = norm_map[key]
            m.auto_create = False
    for v in out.vouchers:
        if v.party:
            p = normalize_ledger_name(v.party)
            if p in norm_map:
                v.party = norm_map[p]
        for leg in v.ledger_legs:
            key = normalize_ledger_name(leg.ledger)
            if key in norm_map:
                leg.ledger = norm_map[key]
        if v.bank:
            pass
    return out
