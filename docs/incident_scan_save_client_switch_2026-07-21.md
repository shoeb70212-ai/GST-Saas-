# Incident Report: Scanned Invoices Not Saving / Not Appearing on Invoices Screen

**Date:** 2026-07-21  
**Severity:** High (core workflow broken: scan succeeds, persistence fails)  
**Status:** Fixed and deployed (`0124b62` on `main`)  
**Surfaces:** Scan page → auto-save / manual Save → Saved Invoices  
**Related earlier fixes:** Phase 57/58 migrations, `create_client_secure`, `save_invoice_atomic` safe casts (`585275d`)

---

## 1. Summary

Users could:

- Create clients (after Phase 58 RPC fix)
- Select a client (e.g. **ZK Trader**)
- Scan an invoice successfully (UI showed **Complete** / **AUTO ACCEPTED**)

But invoices:

- Did **not** persist to Supabase
- Did **not** appear on the **Invoices** screen
- Left **Save (1)** enabled (meaning `savedToCloud === false`)

Database confirmation after the incident:

| Client | Invoice count |
|--------|---------------|
| ZK Trader | **0** |
| Service Role Test Client | **0** |

Scan API was healthy. The failure was almost entirely in the **frontend save path**, with earlier related bugs in **RLS / RPC casting**.

---

## 2. Symptoms (What Users Saw)

1. Scan queue: green **Complete**
2. Verification grid: **AUTO ACCEPTED**, **Save (1)** still available
3. Invoices page for that client: empty
4. Console often full of red errors that looked related but were **not**

### Red herrings (do not chase these first)

| Console / URL signal | Actual meaning |
|----------------------|----------------|
| `No listener: tabs:outgoing.message.ready` | Browser extension noise |
| `message port closed before a response was received` | Browser extension noise |
| `api.processstack.online` → `DNS_PROBE_FINISHED_NXDOMAIN` | Subdomain does not exist and is **not used** |
| `processstack.online/api/` → `{"detail":"Not Found"}` | Backend **is** reachable via nginx; bare `/api/` has no route (expected FastAPI 404) |
| Missing `VITE_API_URL` | **Intentional** for same-origin Coolify deploy |

---

## 3. Root Causes

There were layered issues. The final “scan works, save doesn’t” bug was frontend state. Earlier blockers were DB/RPC.

### 3.1 Primary bug: stale React closure on auto-save (silent failure)

**File:** `frontend/src/pages/ScanPage.tsx` (pre-fix)

After scan completed, auto-save did roughly:

```ts
const fs = fileStates.find(f => f.id === fileId);
if (!fs) return; // silent exit — no toast, no RPC
```

Why this failed:

1. User drops files → `setFileStates([...prev, ...newFiles])` (async state update)
2. Scan starts immediately with the local `newFiles` objects
3. When the network scan finishes, `autoSaveInvoice` still closed over the **old** `fileStates` from the render that started the scan
4. That old array **did not contain** the newly dropped file IDs
5. `.find()` returned `undefined` → early `return` → **no `save_invoice_atomic` call**

Evidence:

- UI showed extraction success (`extractedData` set via a later `setFileStates`)
- `savedToCloud` stayed `false` → **Save (N)** remained
- Supabase API logs showed **no** recent `rpc/save_invoice_atomic` for these clients
- Invoice tables stayed at **0 rows** for those client IDs

This is a classic async + closure bug: **never look up just-mutated work from a render-scoped state snapshot inside a long-running async callback.**

### 3.2 Secondary bug: client ID not bound to each upload

`ScanContext` / queue state was **global** across client switches.

Problems:

- Queue from Client A could remain after switching to Client B
- Save used `activeClientId` from closure, not the client selected **at upload time**
- Manual save could target the wrong client or fail access checks

### 3.3 Earlier blockers (already fixed in Phase 57/58 + `585275d`)

These are documented here so the full timeline is clear:

