# Comprehensive Code Review: GST SaaS Project

I've analyzed the key backend files (`main.py`, `utils.py`, `admin_routes.py`, `payment_routes.py`, `whatsapp_routes.py`, `whatsapp_service.py`, `bank_routes.py`, `bank_service.py`, `gstin_service.py`, `public_routes.py`, `batch_routes.py`, `reconcile_routes.py`) and frontend files (`App.tsx`, `supabase.ts`). Below is a categorized report of all issues, bugs, logic gaps, and optimization opportunities.

---

## 🔴 CRITICAL BUGS (Will cause runtime failures)

### 1. `public_routes.py` — Tuple Unpacking Bug (Line 37)
```python
data_dict = await run_ai_extraction(content, mime_type, tally_ledgers)
```
`run_ai_extraction` returns a **tuple** `(data_dict, tokens)`. This line assigns the entire tuple to `data_dict`, so every subsequent `data_dict.get(...)` call will fail with `AttributeError: 'tuple' object has no attribute 'get'`. Compare with `batch_routes.py` line 51 which correctly does `data_dict, tokens = await run_ai_extraction(...)`.

### 2. `public_routes.py` — Missing `amount` in `decrement_credits` RPC (Line 50)
```python
json={"user_id_param": user_id}
```
The `decrement_credits` RPC requires `amount`, `task_type_param`, `file_name_param`, and `tokens_used_param` (as seen in `main.py` line 441-447). This call is missing all of them, so the RPC will fail or error.

### 3. `public_routes.py` — `process_public_worker` exception handler references undefined `supabase_client` (Line 86)
In the `except` block (line 84-86), `supabase_client` is only defined inside the `try` block (line 32). If `get_admin_client()` itself fails, the except block will raise `NameError: name 'supabase_client' is not defined`.

### 4. `batch_routes.py` — Credit Deduction Race Condition (Lines 145-166)
The batch upload does a **non-atomic pre-check** (`current_credits < cost`) then deducts via RPC. Between the check and deduction, concurrent requests can double-spend credits. The comment in `bank_routes.py` line 132 explicitly says this pattern was removed to fix race conditions, but `batch_routes.py` still uses it. Additionally, the RPC return value of `-1` (insufficient credits) is **never checked** here.

### 5. `bank_service.py` — Double Credit Deduction (Lines 158 + 271)
In `bank_routes.py`, credits are deducted upfront (line 158). Then in `bank_service.py` line 271, `decrement_credits` is called **again** with `amount=0` "to log tokens". While `amount=0` means no double deduction of credits, the RPC name is misleading and if the RPC logic ever changes to enforce minimum amount=1, this breaks. More importantly, if the background task **fails** (line 279-282), the upfront credits are **never refunded**.

### 6. `main.py` — `sc` variable scope leak in duplicate detection (Lines 418-434)
`sc` (supabase client) is created inside the `if gstin:` block (line 419) but used in the duplicate detection block (line 430). If `gstin` exists but `create_async_client` fails, `sc` may be undefined or stale. Also, `sc` is created with `SUPABASE_ANON_KEY` but never authenticated with the user's token for RLS — the `.postgrest.auth(token)` call on line 420 may not work as expected with the async client constructor.

### 7. `reconcile_routes.py` — `deep_match_reconcile` credit deduction doesn't check `-1` properly (Lines 328-340)
```python
if rpc_resp.status_code != 200:
    raise HTTPException(...)
try:
    if rpc_resp.json() == -1:
        raise HTTPException(status_code=402, ...)
except ValueError:
    pass
```
If the RPC returns `200` with body `-1` (insufficient credits), the `ValueError` except catches the case where `.json()` fails, but if `.json()` succeeds and returns `-1`, it raises 402. However, if the RPC returns a JSON object `{"success": false}` instead of raw `-1`, the check `== -1` silently passes and credits may have been deducted. The return format is inconsistent with `payment_routes.py` which checks `result.get("success")`.

### 8. `whatsapp_service.py` — Credits checked from `profiles` but deducted from organization (Lines 111-118 vs 289)
The WhatsApp service checks `credits` from the `profiles` table (line 111), but the `decrement_credits` RPC deducts from the **organization** (as seen in `main.py` lines 287-300 which fetches from `organizations`). This is a logic gap — the pre-check may pass while the org has no credits, or vice versa.

---

## 🟠 SECURITY ISSUES

