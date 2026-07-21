# 13. Monetization & SaaS Billing Architecture

## Overview
KhataLens monetizes via Prepaid SaaS Passes rather than traditional recurring subscriptions. This architectural decision was made specifically for the Indian B2B market, where RBI regulations around e-mandates on credit cards and UPI Autopay result in extremely high transaction failure rates and manual OTP interventions.

By utilizing **Razorpay Orders** for Prepaid Passes, we guarantee a near 99% checkout success rate.

**Gating model (current):** Features are **credits-only**. Virtual CFO, Tax Liability, GSTR-2B reconciliation, and client management stay available to authenticated users. AI-powered work (invoice scan, bank parse, deep match, public upload, etc.) spends org wallet credits — see `backend/credits.py`, `CREDITS_DOCUMENTATION.md`, and `PricingPage.tsx`. Hard route locks via `<ProGate>` were removed (`da96538`). Soft role gates may still apply to `/admin` (and similar) where product requires them; API enforcement remains authoritative.

---

## 1. Product Packs

Canonical amounts live in `backend/payment_routes.py` (`CREDIT_PACKS`) and the public Pricing page.

1. **Free / signup:** Org wallet seeded per signup/trigger policy (not a feature tier lock).
2. **Starter Pass (₹2,499):** Grants **1,000** AI credits.
3. **Pro Pass (₹7,999):** Grants **5,000** AI credits (volume bundle + priority support messaging — **not** a hard unlock for CFO/Tax tools).

Credit **costs per task** (1 / 2 / 5 base with scaling) are documented in `CREDITS_DOCUMENTATION.md` and implemented in `backend/credits.py`.

---

## 2. Infrastructure Flow

The Monetization engine spans the Database, the Python Backend, and the React Frontend.

### A. Frontend (`WalletPage.tsx`)
- **Checkout Process:** When a CA selects a Pass, the React frontend issues a `POST` request to the FastAPI `/api/create-order` endpoint.
- **Razorpay Integration:** It utilizes the `react-razorpay` library to inject the native checkout pop-up into the DOM, avoiding redirect drops.
- **Verification Trigger:** Upon a successful payment in the popup, the Razorpay SDK returns a `razorpay_payment_id` and cryptographic `razorpay_signature`. The frontend immediately POSTs these to the backend for verification.

### B. Backend (`payment_routes.py`)
- **Order Generation:** The backend authenticates via the `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to mint an official Order ID. Pack `amount` / `credits` come from server-side `CREDIT_PACKS` — never trust client-supplied totals.
- **Cryptographic Verification:** Upon checkout completion, the backend validates the `razorpay_signature` using `rzp_client.utility.verify_payment_signature`. This mathematically proves the payment wasn't spoofed by a malicious client.
- **Atomic Upgrades:** Once validated, fulfillment goes through idempotent RPCs (`fulfill_payment_order` / `upgrade_user_tier`).

### C. Database (`migration_phase37_monetization.sql` and later phases)
- **Idempotency Check:** Payment fulfillment strictly checks if the `payment_id` already exists in the `transactions` table. This guarantees that a user cannot be double-credited if network latency causes the frontend to retry the verification payload.
- **Ledger & Wallet Update:**
  1. An immutable record is inserted into `transactions` (Order ID, Payment ID, Amount, Credits).
  2. The **organization** wallet (`organizations.credits`) is incremented. Spend uses `decrement_credits`; failures use `refund_credits` (never negative decrement).

---

## 3. Feature access (credits-only)

There is **no** `<ProGate>` route wall for Virtual CFO or Tax Liability. Access is:

1. **Auth** — user must be signed in for protected app routes.
2. **Credits** — AI endpoints return **402** when the org wallet cannot cover the task cost (`decrement_credits` → `-1`).
3. **Optional soft role gates** — e.g. admin UI may hide or soft-gate by role; backend still enforces authorization.

Do not reintroduce hard Pro feature locks without product sign-off.