| Issue | Effect | Fix |
|-------|--------|-----|
| Direct `clients` insert hit RLS `42501` | Could not create clients | `create_client_secure` SECURITY DEFINER RPC |
| `save_invoice_atomic` cast `''::boolean` | Save crashed on empty reverse-charge fields | `safe_json_bool` / `safe_json_date` |
| Settings clients query filtered by `user_id` | Org clients missing in settings | Removed incorrect filter |
| `has_client_access` requires `clients.org_id` | Save denied if client had null `org_id` | RPC always sets `org_id`; backfill `active_org_id` |

---

## 4. What Was Done to Fix It

### 4.1 Commit `0124b62` — persist scanned invoices to the correct client

**Files changed:**

- `frontend/src/pages/ScanPage.tsx`
- `frontend/src/lib/ScanContext.tsx` — added optional `clientId` on `FileState`
- `frontend/src/lib/api.ts` — shared `getApiUrl()` helper

**Concrete fixes:**

1. **Pass file state into auto-save**  
   After scan succeeds, build `updatedItem` and call:

   ```ts
   await autoSaveInvoiceRef.current(item.id, updatedItem, result.data, clientId);
   ```

   Do **not** re-find the file in `fileStates`.

2. **Keep a stable ref to auto-save**  
   `autoSaveInvoiceRef` is updated whenever `autoSaveInvoice` changes, so `scanFile` (which may be long-lived) always calls the latest saver without stale deps races.

3. **Bind `clientId` at drop time**  
   Each queued file stores `clientId: activeClientId`. Save uses `fs.clientId ?? activeClientIdRef.current`.

4. **Clear queue on client switch**  
   When `activeClientId` changes, `setFileStates([])` so Client A’s queue cannot be saved under Client B.

5. **Explicit `clientId` argument on `saveSingleInvoiceToDb`**  
   Never rely on a closed-over `activeClientId` for persistence.

6. **Surface errors**  
   Toast on auto-save success/failure and on manual Save with the real RPC message (no silent success when 0 saved).

7. **`getApiUrl()`**  
   - If `VITE_API_URL` set → use it  
   - Else in DEV → `http://localhost:8000`  
   - Else in production → `window.location.origin` (same-origin `/api` via nginx)

### 4.2 Deployment topology (confirmed correct — no env change required)

Coolify / `docker-compose.yml`:

- Frontend nginx serves the SPA
- `location /api/` proxies to `http://backend:8000/api/`
- `VITE_API_URL` left **empty** on purpose

Do **not** introduce `api.processstack.online` unless you create DNS + a separate backend service and set `VITE_API_URL` to that URL.

### 4.3 Database side (already live from Phase 58)

- `create_client_secure(p_client_name, p_gstin, p_pan)`
- Updated `save_invoice_atomic` with safe casts + `extraction_state`
- Clients like ZK Trader correctly have `org_id` and org membership for the owner

---

## 5. How It Should Work (Correct Flow)

```
User selects client (activeClientId)
        │
        ▼
Drop / select files
        │
        ├─ Each FileState gets clientId = activeClientId
        ├─ Files scanned sequentially (or in controlled chunks)
        │
        ▼
POST {origin}/api/scan-invoice  (auth Bearer)
        │
        ▼
UI shows extracted data (Complete / AUTO ACCEPTED)
        │
        ▼
autoSaveInvoice(fileId, fileState, data, clientId)
        │
        ▼
supabase.rpc('save_invoice_atomic', { invoice_data, line_items })
        │
        ├─ auth.uid() must match invoice user_id
        ├─ has_client_access(client_id) must pass
        │
        ▼
savedToCloud = true  + toast "Invoice saved"
        │
        ▼
Saved Invoices page query: invoices where client_id = activeClientId
```

**Invariants:**

1. Every scanable file in the queue has a `clientId` (or save must refuse with a toast).
2. Auto-save always receives the `FileState` (or at least `file` + metadata) as an argument — never only an ID lookup against render state.
3. Switching clients clears unfinished queue work.
4. Production API base URL is same-origin unless `VITE_API_URL` is explicitly set.
5. Client creation goes through `create_client_secure`, not raw `.insert()` into `clients`.

---

## 6. Prevention Rules (Do Not Regress)

### Frontend / React