### 9. `main.py` — Service Role Key used as apikey in webhook fulfillment (`payment_routes.py` lines 160-161)
```python
headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}", ...}
```
The service role key is sent as both `apikey` and `Authorization`. This is correct for server-side RPC, but if any logging middleware captures headers, the service key leaks. Ensure no request logging captures these headers.

### 10. `whatsapp_service.py` — Uses Service Role Key for all operations (Line 99-100)
```python
SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
```
This **bypasses RLS entirely** for all WhatsApp background operations. While necessary for background tasks, there's no audit trail linking the action to a user session. Also, the fallback to `SUPABASE_ANON_KEY` if service key is missing means in dev mode, RLS may block operations silently.

### 11. `admin_routes.py` — `is_super_admin` column read via user JWT (Lines 42-43)
The admin check reads `is_super_admin` from `profiles` using the user's JWT (RLS applies). If RLS policies on `profiles` allow users to **update** their own `is_super_admin` field, this is a privilege escalation. Need to verify RLS prevents self-elevation.

### 12. `main.py` — No rate limiting on `/api/scan-invoice` (Line 234)
The endpoint deducts credits atomically, but there's no IP-based or user-based rate limiting. A compromised token can flood the endpoint, consuming AI API quota (OpenAI/OpenRouter) even if credits run out — each failed request still costs AI tokens before the credit check.

### 13. `public_routes.py` — No authentication on public upload (Line 98)
The `/api/public/upload` endpoint has no auth, no rate limiting, and no `client_id` ownership validation against a session. Anyone with a `client_id` (UUID, but enumerable) can upload unlimited files, each triggering AI extraction (costing the org money). This is an **abuse vector**.

### 14. `reconcile_routes.py` — No client ownership verification (Lines 41-62)
The reconcile endpoint accepts `client_id` but never verifies that the `client_id` belongs to the authenticated `user_id`. A user can reconcile against any client's data if they know the UUID.

### 15. `bank_routes.py` — `get_user_from_token` doesn't use RLS-enforced client (Lines 21-29)
This helper uses raw `httpx` with the anon key, bypassing the RLS-enforced `get_user_supabase_client` pattern used elsewhere. While the result is just `user_id`, it's inconsistent with the security pattern in `utils.py`.

### 16. CORS allows `allow_headers=["*"]` (`main.py` line 147)
While origins are whitelisted, allowing all headers is overly permissive. Restrict to `Authorization`, `Content-Type`, `X-Requested-With`.

### 17. `gstin_service.py` — API key in URL query parameter (Line 45)
```python
resp = await client.get(f"{GSTIN_API_URL}?gstNo={gstin}&key={GSTIN_API_KEY}")
```
The API key is in the URL, which may be logged by proxies, load balancers, or httpx middleware. Prefer header-based auth if the API supports it.

---

## 🟡 LOGIC GAPS & CORRECTNESS ISSUES

### 18. `main.py` — `compute_confidence` penalizes missing GSTIN twice (Lines 38-43)
If `Supplier_GSTIN` is missing, it adds 15 penalty. If present but invalid format, 25 penalty. But `apply_tax_calculations` (line 89) checks GSTIN state codes — if GSTIN is missing, `is_interstate` defaults to `False`, meaning CGST+SGST is applied. This may be incorrect for interstate invoices where GSTIN wasn't extracted.

### 19. `main.py` — `apply_tax_calculations` doesn't validate GSTIN format before state code comparison (Line 89)
```python
if sup_gstin and buy_gstin and len(sup_gstin) >= 2 and len(buy_gstin) >= 2:
```
This only checks length >= 2, not valid GSTIN format. A malformed 2-char string like "AB" would pass and be treated as a valid state code.

### 20. `bank_service.py` — Math verification breaks on first transaction (Lines 235-236)
```python
if b is not None and previous_balance is not None:
```
The very first transaction has `previous_balance = None`, so math verification is skipped. If the opening balance is wrong, all subsequent balances will be flagged as errors even though they're correct relative to the (wrong) opening balance.

### 21. `reconcile_routes.py` — `clean_str` regex strips leading zeros aggressively (Line 39)
```python
return re.sub(r'(\D)0+(\d)', r'\1\2', s)
```
This transforms "INV-0123" → "INV123" but also "2023-01-05" → "202315" (if called on dates). While it's intended for invoice numbers, the function is generic and could corrupt date strings if misused.

