# 13. Monetization & SaaS Billing Architecture

## Overview
KhataLens monetizes via Prepaid SaaS Passes rather than traditional recurring subscriptions. This architectural decision was made specifically for the Indian B2B market, where RBI regulations around e-mandates on credit cards and UPI Autopay result in extremely high transaction failure rates and manual OTP interventions.

By utilizing **Razorpay Orders** for Prepaid Passes, we guarantee a near 99% checkout success rate.

---

## 1. Product Tiers

1. **Free Tier:** Granted automatically upon signup via a Supabase Auth Trigger. Provides a baseline of 100 free AI Extractions.
2. **Starter Pass (₹999):** Grants 1,000 AI extractions. Upgrades the user's `tier` to `starter`.
3. **Pro Pass (₹2,499):** Grants 5,000 AI extractions. Upgrades the user's `tier` to `pro`, unlocking the Virtual CFO Dashboard and GSTR-2B Deep Match algorithms.

---

## 2. Infrastructure Flow

The Monetization engine spans the Database, the Python Backend, and the React Frontend.

### A. Frontend (`WalletPage.tsx`)
- **Checkout Process:** When a CA selects a Pass, the React frontend issues a `POST` request to the FastAPI `/api/create-order` endpoint.
- **Razorpay Integration:** It utilizes the `react-razorpay` library to inject the native checkout pop-up into the DOM, avoiding redirect drops.
- **Verification Trigger:** Upon a successful payment in the popup, the Razorpay SDK returns a `razorpay_payment_id` and cryptographic `razorpay_signature`. The frontend immediately POSTs these to the backend for verification.

### B. Backend (`payment_routes.py`)
- **Order Generation:** The backend authenticates via the `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to mint an official Order ID.
- **Cryptographic Verification:** Upon checkout completion, the backend validates the `razorpay_signature` using `rzp_client.utility.verify_payment_signature`. This mathematically proves the payment wasn't spoofed by a malicious client.
- **Atomic Upgrades:** Once validated, the backend fires the `upgrade_user_tier` Postgres RPC.

### C. Database (`migration_phase37_monetization.sql`)
- **Idempotency Check:** The RPC strictly checks if the `payment_id` already exists in the `transactions` table. This guarantees that a user cannot be double-credited if network latency causes the frontend to retry the verification payload.
- **Ledger & Profile Update:** 
  1. An immutable record is inserted into `transactions` (Order ID, Payment ID, Amount, Credits).
  2. The `profiles` table is atomically updated, incrementing the `credits` and upgrading the `tier` parameter.

---

## 3. Feature Gating (`ProGate.tsx`)
We do not just rely on backend API rejection for gated features. We implemented a Higher-Order Component (`<ProGate>`) in the React router. 
If a CA attempts to load the `/cfo` or `/tax-liability` URL directly, `<ProGate>` fetches their `profile.tier`. If `tier !== 'pro'`, the component halts the render and displays a beautifully designed "Pro Feature Locked" intercept page, providing a direct pipeline to the Wallet page for an upgrade.
