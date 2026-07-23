# Milestone 1 — "Reconcile without scanning" (Purchase-Register Import → `invoices`)

**Goal:** a firm uploads a Purchase Register (CSV/Excel, ideally a Tally export) + GSTR-2B and gets a reconciliation + ITC report with **zero scans**. Scan becomes an optional accelerator, not a gate.

**Author:** Senior full-stack engineering plan (repo-grounded). **Repo:** `d:\GST SAAS`. **Date:** 2026-07-23.
**Scope:** planning only — no code/config changed. Prior context: `docs/product-strategy-pivot.md` §3, §7 (Milestone 1).

> Grounding note: The `user-code-review-graph` MCP graph was empty at time of writing (`list_graph_stats` → 0 nodes, never built), so tracing below was done with Grep/Read. All file paths and line ranges are from the working tree at head.

---

## 0. Design principle

The smallest change that removes the scan gate is: **reuse the existing atomic write path (`save_invoice_atomic`) unchanged**, and add a thin, deterministic **adapter** that turns an uploaded Purchase-Register DataFrame into exactly the same per-row `invoice_data` + `line_items` JSON shape the save path already accepts. Everything downstream (`reconcile_routes.py`, `itc_risk.py`, `ims.py`) already reads `invoices` and needs **no change**.

We do **not** rebuild the Verification Grid, the reconciliation engine, or the DB writer. We add: one backend service module, one (or two) endpoints, one frontend upload+mapping panel that injects synthetic rows into the existing grid, and (optionally) one tiny migration to stamp `source='import'`.

---

## 1. Current save path, reverse-engineered

### 1.1 Frontend → RPC

- **Entry:** `frontend/src/pages/scan/saveInvoice.ts::saveSingleInvoiceToDb(_fileId, fs, data, userId, clientId)` (lines 32–114).
  - Builds a snake_case `invoiceData` object (lines 39–91) from Title_Case `InvoiceData` keys (e.g. `data.Supplier_GSTIN` → `supplier_gstin`).
  - Money is passed through `safeMoney(...)`, confidence through `safeConfidence(...)`, dates through `formatDateToIso(...)`.
  - `extraction_state` defaults to `'auto_accepted'` (line 90).
  - Builds `lineItems` from `data.Line_Items` (lines 93–100): `{description, hsn_sac, quantity, unit_price, tax_rate, amount}`.
  - Best-effort vendor-memory learn (lines 6–30, 102–105) — non-blocking; irrelevant for import.
  - **The write:** `supabase.rpc('save_invoice_atomic', { invoice_data: invoiceData, line_items: lineItems })` (lines 107–110). Throws on `rpcError`.
- **Normalizers:** `frontend/src/pages/scan/utils.ts`
  - `safeMoney` (lines 10–15): clamps to `NUMERIC(18,2)` range, rounds to 2 dp, non-finite → null.
  - `safeConfidence` (lines 18–24): accepts 0–1 or 0–100, clamps 0–100.
  - `formatDateToIso` (lines 26–49): accepts `YYYY-MM-DD`, `DD-MM-YYYY`, `DD/MM/YYYY`, etc., → ISO `YYYY-MM-DD` or null.
- **Caller (auto-save + bulk save):** `frontend/src/pages/scan/useScanWorkflow.ts`
  - `autoSaveInvoice` (lines 475–502) and `handleSaveToCloud` (lines 534+) iterate `fileStates`, call `saveSingleInvoiceToDb(...)`, then `queryClient.invalidateQueries({ queryKey: ['invoices'] })` (line 490).
  - `updateExtractedData(id, data)` (lines 471–473) is how the grid edits a row; sets `savedToCloud=false`.
- **Grid components:** `frontend/src/pages/scan/ScanPage.tsx` wires `ScanUploadPanel` + `ScanVerificationGrid` (lines 23–53). `ScanVerificationGrid.tsx` (props interface lines 9–24) renders `fileStates: FileState[]` and calls `handleSaveToCloud`, `updateExtractedData`. Row editor: `InvoiceRow.tsx`.

### 1.2 The DB write (authoritative version)