| Rule | Why |
|------|-----|
| Never `fileStates.find(...)` inside async work started from an older render | Stale closure → silent skip |
| Prefer args + refs (`useRef` for latest callback / latest `activeClientId`) | Survives re-renders during long scans |
| Stamp domain keys (`clientId`) on the work item at creation time | Multi-tenant correctness |
| Reset shared context when the tenant key changes | Prevents cross-client data bleed |
| Toast on both success and failure of persistence | Silent `return` hid this incident for days |
| Do not treat extension console errors as app failures | Wastes debugging time |

### API / Deploy

| Rule | Why |
|------|-----|
| Keep empty `VITE_API_URL` with nginx `/api` proxy for single-domain Coolify | Matches `docker-compose` + `nginx.conf` |
| Only set `VITE_API_URL` if frontend and backend are on different public hosts | Otherwise DNS mistakes (`api.*`) break scans |
| Deploy frontend **and** backend together | nginx `proxy_pass http://backend:8000` needs the backend service |
| Verify `VITE_SUPABASE_URL` spelling (`wmxwjkmxyrngvitxseei`, not typos) | `ERR_NAME_NOT_RESOLVED` on Supabase |

### Database / RLS

| Rule | Why |
|------|-----|
| Create clients via `create_client_secure` | Direct insert RLS is fragile |
| Ensure every client has `org_id` | `has_client_access` returns false if `org_id` is null |
| Cast JSON fields with `safe_json_*` helpers in RPCs | Empty strings from LLM extraction crash Postgres casts |
| When debugging “not saved”, query the DB by `client_id` | UI “Complete” ≠ persisted row |

### Testing checklist (add to QA / Playwright over time)

- [ ] Select Client A → scan 1 file → toast “Invoice saved” → Invoices shows 1 row for A  
- [ ] Switch to Client B → queue empty → scan 1 file → appears only under B  
- [ ] Click manual **Save** when auto-save was interrupted → row appears; toast shows real error if RPC fails  
- [ ] Create client via UI → `org_id` non-null in DB  
- [ ] Production: `https://<domain>/api/scan-invoice` is reachable (auth required; not bare `/api/`)  
- [ ] Ignore extension-only console errors; check Network tab for `rpc/save_invoice_atomic`

---

## 7. Debugging Playbook (If This Happens Again)

1. **Confirm scan vs save**  
   - Scan failing → Network `POST /api/scan-invoice`  
   - Scan OK, Save (N) still shown → persistence path

2. **Check Network for**  
   `POST .../rest/v1/rpc/save_invoice_atomic`  
   - Missing entirely → frontend silent skip / not deployed  
   - Present with 4xx/5xx → read response body (Unauthorized, Client required, cast errors)

3. **Query Supabase**

   ```sql
   SELECT id, file_name, invoice_number, created_at
   FROM invoices
   WHERE client_id = '<active-client-uuid>'
   ORDER BY created_at DESC
   LIMIT 20;
   ```

4. **Confirm client access**

   ```sql
   SELECT id, client_name, org_id, user_id FROM clients WHERE id = '<uuid>';
   SELECT * FROM organization_members WHERE org_id = '<org_uuid>';
   ```

5. **Confirm deploy**  
   Hard refresh after Coolify deploy; ensure commit with ScanPage fix is live.

---

## 8. Related Commits / Migrations

| Ref | Purpose |
|-----|---------|
| `migration_phase57_fix_all_three_bugs.sql` | Org/client RLS and access helpers |
| `migration_phase58_client_and_invoice_rpc_fix.sql` | `create_client_secure`, safe casts, `save_invoice_atomic` |
| `585275d` | Frontend uses secure RPCs + cleaner invoice payload |
| `0124b62` | Stale-closure auto-save fix, per-file `clientId`, queue clear, `getApiUrl` |

---

## 9. Owner Notes

- **No `VITE_API_URL` is required** for the current Coolify single-domain setup.
- **Do not** point the app at `api.processstack.online` unless that hostname is created and wired.
- After any Scan/save change: redeploy frontend, hard-refresh, and verify a row exists in `invoices` for the selected `client_id` — do not trust “Complete” alone.
