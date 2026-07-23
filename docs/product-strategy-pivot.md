# KhataLens — Product Strategy & Positioning Audit

**Question on the table:** *Is invoice scan too fragile to be the core of the product, and will it "break" the product on non-standard / multi-item / blurry / handwritten Indian invoices?*

**Author:** Senior product + engineering strategy audit (repo-grounded)
**Repo:** `d:\GST SAAS` · **Head:** `eaba820` · **Date:** 2026-07-23
**Scope:** analysis only — no code or config changed.

> Everything below is grounded in the actual code. Where I make a market assumption it is explicitly labelled **[ASSUMPTION]**. Where I cite the repo it is a **[FACT]** with a file path.

---

## 1. Honest verdict (read this first)

**The founder is half-right, and the half they're right about is the important half — but the fix is small.**

- Scan itself is **not** as fragile as feared *in isolation*. The pipeline is unusually mature: difficulty-based model routing, financial trust-gates with a ₹1 tolerance, GSTIN OCR repair, QR/IRN seeding, vendor memory, a human-in-the-loop Verification Grid, and a gold-set benchmark harness. A bad scan generally becomes a **`needs_review` draft a human corrects**, not silently-wrong data. That is the correct architecture for messy Indian invoices.
- The **real** single breakpoint is not extraction accuracy — it is a **data-entry monoculture**. Today the Purchase Register (`invoices` table) — the thing every downstream CA feature reads — can **only** be populated by scanning. There is no first-class "import my purchase register (CSV/Excel/Tally)" path into `invoices`. So GSTR-2B reconciliation, ITC-at-risk, and IMS are all *gated behind scanning every invoice*. If scan is imperfect, the whole CA workflow feels blocked.
- Good news: the deterministic engines (reconciliation, Tally converter, bank matching, liability) are **already scan-independent** in their own right. The product is one small bridge away from "sells day one even when scanning is imperfect."

**Positioning call:** Reposition from *"AI invoice scanner"* to **"GSTR-2B reconciliation + Tally-ready CA workspace, where scan is an optional accelerator — never a gate."** Ship a spreadsheet/Tally purchase-register importer so the value chain runs with zero scans. Then scan becomes upside, not a dependency.

---

## 2. How scan actually works today (end-to-end trace)

| Step | File(s) | What happens |
|---|---|---|
| Client capture + compress | `frontend/src/pages/scan/useScanWorkflow.ts` | Images compressed to WebP q0.92, max long-edge 2048px (small tax digits preserved); posts to `/api/scan-invoice`. Also supports ZIP batch (`/api/upload-batch`) and realtime batch status via Supabase channel. |
| HTTP route + credits | `backend/scan_routes.py` | Auth (Supabase JWT), org-suspension + credit check, file magic-byte validation, **deduct 1 credit, refund on AI failure**, duplicate detection, non-blocking GSTIN status. Thin by design. |
| Preprocess | `backend/preprocess.py` (via `extraction.preprocess_invoice_file`) | Text-rich PDF → markdown; hard PDF → hybrid (markdown + compact image); adaptive DPI, blank-page skip, best-page scorer. |
| Difficulty routing | `backend/extraction_router.py::plan_route` | Text-rich → cheap `gpt-4o-mini`; image/hybrid → strong `gpt-4o` **first** (skip mini); Gemini path gated behind `ROUTING_USE_GEMINI_FOR_HARD` (off until gold-set proves it). |
| LLM extraction | `backend/extraction.py::run_ai_extraction` | Pydantic structured output (`InvoiceData` / `LineItem`), pinned decode (temp 0), 90s timeout, transient-error retry, Gemini transport fallback. Optional: OCR grounding, QR/IRN seed, vendor-memory prompt hints. |
| Deterministic repair + tax | `backend/validators.py`, `extraction.py::apply_tax_calculations` | GSTIN checksum (Luhn mod-36) + OCR-lookalike/transpose repair; CGST/SGST/IGST derived from state codes; **handwritten header tax kept when line rates missing** (from `eaba820`). |
| Confidence / trust gate | `extraction.py::compute_confidence` | ₹1 financial tolerance: total-vs-computed and line-sum-vs-taxable. States: `auto_accepted` (≥95 **and** `financial_ok`), `needs_review` (≥85), `needs_retry`. |
| Escalation | `extraction.py::should_escalate` + `_targeted_pass`/`_full_verify` | Cheap targeted re-extract of disputed critical fields, or a full strong-model verify; keeps best result (`better_result`). |
| Review queue signals | `backend/review_reasons.py` (`Review_Reasons`, `Review_Fields`), `extraction_meta.py` (`Field_Confidence`) | Typed reasons + per-field confidence drive field highlighting. |
| Human-in-the-loop | `frontend/src/pages/scan/ScanVerificationGrid.tsx`, `InvoiceRow.tsx` | Editable grid; CA corrects fields before/after save. |
| Learn from edits | `frontend/src/pages/scan/saveInvoice.ts::learnVendorCorrections` → `backend/vendor_memory.py` | CA corrections vs `Extraction_Snapshot` teach per-vendor rules. |
| Persist | `saveInvoice.ts` → `save_invoice_atomic` RPC → `invoices` + `invoice_line_items` | Auto-save after scan; export gates in `frontend/src/lib/exportValidation.ts`. |