- **RPC:** `save_invoice_atomic(invoice_data JSONB, line_items JSONB) RETURNS UUID`, current definition in `supabase/migrations/migration_phase58_client_and_invoice_rpc_fix.sql` lines 145–261 (`SECURITY DEFINER`, `SET search_path=public`). (History: `migration_phase18_save.sql`, `phase21_gst_fields.sql`, `phase30_virtual_cfo.sql`, `phase45_security_audit_fixes.sql` — phase58 is the latest and the one to mirror.)
  - **Auth/scoping guards:** `req_user_id = invoice_data->>'user_id'`; must equal `auth.uid()` (lines 163–165). `req_client_id` required (167–169). `has_client_access(req_client_id)` enforced (171–173). Maker-checker → `approval_status` `'pending_approval'`/`'approved'` (175, 236).
  - **Insert into `invoices`** (lines 177–238): uses `safe_json_date(...)` (lines 22–36) and `safe_json_bool(...)` (lines 6–20) helpers and `NULLIF(...,'')::DECIMAL` casts, so empty strings never throw.
  - **Line items loop** into `invoice_line_items` (lines 240–255).
  - `extraction_state` default `'auto_accepted'` (line 237).
- **`org_id` is NOT passed by the RPC.** It is stamped by trigger `set_default_org_id()` (phase58 lines 67–82; also `phase55_fix_org_trigger.sql`) from `profiles.active_org_id` or the user's owned org. **Import inherits org scoping for free** — do not set `org_id` manually.

### 1.3 `invoices` table columns / types

Base table: `supabase/migrations/supabase_schema.sql` lines 20–73. Notable:
- Identity/scoping: `id UUID`, `user_id`, `client_id`, `org_id` (added later, via trigger).
- Supplier/buyer text fields; `place_of_supply`, `invoice_date DATE`, `due_date DATE`, `invoice_number TEXT`, `po_number`, `e_way_bill_number`, `vehicle_number`.
- Money `DECIMAL` (widened to `NUMERIC(18,2)` by `migration_phase78_widen_invoice_money.sql`): `taxable_amount, cgst_amount, sgst_amount, igst_amount, round_off, total_amount, gst_amount, cess_amount, received_amount, balance_amount, previous_balance, current_balance`.
- **Generated column (do NOT write):** `gst_math_valid BOOLEAN GENERATED ALWAYS AS (...) STORED` (schema lines 49–51; re-created in `phase78`). It recomputes `round(taxable+cgst+sgst+igst+round_off,2) = round(total,2)`.
- `confidence_score NUMERIC(5,2)`, `amount_in_words`, bank fields, `supplier_gstin_status`.
- Reconciliation: `recon_status TEXT CHECK (... 'unreconciled','matched','mismatch','missing_in_2b','missing_in_pr')` (schema line 65), `recon_period TEXT` — **set by the reconcile engine, not the writer**.
- Lifecycle: `processing_status TEXT DEFAULT 'completed'` (`phase13`), `error_message`, `expense_category`, `extraction_state` (`phase12`), `approval_status` (`phase30`), `invoice_type`, `reverse_charge_applicable`, `cess_amount`, `irn`, `original_invoice_number`, `original_invoice_date` (`phase21`).
- **No `source` column today.** (Grep of all migrations found none on `invoices`.)

**Required vs optional (from the RPC + downstream):**
- Hard-required by RPC: `user_id` (=caller), `client_id` (with access). Everything else is nullable.
- Effectively required for the milestone value chain (reconciliation): `supplier_gstin`, `invoice_number`, `invoice_date`, `taxable_amount`/`total_amount` (see §1.4).

### 1.4 Dedupe keys (there is no DB unique constraint)

- No unique index/constraint on `invoices` for natural dedupe (none found in migrations). Duplicate suppression is currently implicit (scan-side duplicate detection in `scan_routes.py`).
- The **reconciliation match key** is the de-facto natural key: `supplier_gstin` + `invoice_number` (+ `invoice_date`, amounts). See `backend/reconcile_routes.py`:
  - PR read: `select=id,supplier_gstin,invoice_number,invoice_date,taxable_amount,total_amount,recon_status,recon_period` filtered by `client_id` (lines 156–165).
  - Deep-match key: `f"{clean_str(supplier_gstin)}_{clean_str(invoice_number)}"` (lines 306–312); helpers in `backend/match_utils.py` (`clean_str`, `match_pr_to_b2b`).
