# Subplan 2.2: Global Rate Limiting (SRE/DevOps)

## 1. Problem Discovered
The `agency-sre-site-reliability-engineer` audited the API ingestion points. Users can upload invoices in bulk (up to 200 at a time per batch). Since each invoice triggers an AI OCR extraction pipeline (using OpenAI/Gemini), there was **no protection** against a malicious user or rogue script uploading 100,000 files in a loop.
This vector could be exploited for a "Denial of Wallet" attack, instantly running up thousands of dollars in API bills.

## 2. Solution & Changes Made
We implemented a strict, tamper-proof **Sliding Window Rate Limiter** directly inside the PostgreSQL database.

**Fixes Applied:**
1. **Trigger Function `enforce_invoice_rate_limit()`**: Created a function that counts how many invoices the current user has uploaded in the last 10 minutes (`WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '10 minutes'`).
2. **Hard Limits**: If the count exceeds 100, the database forcibly rejects the `INSERT` and throws a custom PostgreSQL Exception with Error Code `42900` (which translates to HTTP 429 Too Many Requests in PostgREST).
3. **Trigger Attachment**: Attached this function as a `BEFORE INSERT` trigger on the `invoices` table.

## 3. Files Modified
- **Created**: `migration_phase49_rate_limiting.sql` (Deploy via Supabase SQL Editor).

## 4. Why Database-Level?
Implementing rate limiting in the React frontend is easily bypassed. Implementing it in Supabase Edge Functions adds network hops. By embedding the limit directly inside the core database as a `BEFORE INSERT` trigger, it is mathematically impossible to bypass the limit, regardless of how the data is being inserted (REST API, GraphQL, direct SQL).