**Quality is measured, not assumed:** `backend/bench/run_bench.py` + fixtures in `backend/tests/fixtures/invoices/cases/` include exactly the hard cases the founder worries about — `blurry_low_dpi`, `multipage_table`, `mixed_tax_rates`, `math_broken`, `credit_note`, `rcm_explicit_yes`, `bill_of_supply`. There is also an OCR-vs-baseline harness (`bench/run_ocr_compare.py`).

### Where and why it fails (and how recoverable)

| Failure mode | Root cause in code | Recoverable via human-in-loop? | Notes |
|---|---|---|---|
| Blurry / handwritten / WhatsApp photos | LLM vision with **no classical OCR grounding**; `ocr.grounding.should_run_ocr` is off unless `OCR_ENABLED=1` + `AZURE_DI_*` set (Coolify). Produces `FIELD_UNGROUNDED`. | **Yes** — becomes `needs_review`, not bad data | **Highest-leverage lever is currently disabled.** Turning on Azure DI grounding directly targets the founder's worst case. |
| Many line items | line-sum-vs-taxable ₹1 gate (`compute_confidence`) trips if any single line amount is misread | **Yes** — flagged for review; header-tax fallback avoids zeroing tax | Correct behaviour: refuses to auto-accept wrong money. |
| Non-standard layout / missing HSN | Prompt correctly forbids inventing HSN (`_build_prompt`); blanks incur penalties | **Yes** — reviewer fills gaps | Trades recall for trust — right call for CAs. |
| Fundamentally illegible scan | No text layer, low vision confidence | **No** — but should route to **manual/import**, not dead-end | This is the gap the strategy fixes. |

**Net:** failure ≈ "a human must confirm/fix," not "the product is wrong." The financial gates are the safety net. Fragility becomes a *product-breaker* only because there is no graceful fallback to non-scan entry — see §3.

---

## 3. The real "single breakpoint": Purchase-Register data monoculture

Every meaningful CA feature reads the `invoices` table. **Every writer of `invoices` is a scan channel:**

- `backend/scan_routes.py` (single scan)
- `backend/batch_routes.py` (ZIP batch)
- `backend/public_routes.py:264` (client portal upload → `processing_status="pending_from_client"` → worker scan)
- `backend/whatsapp_service.py:363` (WhatsApp capture)

There is **no** CSV/Excel/Tally purchase-register importer that writes to `invoices`. (Confirmed: only `save_invoice_atomic` and the four scan inserts touch that table.)

Consequently these are all transitively gated on scanning:

- **GSTR-2B reconciliation** — `backend/reconcile_routes.py` reads the PR side straight from `invoices`.
- **ITC-at-risk** — `backend/itc_risk.py` derives from `recon_status` on `invoices`.
- **IMS cockpit** — `backend/ims.py` syncs against PR keys from `invoices`.

**But the deterministic engines themselves are already scan-free:**