- **Import dedupe strategy:** compute the same key `norm(supplier_gstin) + '|' + norm(invoice_number)` scoped to `client_id`, and check against existing `invoices` for that client before insert. This is application-level (query existing keys once, skip/flag duplicates). A DB unique index is **optional** (see §5) and risky to add against dirty historical data, so default to app-level dedupe.

---

## 2. Reuse map — `backend/converter_service.py`

### 2.1 What already exists and is directly reusable

| Piece | Location | Reuse for import |
|---|---|---|
| Column alias sets (`_DATE_ALIASES`, `_VOUCHER_NO_ALIASES`, `_PARTY_ALIASES`, `_AMOUNT_ALIASES`, `_TAXABLE_ALIASES`, `_CGST/_SGST/_IGST/_CESS_ALIASES`, `_GSTIN_ALIASES`, `_NARRATION_ALIASES`) | lines 52–75 | **Reuse as-is** for auto-detecting messy headers. |
| `_norm_header(h)` | 78–79 | Header normalization (lower, collapse spaces). Reuse. |
| `_find_col(columns, aliases)` | 82–92 | Fuzzy exact-then-contains header → column resolver. **Core of auto-mapping.** Reuse. |
| `_to_float(val)` | 95–107 | Currency normalization: strips `₹`, `Rs.`, `INR`, commas; `(x)`→`-x`. Reuse for all money cells. |
| `_cell_str(val)` | 110–113 | NaN-safe cell → string. Reuse. |
| `read_tabular_file(content, filename)` | 203–223 | CSV/Excel(.xlsx/.xls) → DataFrame, drops empty rows, strips headers. **Reuse verbatim.** |
| `detect_doc_type_from_dataframe` / `detect_doc_type_from_text` | 129–196 | Confirm the upload is a Purchase Register (or warn). Reuse for UX hinting. |
| `register_df_to_document(df, doc_type, filename)` | 239–367 | **Model to fork, not call.** Its per-row logic (column resolution 245–256; taxable/total/tax reconciliation 288–302; date `strftime` handling 339–342) is exactly what we need — but it emits `VoucherIR`/`TallyDocument` (Tally shape), not `invoices` rows. We reuse its *logic*, targeting the invoice dict instead. |

### 2.2 The gap (why we need a small adapter)

`register_df_to_document` produces Tally IR (`VoucherIR` with `ledger_legs`, `BillAllocation`, etc.), which is the wrong shape for `invoices`. The invoice save path wants the Title_Case `InvoiceData` dict (§1.1) or directly the snake_case `invoice_data` JSON (§1.2). Also, `converter_service` maps only a single generic GSTIN column (`_GSTIN_ALIASES`) and does not distinguish supplier vs buyer, PAN, place-of-supply, HSN line items, or invoice number vs voucher number nuances that matter for GSTR-2B matching.

### 2.3 Smallest new "adapter" layer

A new function `purchase_register_df_to_invoices(df) -> list[dict]` that:
1. Resolves columns with the **existing** `_find_col` + alias sets (extend with a few PR-specific aliases: `_SUPPLIER_GSTIN_ALIASES`, `_INVOICE_NO_ALIASES`, `_HSN_ALIASES`, `_TAX_RATE_ALIASES`, `_PLACE_OF_SUPPLY_ALIASES`).
2. Per row, extracts + normalizes using the **existing** `_to_float`, `_cell_str`, and the date logic from lines 339–342 (factored into a small `_to_iso_date` helper mirroring frontend `formatDateToIso`).
3. Derives taxable/total/tax using the **existing** reconciliation math (lines 288–302).
4. Emits the snake_case `invoice_data` dict + `line_items` list matching the RPC contract exactly, with `extraction_state='imported'` (or `'auto_accepted'` when math is clean) and `confidence_score=100` for clean rows.

This keeps the new code to ~1 module and reuses ~80% of converter parsing.

---

## 3. Backend design

### 3.1 New module: `backend/import_service.py`