### 22. `whatsapp_service.py` — Pending file session not cleaned up on success path (Line 156)
When password authentication succeeds, the pending file is deleted (line 156). But if `download_whatsapp_media` fails (line 151) before deletion, the pending record remains with stale `media_id` that may have expired from Meta's CDN (Meta media URLs expire after ~24h).

### 23. `bank_routes.py` — Signed URL stored in DB expires in 1 hour (Lines 150-153)
```python
signed_url_resp = await sc.storage.from_("invoices").create_signed_url(file_path, 3600)
```
The signed URL is valid for only 1 hour, but it's stored permanently in `file_url`. After 1 hour, the link is dead. Either generate signed URLs on-demand when fetching, or store the storage path and generate URLs dynamically.

### 24. `payment_routes.py` — Webhook doesn't verify `amount_paid` matches `expected_amount` (Lines 140-168)
The webhook receives `amount_paid` from Razorpay and passes it to `fulfill_payment_order`, but there's no server-side check that `amount_paid` matches the `expected_amount` stored in `payment_orders`. If the RPC doesn't validate this, a user could pay less and still get full credits.

### 25. `main.py` — `run_ai_extraction` fallback to Gemini doesn't retry (Lines 520-546)
The `@retry` decorator wraps the entire function. If the primary AI fails 3 times, the function falls through to Gemini. But if Gemini also fails, there's no retry for Gemini. The retry decorator only retries the primary path.

---

## 🔵 PERFORMANCE & OPTIMIZATION

### 26. `main.py` — New `httpx.AsyncClient` created per request (Lines 263, 437)
Every scan-invoice call creates 2+ `httpx.AsyncClient` instances. These should be reused via a module-level client or `app.state` for connection pooling.

### 27. `admin_routes.py` — `get_all_tenants` fetches ALL profiles (Line 119)
```python
profiles_resp = await admin_client.table("profiles").select("*").execute()
```
No pagination. As the user base grows, this loads every profile into memory. Should use pagination (`range` header) or limit.

### 28. `admin_routes.py` — `get_all_tenants` fetches ALL clients (Line 155)
Same issue — loads all clients into memory to build `clients_map`. Should be a SQL `GROUP BY` query with `count()`.

### 29. `reconcile_routes.py` — Entire Excel file parsed twice (Lines 67-75)
```python
df_full = pd.read_excel(io.BytesIO(content), sheet_name='B2B', header=None, engine='openpyxl')
# ... find header_idx ...
df = pd.read_excel(io.BytesIO(content), sheet_name='B2B', header=header_idx, engine='openpyxl')
```
The file is read from bytes twice. Parse once, then reassign headers in-memory.

### 30. `bank_service.py` — Status update DB call per chunk (Lines 152, 157, 183, 192)
Every chunk (10 pages or 50 rows) triggers a `SELECT status` and an `UPDATE status` DB call. For a 100-page statement, that's 20+ DB round-trips just for status. Consider updating status every N chunks or using Supabase Realtime.

### 31. `whatsapp_service.py` — `print()` used instead of `logger` (Lines 51, 235, 313)
Multiple `print()` statements instead of structured logging. These won't be captured by log aggregation and can't be filtered by log level.

### 32. `bank_service.py` — `print()` debug statements throughout (Lines 131, 171, 179, 198, 201, 204, 207)
Same issue — debug `print()` statements should be `logger.debug()`.

### 33. `main.py` — Global semaphore created lazily (Lines 399-401)
```python
global _file_processing_semaphore
if '_file_processing_semaphore' not in globals() or _file_processing_semaphore is None:
```
Using `globals()` is fragile. Initialize the semaphore at module load or via `app.state` on startup.

### 34. `reconcile_routes.py` — `deep_match_reconcile` sends entire `b2b_subset` in every chunk prompt (Line 371)
```python
GSTR-2B Records:
{json.dumps(b2b_subset)}
```
Each chunk of 50 PR invoices includes the **full** B2B records list. If there are 1000 B2B records and 10 chunks, the B2B data is sent 10 times, wasting tokens. Should filter B2B records to relevant GSTINs per chunk.

---

## 🟢 CODE QUALITY & MAINTAINABILITY

### 35. Duplicated AI client initialization (`main.py` lines 150-177 and `bank_service.py` lines 20-31)
The OpenAI/OpenRouter client setup is duplicated. Extract to a shared `ai_client.py` module.