- **GSTR-2B upload** is a pure spreadsheet parse → `gstr2b_records` (`reconcile_routes.py`).
- **GSTR-1 sales / liability** is a pure spreadsheet parse → `sales_records` (`backend/sales_routes.py`).
- **Tally Converter** deterministically turns Sales/Purchase registers, bank statements, and journals (Excel/CSV/PDF) into Tally XML with **no LLM for spreadsheets** (`backend/converter_service.py`, `backend/tally_routes.py`). It already contains battle-tested register-column detection (`register_df_to_document`).
- **Bank reconciliation** is deterministic Tier-1/Tier-2 rules; AI is off by default (`backend/reconcile_service.py`, `BANK_AI_MATCH=0`).

**Conclusion:** the product is **not** architecturally coupled to scan — it is coupled to scan *only for the one job of populating `invoices`*. Reuse `converter_service.register_df_to_document`'s parsing to write a purchase register into `invoices`, and reconciliation/ITC/IMS run with zero scans. This is the single most important change in this document.

---

## 4. Capability inventory (readiness + file paths)

Legend: 🟢 production-ready · 🟡 half-built / needs a gap closed · 🔴 stub / aspirational.

| Capability | Readiness | Evidence (files) | Notes |
|---|---|---|---|
| Invoice scan/extraction pipeline | 🟢 | `extraction.py`, `extraction_router.py`, `preprocess.py`, `validators.py`, `scan_routes.py` | Mature; routing + trust gates + fallbacks. OCR grounding present but **off**. |
| Verification Grid (human-in-loop) | 🟢 | `ScanVerificationGrid.tsx`, `InvoiceRow.tsx`, `review_reasons.py` | Editable, reason-coded. The core resilience mechanism. |
| Vendor memory (learn from edits) | 🟢 | `vendor_memory.py`, `saveInvoice.ts` | Compounds accuracy per vendor over time. |
| Batch / ZIP scan | 🟢 | `batch_routes.py`, `useScanWorkflow.ts` | Realtime status via Supabase channel. |
| Client portal capture | 🟢 | `public_routes.py`, `CollaborationPortal.tsx`, `SnapPage.tsx` | Phone capture **without** a native app. |
| WhatsApp capture | 🟡 | `whatsapp_service.py`, `whatsapp_routes.py` | Real; depends on WhatsApp API config/ops. |
| GSTR-2B reconciliation | 🟢 (engine) / 🟡 (input) | `reconcile_routes.py`, `match_utils.py` | Deterministic multi-pass + consolidation detection. **PR side gated on scan.** |
| Deep / smart match | 🟢 | `reconcile_routes.py::deep_match`, `match_utils.py` | Cross-GSTIN PAN-level; rules-based, no LLM. |
| ITC-at-risk | 🟢 | `itc_risk.py`, `itc_risk_routes.py`, `ItcRiskPage.tsx` | Deterministic classification incl. 17(5), blocked vendor. |
| IMS cockpit | 🟢 | `ims.py`, `ims_routes.py`, `ImsCockpitPage.tsx` | Portal JSON parse, deemed-accept dates, PR sync. |
| Bank statement ingest | 🟢 | `bank_service.py`, `bank_routes.py`, `BankStatementsPage.tsx` | PDF + spreadsheet. |
| Bank ↔ invoice matching | 🟢 | `reconcile_service.py`, `match_utils.py`, `BankReconcilePage.tsx` | Deterministic; AI optional/off. |
| Tally converter (spreadsheet/PDF → XML) | 🟢 | `converter_service.py`, `tally_export.py`, `tally_ir.py`, `TallyConverterPage.tsx` | Strong, scan-independent value. |
| Tally desktop bridge (Tauri) | 🟡 | `bridge/src-tauri/src/lib.rs`, `bridge_routes.py`, `bridge_auth.py`, `settings/BridgeTab.tsx` | Working poll→push to local Tally HTTP; needs packaging/onboarding polish. |
| Audit packs | 🟡 | `audit_pack.py`, `audit_routes.py`, `AuditLogsPage.tsx` | Present; validate coverage/exports before headlining. |
| Tax liability predictor | 🟢 | `sales_routes.py`, `TaxLiabilityPage.tsx`, RPC `get_tax_liability_prediction` | Spreadsheet-driven; scan-independent. |
| Businesses / multi-org / clients | 🟢 | `utils.py` (org resolution, `verify_client_access`), `ClientsPage.tsx`, `ClientContext.tsx` | Firm-wide access model. |
| Credits / wallet | 🟢 | `credits.py`, `payment_routes.py`, `WalletPage.tsx` | Razorpay packs; per-action costs; refund on failure. |
| Pricing (credits-only, no Pro locks) | 🟢 | `frontend/src/lib/pricing.ts`, `credits.py`, `CREDITS_DOCUMENTATION.md` | Keep in sync (project rule). |
| Virtual CFO | 🟡 | `VirtualCfoPage.tsx` | Verify depth before promoting. |
| Platform admin / ops | 🟢 | `admin_routes.py`, `admin_metrics.py`, `ops_log.py`, `ops_alerts.py` | Good operational visibility (funnel, scan cost, quality). |

