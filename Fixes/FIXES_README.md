# KhataLens gap fixes — how to apply

## 1. Apply the patch
```bash
cd /path/to/GST-Saas-
git apply khatalens_gap_fixes.patch
```
If it doesn't apply cleanly (repo has moved on since this was generated), the
files are small enough to hand-copy — see the diff for exact changes.

## 2. One required infra step
The Collaboration Portal fix needs a **Supabase service role key** (Project
Settings → API → `service_role` secret). Add it as a new backend env var:

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Why:** RLS on `clients`/`invoices` requires `auth.uid() = user_id`. An
anonymous business owner visiting `/portal/:clientId` has no session, so an
anon-key request silently returns nothing. The service role key is the only
way to let that public route write into an accountant's data on their
behalf — which is exactly what your "viral loop" needs to work.

**Treat it like a password:**
- Add it to `backend/.env` locally and to your Render env vars — never to
  the frontend, never commit it.
- It's only ever used server-side in the two new `/api/public/*` routes,
  and only after the `client_id` in the URL is validated against a real row.

## 3. What each change does
- **`reconcile_routes.py`** — Purchase-register invoices are now filtered
  to the selected period's date range before matching, so un-reconciled
  invoices from other months stop getting mislabeled "missing_in_2b."
- **`batch_routes.py`** — ZIP batch uploads now check the accountant's
  credit balance per-file (not just once), and `retry_count` is written on
  failure instead of sitting unused in the schema.
- **`public_routes.py`** *(new)* — Real `/api/public-upload` and
  `/api/public/client/{id}` endpoints. Validates the portal link, checks
  the accountant's credits, re-enforces the 10MB/50MB limits server-side,
  queues background extraction, deducts credits from the accountant.
- **`CollaborationPortal.tsx`** — Calls the real endpoints above instead of
  a 2-second `setTimeout` that threw the files away. Also fixed the client
  name lookup, which was silently broken twice over (blocked by RLS, and
  querying a column — `name` — that doesn't exist; it's `client_name`).
- **`ClientsPage.tsx`** — Added the missing "copy portal link" button. The
  route existed but nothing in the app could generate the link.
- **`ScanPage.tsx`** — Save failures (duplicate invoice, network error,
  etc.) now surface a specific message per file instead of vanishing into
  `console.error`. Batch "Save All" no longer aborts the remaining 9 files
  when file 1 of 10 fails.
- **`main.py`** — Added a 10MB server-side cap on `/api/scan-invoice` so a
  stray huge upload can't hang the free Render instance.
- Deleted `frontend/src/lib/calculations.ts` — confirmed zero importers
  (KhataLens-era dead code).

## 4. Deliberately not done here (so it's not a surprise later)
- **Retry cap.** `retry_count` is now written, but nothing yet stops a file
  from being retried indefinitely. Small follow-up whenever the "Retry"
  button should respect it.
- **Notifying the accountant** when a client submits via the portal. Right
  now they'll only see new invoices next time they open that client in the
  app. An email/WhatsApp ping would close the loop — worth doing before you
  lean on the portal as your main growth channel (more on why in the
  market notes).