### 36. Duplicated auth verification pattern
`main.py` (lines 257-272), `payment_routes.py` (`_verify_user`), `bank_routes.py` (`get_user_from_token`), `reconcile_routes.py` (lines 49-62), `batch_routes.py` (lines 117-133), and `admin_routes.py` (`verify_super_admin`) all implement JWT verification differently. Some use `httpx`, some use `create_async_client`, some use `get_user_supabase_client`. Consolidate into `utils.get_current_user` (which already exists but is underused).

### 37. `whatsapp_service.py` — Circular import workaround (Line 238)
```python
from main import run_ai_extraction
```
Importing from `main` inside a function creates a circular dependency. Extract `run_ai_extraction` to a separate `ai_service.py` module.

### 38. `bank_service.py` — `extract_bank_statement_chunk` returns tuple but signature says `BankStatementExtract` (Line 60)
```python
async def extract_bank_statement_chunk(...) -> BankStatementExtract:
    ...
    return BankStatementExtract(...), tokens
```
The return type annotation says `BankStatementExtract` but it returns a tuple `(BankStatementExtract, tokens)`. The annotation is wrong.

### 39. `reconcile_routes.py` — `import` statements inside functions (Lines 37, 278, 346-349)
Multiple imports inside function bodies (`import re`, `import httpx`, `import os`, `import math`, `import json`). Move to module top.

### 40. `App.tsx` — Duplicate route path "/" (Lines 98 and 115)
```tsx
<Route path="/" element={<LandingPage />} />
...
<Route path="/" element={<ProtectedRoute session={session}><Layout /></ProtectedRoute>}>
```
Two routes match `/`. React Router v6 uses the most specific match, so `/` matches the first (LandingPage). The protected Layout routes work because they have child paths. But this is confusing and fragile — use a layout route without a path or use index routing.

### 41. `supabase.ts` — Placeholder client in dev mode (Lines 16-17)
```ts
supabaseUrl || 'https://placeholder.supabase.co'
```
If env vars are missing in dev, a client is created with a placeholder URL. Any auth calls will hang or fail with confusing CORS errors instead of a clear "configuration missing" message.

---

## 📋 SUMMARY TABLE

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | 🔴 Critical | public_routes.py:37 | Tuple unpacking bug — `data_dict` gets tuple |
| 2 | 🔴 Critical | public_routes.py:50 | Missing params in `decrement_credits` RPC |
| 3 | 🔴 Critical | public_routes.py:86 | `supabase_client` undefined in except block |
| 4 | 🔴 Critical | batch_routes.py:145 | Non-atomic credit check + missing `-1` handling |
| 5 | 🔴 Critical | bank_service.py:271 | No refund on background task failure |
| 6 | 🔴 Critical | main.py:418 | `sc` scope leak in duplicate detection |
| 7 | 🔴 Critical | reconcile_routes.py:328 | Inconsistent credit deduction return check |
| 8 | 🔴 Critical | whatsapp_service.py:111 | Credits checked from wrong table |
| 9-17 | 🟠 Security | Multiple | RLS bypass, no rate limiting, key in URL, etc. |
| 18-25 | 🟡 Logic | Multiple | Tax calc, math verification, signed URL expiry, etc. |
| 26-34 | 🔵 Performance | Multiple | HTTP client reuse, pagination, DB round-trips |
| 35-41 | 🟢 Quality | Multiple | Duplication, circular imports, wrong annotations |

---

## RECOMMENDED FIX PRIORITY

1. **Fix `public_routes.py` tuple bug (#1)** — this is a live runtime crash
2. **Fix `batch_routes.py` race condition (#4)** — credit double-spend
3. **Add client ownership checks to `reconcile_routes.py` (#14)** — data leak
4. **Add rate limiting to public upload (#13)** — abuse prevention
5. **Fix `bank_service.py` refund logic (#5)** — user trust
6. **Consolidate auth into `utils.get_current_user` (#36)** — maintainability
7. **Extract `run_ai_extraction` to `ai_service.py` (#37)** — breaks circular dep
8. **Fix signed URL expiry (#23)** — broken file links after 1 hour

---

Would you like me to switch to **Act mode** to start fixing these issues? I'd recommend starting with the critical bugs (#1-#8) first. Please **toggle to Act mode** and I'll begin implementing the fixes.