---

## 5. KEEP / BUILD / DROP

| Decision | Item | Why (repo-grounded) |
|---|---|---|
| **KEEP** | GSTR-2B reconciliation + ITC-at-risk + IMS as the **headline** | Deterministic, defensible, recurring monthly need; already built (`reconcile_routes.py`, `itc_risk.py`, `ims.py`). |
| **KEEP** | Tally Converter + Tauri bridge | Unique, scan-free, "Tally-ready" is a real CA hook (`converter_service.py`, `bridge/`). |
| **KEEP** | Scan pipeline **as an accelerator**, with the Verification Grid front-and-center | Mature and safe (`extraction.py`, trust gates, `ScanVerificationGrid.tsx`). |
| **KEEP** | Credits-only monetization | Already implemented; no hard Pro locks (`credits.py`). |
| **BUILD** | **Purchase-register importer → `invoices`** (CSV/Excel/Tally) | Removes the single breakpoint; reuse `converter_service.register_df_to_document`. *This is #1.* |
| **BUILD** | **Confidence-gated auto-save + batch review UX** | Only auto-accept `auto_accepted`; route `needs_review`/`needs_retry` into a bulk review lane. Signals already exist (`Extraction_State`, `Review_Fields`). |
| **BUILD** | **Turn on OCR grounding** for photos/handwriting | `OCR_ENABLED=1` + `AZURE_DI_*`; validate via `bench/run_ocr_compare.py`. Directly fixes the worst-case scans. |
| **BUILD** | "Scan is optional" onboarding + empty states | Let a firm reconcile from imported PR on day one, before any scan. |
| **DROP / DE-EMPHASIZE** | Scan as the hero of marketing & onboarding | Reframe as accelerator; reconciliation is the wedge. |
| **DROP / DEFER** | Native mobile app; broad "Virtual CFO"; gating hard Pro locks | Capture already works via portal/WhatsApp/PWA; focus beats breadth. |
| **DROP / DEFER** | AI bank matching by default | Deterministic rules already suffice (`BANK_AI_MATCH=0`); avoid cost/latency. |

---

## 6. Delivery-form recommendation

**Web (primary) + Tauri Tally bridge (differentiator) + phone capture via existing portal/WhatsApp/PWA. Defer native mobile.** Justification is entirely in the repo:

- **Web app is the mature surface** — full workspace (`frontend/src/App.tsx` routes: dashboard, scan, reconcile, itc-risk, ims, bank, tally-converter, clients, wallet).
- **Desktop = the Tauri bridge, not a second app.** `bridge/src-tauri/src/lib.rs` already authenticates a device, polls `/api/bridge/jobs/next`, and pushes vouchers to a **local Tally HTTP port** (`tally_host:tally_port`). Tally lives on the CA's Windows desktop/on-prem — this bridge is the credible "syncs to Tally" story competitors struggle with. Invest in packaging + onboarding (`settings/BridgeTab.tsx`), not a generic desktop rebuild.
- **Mobile capture is already covered without a native app:** `SnapPage.tsx` (`/snap/:clientId`), the client `CollaborationPortal.tsx` (`/portal/:clientId`), and WhatsApp (`whatsapp_service.py`). A PWA "add to home screen" gets 90% of native capture value at ~0% of the cost. Build native only if analytics later show capture drop-off.