Responsibilities (pure, deterministic, unit-testable — mirrors `converter_service` style, no LLM):
- `read_purchase_register(content: bytes, filename: str) -> pd.DataFrame` → wraps `converter_service.read_tabular_file` (+ Tally-export handling, see §6).
- `auto_detect_columns(df) -> ColumnMapping` → uses `_find_col` + alias sets; returns detected header→field map + a list of unmapped/ambiguous fields for the UI.
- `purchase_register_df_to_invoices(df, mapping: ColumnMapping | None) -> ImportResult` → per-row build of `{invoice_data, line_items}` dicts; when an explicit `mapping` is supplied by the UI it overrides auto-detect.
- `validate_import_row(row_dict) -> RowReport` → reuses `backend/validators.py`:
  - `validate_gstin(supplier_gstin)` + `repair_gstin_ocr(...)` (validators lines 49–200) — flag/repair bad GSTINs.
  - `validate_tax_arithmetic(row_dict)` (validators lines 224–274, ₹1 tolerance) — flag `needs_review` when math is off.
  - Set `extraction_state`: `'auto_accepted'` if GSTIN ok **and** tax math ok; else `'needs_review'` with `Review_Reasons` (reuse the `review_reasons.py` shape) so imported rows highlight in the grid exactly like scanned ones.
- `compute_dedupe_key(row) -> str` → `norm(supplier_gstin)|norm(invoice_number)` (see §1.4).

`ImportResult` = `{ rows: [{invoice_data, line_items, row_index, status, reasons[], dedupe_key}], summary: {total, ready, needs_review, duplicates_in_file, errors} , detected_doc_type, mapping }`.

### 3.2 New endpoints (mounted on a new router `import_routes.py`, `prefix="/api"` in `main.py` alongside the others at lines 134–150)

**A. Parse/preview (no DB write, no credits):**
```
POST /api/import/purchase-register/preview
Content-Type: multipart/form-data
  file: UploadFile (.csv/.xlsx/.xls/.xml-tally)
  client_id: str (Form)          # verify_client_access
  mapping: str (Form, optional)  # JSON: {field: header} user overrides
  period: str (Form, optional)   # "MM-YYYY" hint (not persisted; reconcile sets recon_period)
→ 200 {
    detected_doc_type, confidence,
    mapping: {resolved header→field, unmapped[]},
    row_count,
    preview_rows: ImportResult.rows[0:200],  # capped for UI
    summary: {total, ready, needs_review, duplicates, errors}
  }
```
- Auth: `Depends(get_current_user)` → `auth["supabase_client"]`, `auth["user_id"]`, `auth["token"]`; `await verify_client_access(sc, client_id)` (pattern copied from `tally_routes.tally_converter_detect`, lines 104–113).
- File-size guard: 25 MB like `tally_routes` line 116 (see §6 for streaming of larger files).
- **No `deduct_credits_rpc` call** — import is free (see §3.4).

