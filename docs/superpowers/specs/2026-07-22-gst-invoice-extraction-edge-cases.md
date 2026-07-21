# Research Brief: GST Invoice Extraction Edge Cases

**Date:** 2026-07-22  
**Status:** Implementation input for Scan & Extraction Optimization  
**Audience:** Backend extraction pipeline (`backend/extraction.py`) + golden fixture authors  
**Constraint:** Founder has no real invoice samples — accuracy work uses synthetic/public fixtures only.

---

## 1. Goal

Raise **auto-accept precision** on financial fields (GSTIN, invoice #, date, taxable, tax split, total, line amounts) without inventing HSN, RCM, cess, or IRN. Fail soft into `needs_review` / `needs_retry` rather than false `auto_accepted`.

---

## 2. Field priority matrix

| Priority | Fields | Rule if missing / wrong |
|----------|--------|-------------------------|
| **P0 — block auto-accept** | `Supplier_GSTIN` (format), `Invoice_Number`, `Invoice_Date`, `Total_Amount`, tax topology (CGST/SGST vs IGST), line↔taxable↔total reconcile (₹1) | Penalize confidence; never `auto_accepted` if financial gates fail |
| **P1 — strong review signal** | `Supplier_Name`, `Buyer_GSTIN`, `Taxable_Amount`, `Line_Items[]` (count + amounts), `Place_Of_Supply` | Prefer review over inventing |
| **P2 — literal optional** | `PO_Number`, bank fields, `E_Way_Bill_Number`, `Vehicle_Number`, `IRN`, `Cess_Amount`, `Reverse_Charge_Applicable`, `Original_Invoice_*` | **Null if not printed** — never invent |
| **P3 — advisory only** | `Expense_Category`, `HSN_Audit_Warning` | Category may suggest ledger; HSN warning only — **never suggest HSN** ([docs/10](../../10_Optimization_and_Strategy_Review.md)) |

### Schema inventory vs CA-critical gaps

Current [`InvoiceData`](../../../backend/extraction.py) already has: `Place_Of_Supply`, `Invoice_Type`, RCM, Cess, IRN, `Original_Invoice_Number` / `Original_Invoice_Date`, line HSN.

| Gap | Product treatment |
|-----|-------------------|
| POS vs buyer state mismatch | Do not auto-correct; confidence stays review if GSTIN state split disagrees with printed POS (future: soft penalty). Deterministic tax still uses GSTIN state codes. |
| CN/DN original refs | Require when `Invoice_Type` is Credit/Debit Note for auto-accept of note docs; otherwise `needs_review` |
| Multi-GSTIN stamps | Extract supplier (seller) GSTIN as primary; buyer separately; never merge |
| Amount in words vs digits | Optional cross-check later; not required for v1 gates |

---

## 3. Edge-case catalog → product rules

| Category | Examples | Product rule | Maps to |
|----------|----------|--------------|---------|
| **Document types** | Tax Invoice, Bill of Supply, Credit/Debit Note, Export | Literal `Invoice_Type` from heading; default Tax Invoice only if heading is generic “Invoice”; else null | Prompt + schema Field text |
| **E-invoice** | IRN 64-char, QR unreadable | Extract IRN if printed; never invent; null if absent | Prompt (existing) |
| **Tax topology** | Intra vs inter-state, mixed rates, round-off, cess | CGST/SGST vs IGST from GSTIN state codes; read cess; apply `Round_Off` in computed total | `apply_tax_calculations` |
| **RCM** | “Reverse Charge: Yes/No” | Explicit print only — no inference | Prompt (keep) |
| **Identity** | GSTIN format/checksum, buyer↔supplier swap, multi-GSTIN | Format regex + KYC cache verify; swap risk → lower confidence / review | `compute_confidence` + scan GSTIN verify |
| **Line tables** | Multi-page, discounts, UOM, missing HSN | Extract printed HSN only; never invent HSN | Prompt + docs/10 |
| **Layout noise** | Stamps, bilingual, WhatsApp blur, password PDF | Shared preprocess; `needs_retry` when unreadable | `preprocess_invoice_file` + WA refund |
| **Math** | Line sum ≠ taxable; header tax ≠ rate×base; total vs words | Deterministic reconcile (₹1) → block `auto_accepted` | Trust gate |
| **Dupes** | Same GSTIN + invoice # | Existing `duplicate_warning` path | Scan route |

---

## 4. Trust-gate rules (implementation contract)

1. Start score 100; apply penalties (invalid GSTIN −25, missing GSTIN −15, total≠computed >₹1 → −30, missing required −10 each).
2. **Line reconcile:** if `Line_Items` present, `|sum(Amount) − Taxable_Amount| > 1` → penalty + `financial_ok = false`.
3. **`auto_accepted` iff** `score ≥ 95` **and** `financial_ok` (total vs computed within ₹1; line reconcile if lines exist).
4. Else `needs_review` (≥85) or `needs_retry` (<85).
5. Escalate path: gpt-4o-mini → gate fail → gpt-4o verify → re-score; Gemini only on transport failure of a single model call (not nested 3× stacks).

---

## 5. Channel parity

| Channel | Must use |
|---------|----------|
| `/scan-invoice` | Shared preprocess + `run_ai_extraction` |
| Batch ZIP worker | Same |
| Public portal worker | Same |
| WhatsApp worker | Same; **refund** on `needs_retry` reject; line items via `persist_extracted_invoice` |

---

## 6. Golden fixture tags (minimum corpus)

`intrastate`, `interstate`, `credit_note`, `debit_note`, `mixed_rate`, `round_off`, `multipage`, `blurry_low_dpi`, `missing_optional`, `bill_of_supply`, `rcm_explicit`, `math_broken` (`must_not_auto_accept`).

See `backend/tests/fixtures/invoices/manifest.json`.

---

## 7. Success checks

- Zero false `auto_accepted` on `must_not_auto_accept` fixtures.
- Critical fields improve on live eval (`RUN_LIVE_EXTRACTION_EVAL=1`) vs mini-only baseline.
- No credit pricing changes; no ProGate; scan auto-save client binding unchanged.