**[ASSUMPTION]** Indian CAs are Tally-centric and desktop-bound for accounting; a browser workspace + a small Tally sync agent fits their workflow better than forcing a new desktop suite.

---

## 7. Phased plan to a confident, no-breakpoint, day-one-sellable product

### Milestone 1 — "Reconcile without scanning" (2–3 weeks) — kills the breakpoint
- **Build the purchase-register importer** into `invoices` (CSV/Excel, and Tally export). Reuse `converter_service.register_df_to_document`; write via a new bulk path mirroring `save_invoice_atomic`. Mark rows `source="import"`.
- Reframe onboarding: a firm uploads PR + GSTR-2B and gets a reconciliation + ITC-at-risk report **with zero scans**.
- **Confidence-gated auto-save**: auto-accept only `auto_accepted`; everything else lands in a review lane.
- *Success:* a new user reaches a reconciliation result in one session without scanning a single image. Sellable day one.

### Milestone 2 — "Scan that doesn't scare anyone" (2–4 weeks) — scan as trusted accelerator
- **Enable Azure DI OCR grounding** for images/handwriting (`OCR_ENABLED=1`); prove uplift with `bench/run_ocr_compare.py` before rollout.
- **Batch review UX**: queue by `Extraction_State` + `Review_Fields`; keyboard-first correction; "approve all high-confidence."
- Every scanned row is explicitly a **draft** until confirmed; the Verification Grid is the default landing, not an afterthought.
- Expand the gold set (`backend/tests/fixtures/invoices/cases/`) with real messy WhatsApp/handwritten samples; publish an internal accuracy dashboard from `ops_log`/`admin_metrics`.
- *Success:* measured accuracy + review-time-per-invoice trend on the founder's worst cases; scan opt-in, never a gate.

### Milestone 3 — "Tally-ready CA workspace" (3–5 weeks) — durable moat
- Harden + package the **Tauri Tally bridge** (installer, guided device pairing, clear status/error surfaced from `poll_once`).
- Round-trip: import PR → reconcile → ITC-at-risk → export/push vouchers to Tally via bridge.
- Polish **audit packs** and firm-level reporting for month-end sign-off.
- *Success:* a firm runs a full monthly close (import → reconcile → Tally push) end-to-end.

### Small, concrete engineering changes that reduce scan fragility (all backed by existing code)
1. **Manual/CSV/Tally PR import as first-class input** → decouples reconciliation from scan (reuse `converter_service.py`).
2. **Treat scan output as a draft**: never auto-accept below `auto_accepted`; surface `Review_Reasons`/`Review_Fields` prominently.
3. **Confidence-gated auto-save** using the existing `Extraction_State` machine (`compute_confidence`).
4. **Turn on OCR grounding** for photos/handwriting (config only; code exists in `ocr.grounding`).
5. **Batch review lane** keyed off `Field_Confidence` for fast bulk correction.
6. **"Import instead" fallback** offered whenever a scan lands in `needs_retry` — no dead ends.

---

## 8. Market context — brief **[ASSUMPTION]**s (separate from repo facts)

- **ClearTax** leads GSTR reconciliation/compliance; **TallyPrime** owns on-prem accounting; **Zoho Books** owns SMB cloud accounting. Scanning is a feature in all, rarely the whole product.
- Implication: winning on *"AI scanner"* is a crowded, accuracy-fragile race. Winning on *"fastest GSTR-2B reconciliation + ITC protection that pushes straight into Tally, with scan as a bonus"* is a sharper, more defensible wedge — and it matches what this repo is already strongest at.

---

## 9. Bottom line

Scan is a **well-engineered accelerator**, not a liability — but it is currently the **only door** into the data that powers everything else, which is what makes it *feel* like a breakpoint. Add one import path, front the Verification Grid, flip on OCR grounding, and lead with reconciliation + Tally. The product then sells from day one and degrades gracefully when a scan is bad, because a scan is never required.