**B. Commit (DB write, no credits):**
```
POST /api/import/purchase-register/commit
Content-Type: application/json
  { client_id, mapping, rows: [{invoice_data, line_items, action: "insert"|"skip"}] }
→ 200 { inserted, skipped, failed: [{row_index, error}], invoice_ids[] }
```
- **Two implementation options — prefer Option 1 (max reuse, thin backend):**
  - **Option 1 (recommended): commit on the client.** Backend `/preview` returns rows; the frontend injects them into the Verification Grid (§4) and reuses the **existing** `saveSingleInvoiceToDb` → `save_invoice_atomic` per row (already `SECURITY DEFINER`, already enforces `auth.uid()`+`has_client_access`, already invalidates `['invoices']`). No new commit endpoint or new bulk RPC needed. This is the smallest change and reuses the entire hardened write path verbatim.
  - **Option 2 (server-side bulk):** add `commit` endpoint that loops rows and calls a new `save_invoices_bulk` RPC (a thin wrapper looping `save_invoice_atomic`'s body). More code, a new migration, and re-implements auth guards. Only choose if very large imports make per-row client round-trips too slow.
- **Decision:** ship Option 1 for Milestone 1. Keep Option 2 as a documented follow-up if profiling shows per-row latency is a problem for >2k-row registers.

### 3.3 Column-mapping / auto-detect for messy headers

- Start from `converter_service._find_col` (exact-normalized, then substring-contains). Extend alias sets with real-world PR variants: `"gstin of supplier"`, `"gstin no"`, `"supplier gst no"`, `"invoice value"`, `"taxable value"`, `"rate"`, `"igst rate"`, `"place of supply"`, `"pos"`, `"document number"`, `"document date"`.
- Return **both** the resolved mapping and the unmapped required fields so the UI can prompt for manual mapping (§4). Persist nothing server-side; the mapping travels with `/preview` and (Option 1) is applied client-side.
- Confidence: reuse `detect_doc_type_from_dataframe` to warn if the file doesn't look like a Purchase Register (e.g. user uploaded GSTR-2B by mistake).

### 3.4 Credits / wallet

- **Import must NOT cost AI credits.** Rationale: it's deterministic spreadsheet parsing (no LLM), and the strategy explicitly positions import as the scan-free wedge. Concretely: do **not** call `extraction.deduct_credits_rpc` / `ensure_sufficient_credits` (contrast `tally_routes.py` lines 140–149 which *do* charge). Keep `backend/credits.py` and `frontend/src/lib/pricing.ts` unchanged (no new cost key), and note "Purchase-Register import: free" in `CREDITS_DOCUMENTATION.md` to satisfy the credits-only project rule (keep pricing/docs in sync).

### 3.5 Source / confidence / needs_review marking

- `extraction_state`: `'auto_accepted'` (clean) or `'needs_review'` (GSTIN/math flags) — reuses the existing state machine so imported rows behave like scanned drafts in the grid.
- `confidence_score`: `100` for clean rows; lower/omit for flagged rows.
- **`source`:** to distinguish import vs scan, prefer a real column `source TEXT` (see §5). If we want zero migration, a fallback is to reuse `file_name` prefix (e.g. `"[import] register.xlsx"`) — but that's hacky; recommend the tiny migration.

### 3.6 Multi-org / business scoping + auth

- Fully inherited: `verify_client_access` on the endpoint + `save_invoice_atomic`'s internal `auth.uid()` and `has_client_access` guards + the `set_default_org_id` trigger. No extra scoping code required.

---

## 4. Frontend design

### 4.1 Entry point (alongside Scan)

- Add an **"Import"** tab/toggle in `ScanUploadPanel.tsx` (next to the existing `single`/`zip` `uploadMode` in `useScanWorkflow.ts` line 91) → extend `uploadMode` to `'single' | 'zip' | 'import'`. Keeps everything on the existing Scan page so the grid is reused. (Alternatively a sibling route `/import`; but reusing the Scan page maximizes grid reuse.)
- Reframe copy per strategy: "Upload your Purchase Register — no scanning needed."

### 4.2 Upload + column-mapping UI (new component `frontend/src/pages/scan/ImportPanel.tsx`)

- Dropzone (reuse `react-dropzone` pattern from `ScanUploadPanel`) → POST `multipart` to `/api/import/purchase-register/preview` with `client_id`.
- Render a **mapping table**: detected header → target field dropdowns, pre-filled from backend `mapping`, with unmapped-required fields highlighted. Re-POST `/preview` with `mapping` overrides on change (debounced).
- Show `summary` chips: `ready`, `needs_review`, `duplicates`, `errors`.

### 4.3 Flow into the existing Verification Grid (reuse, don't rebuild)

- On "Add to grid", convert each preview row's `invoice_data` (snake_case) back into a Title_Case `InvoiceData` object and push **synthetic `FileState`** entries into `fileStates` (via `setFileStates`):
  ```ts
  { id: uuid(), file: new File([], row.invoice_number ?? 'import-row'),
    previewUrl: null, isScanning: false,
    extractedData: <InvoiceData built from invoice_data + line_items>,
    error: null, savedToCloud: false, clientId: activeClientId }
  ```
  `FileState`/`InvoiceData` types are in `frontend/src/lib/ScanContext.tsx` (lines 5–89). `file` is only used for `file.name` on save (`saveInvoice.ts` line 42), so an empty `File` stub is fine.
- Users review/edit in the **existing** `ScanVerificationGrid`/`InvoiceRow`; `needs_review` rows highlight via the existing `Review_Reasons`/`Review_Fields` mechanism.
- Commit via the **existing** `handleSaveToCloud` (`useScanWorkflow.ts` lines 534+) → `saveSingleInvoiceToDb` → `save_invoice_atomic`. Zero new save code (Option 1).

### 4.4 TanStack Query wiring + resilience (project rules)

- `/preview` runs through a `useMutation` (file upload). Handle `isError`/`isPending`: show `<ErrorState>` with a Retry action; never leave an infinite spinner (project rule: destruct `isError`, render `ErrorState`). Follow the existing `network-resilience` pattern (`page.route` 500 mocking).
- After successful client-side commit, the existing `queryClient.invalidateQueries({ queryKey: ['invoices'] })` (line 490) refreshes reconciliation/ITC/IMS reads.
- Memoize the mapping table + preview grid (`useMemo`/`useCallback`) per the large-grid performance rule.

---

## 5. DB / migration needs (keep minimal)

Two options; recommend the minimal one.

- **Recommended (1 tiny migration):** `supabase/migrations/migration_phase79_invoice_source.sql`
  ```sql
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'scan'
    CHECK (source IN ('scan','import','portal','whatsapp'));
  -- extend save_invoice_atomic to read invoice_data->>'source' (default 'scan')
  ```
  - Add `source` to the RPC's insert list (mirror the phase58 body) and to the frontend `invoiceData` builder (`saveInvoice.ts`) as `data.Source ?? 'scan'`. Backfill is unnecessary (`DEFAULT 'scan'` covers existing rows).
  - No new index required for Milestone 1. If dedupe-by-query proves slow at scale, optionally add:
    `CREATE INDEX IF NOT EXISTS idx_invoices_client_gstin_invno ON invoices (client_id, supplier_gstin, invoice_number);` (mirrors the naming of `idx_invoices_client_recon_status` in `phase66`).
- **Zero-migration fallback:** skip `source`; infer import via `extraction_state='imported'` (needs adding to any CHECK — but `extraction_state` has no CHECK today, so it's free-text and safe). Slightly less clean for analytics.

**Do not** touch the `gst_math_valid` generated column or `recon_status`/`recon_period` (engine-owned).

Filename convention confirmed: latest is `migration_phase78_widen_invoice_money.sql`, so use **`migration_phase79_...`**.

---

## 6. Risks, edge cases, and test plan

### 6.1 Edge cases & mitigations
- **Non-standard headers:** covered by `_find_col` + extended aliases + the manual mapping UI fallback.
- **Multi-line-item invoices:** two shapes — (a) one row per invoice with header totals (common in PR exports) → 0 line items, fine; (b) multiple rows sharing one invoice number (itemized) → group by `invoice_number`+`invoice_date` (reuse the grouping idea from `journal_df_to_document` lines 515–522), aggregate taxable/tax, collect `line_items`. Ship (a) first; (b) as a mapping toggle "rows are line items".
- **Duplicate imports:** app-level dedupe key (§1.4); preview marks `duplicate` rows `action:"skip"` by default; re-importing the same file is idempotent by skip.
- **Huge files:** cap at 25 MB (like `tally_routes` line 116) and cap preview to ~200 rows; parse full file server-side but stream the response summary. For Option 1 commit, chunk client-side saves (mirror `handleScanAll` `CHUNK_SIZE=5`, lines 516–519) to avoid hammering the RPC.
- **Tally export specifics:** Tally "Purchase Register" export is typically XLSX/CSV (works via `read_tabular_file`) or Tally XML. XML is out-of-shape for `read_tabular_file`; add a `read_tally_xml_register(content)` that flattens `<VOUCHER>`/`<ALLINVENTORYENTRIES.LIST>` into a DataFrame (new, small; the existing converter only *writes* XML via `tally_export.py`, it doesn't read it). If XML parsing is deferred, clearly surface "export as Excel/CSV from Tally" guidance (mirrors the PDF hint in `tally_routes.py` lines 262–265).
- **GSTIN repair vs corruption:** only auto-apply `repair_gstin_ocr` when it yields a checksum-valid GSTIN; otherwise flag `needs_review` (don't silently mutate).
- **Wrong file uploaded (GSTR-2B instead of PR):** `detect_doc_type_from_dataframe` warns before commit.
- **Money overflow / locale:** `_to_float` handles `₹`/commas/parens; RPC uses `NUMERIC(18,2)` (phase78) so large values won't overflow.

### 6.2 Tests to add / extend
- **Backend (pytest, `backend/tests/`):**
  - New `test_import_service.py`: column auto-detect on messy headers; `_to_float`/date normalization; taxable/total/tax derivation; dedupe key; `validate_import_row` states (clean→auto_accepted, bad GSTIN/broken math→needs_review). Fixtures: small CSV/XLSX purchase registers (add under `backend/tests/fixtures/`).
  - New `test_import_routes.py`: `/preview` happy path + auth (`verify_client_access` denial), 25 MB guard, no-credit-deduction assertion. Mirror `test_reconcile_routes.py` / `test_bank_routes.py` structure; reuse `conftest.py` fixtures.
  - Extend `test_reconcile_routes.py` (or add `test_import_then_reconcile.py`): import PR rows → run `reconcile_gstr2b` against a GSTR-2B fixture → assert `recon_status` transitions. This is the end-to-end proof of the milestone.
  - Reuse existing `test_validators.py` to confirm validator behavior relied upon.
- **Frontend:**
  - Vitest: `ImportPanel` mapping logic; snake_case→Title_Case conversion; synthetic `FileState` builder.
  - Playwright: extend the network-resilience suite — mock `/api/import/purchase-register/preview` 500 → assert `<ErrorState>` + Retry (no infinite spinner); happy-path: upload CSV → rows appear in Verification Grid → Save → invoices query invalidated.

---

## 7. Task breakdown (ordered, independently verifiable)

| # | Task | Files | Effort | Verifiable when |
|---|---|---|---|---|
| 1 | Adapter + validators glue: `purchase_register_df_to_invoices`, `auto_detect_columns`, `validate_import_row`, dedupe key | `backend/import_service.py` (new); reuse `converter_service._find_col/_to_float`, `validators.py` | ~1 d | `test_import_service.py` green |
| 2 | Extend alias sets + PR-specific aliases; `_to_iso_date` helper | `import_service.py` (local) | ~0.5 d | mapping unit tests green |
| 3 | `/api/import/purchase-register/preview` endpoint + router mount | `backend/import_routes.py` (new); `backend/main.py` include_router (~line 150) | ~0.5 d | `test_import_routes.py` green; manual curl returns preview |
| 4 | (Optional) Tally XML register reader | `import_service.read_tally_xml_register` | ~1 d | XML fixture → DataFrame test |
| 5 | Migration `phase79`: `source` column + RPC insert of `source` | `supabase/migrations/migration_phase79_invoice_source.sql`; `saveInvoice.ts` (+`source`) | ~0.5 d | migration applies; scan+import rows carry correct `source` |
| 6 | Frontend `ImportPanel` + `uploadMode='import'` toggle | `ImportPanel.tsx` (new), `ScanUploadPanel.tsx`, `useScanWorkflow.ts` | ~1.5 d | upload → mapping UI renders; `/preview` mutation wired |
| 7 | Inject preview rows as synthetic `FileState` into grid; reuse `handleSaveToCloud` | `useScanWorkflow.ts`, `ImportPanel.tsx` | ~1 d | rows appear/edit/save via existing grid; `['invoices']` invalidated |
| 8 | Resilience + memoization (isError/ErrorState/Retry) | `ImportPanel.tsx` | ~0.5 d | Playwright 500-mock test green |
| 9 | E2E test: import PR + GSTR-2B → reconciliation + ITC with zero scans | `backend/tests/test_import_then_reconcile.py`, Playwright happy-path | ~1 d | full chain asserted |
| 10 | Docs: `CREDITS_DOCUMENTATION.md` "import is free"; onboarding empty-state copy | docs + empty states | ~0.5 d | pricing/docs in sync (project rule) |

**Total:** ~8–9 dev-days (fits the 2–3 week Milestone-1 window with buffer for Tally XML + review).

### Definition of Done
A new firm, having scanned **nothing**, can: (1) upload a CSV/Excel (or Tally-exported) Purchase Register on the Scan/Import surface; (2) auto/manually map columns; (3) review flagged rows in the existing Verification Grid; (4) commit them into `invoices` (`source='import'`); (5) upload GSTR-2B and run reconciliation (`reconcile_routes.py`); and (6) see reconciliation results, ITC-at-risk (`itc_risk.py`), and IMS (`ims.py`) populated — **all with zero scans and zero AI credits spent**. Verified by `test_import_then_reconcile.py` and the Playwright happy-path.
