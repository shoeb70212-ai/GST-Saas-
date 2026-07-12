# Architecture Decision Record: CRM Integrations

## Context
There was a proposal to build native integrations with popular cloud CRMs (e.g., Zoho, Salesforce, HubSpot) to automatically pull purchase invoices into KhataLens and push extracted data back. 

## Proposed Implementation (What could have been done)
If implemented, the architecture would have required:
1. **OAuth2 Authentication**: Securely storing access and refresh tokens per user in the database.
2. **Webhook Endpoints**: Setting up receiving routes so the CRM could push a notification when a new invoice is created.
3. **Automated Pipeline**: Triggering the AI extraction silently in the background and syncing the extracted data.
4. **Two-Way Sync**: Pushing the structured data (like HSN codes, Tax amounts) back into the CRM.

## Decision: REJECTED

We decided not to pursue this implementation. The complexities and edge cases far outweighed the benefits, and it contradicts the core target market of the product.

## Reasons for Rejection

### 1. Target Audience Mismatch (The Biggest Flaw)
The primary target audience for KhataLens is **Indian Chartered Accountants (CAs) and accountants**. 
- The vast majority of this demographic relies on **offline, desktop-based ERPs** like **Tally (ERP 9 / Prime)** or **Busy**.
- They rarely use cloud CRMs for purchase bill management. Building complex cloud webhooks would result in a feature with near-zero adoption among the actual user base.

### 2. The "Source of Truth" Nightmare
Establishing a direct connection creates a "Two Generals' Problem". If KhataLens extracts data, pushes it to the CRM, and the accountant manually edits it in the CRM later, KhataLens becomes outdated. Running GSTR-2B reconciliations on outdated data would cause failures. Solving this requires continuous two-way syncing, shifting the product from an "AI Extractor" to a "Middleware Sync Tool."

### 3. High Engineering Complexity & Edge Cases
Native integrations introduce massive stateful fragility into the system:
* **Webhook Dropping:** If the backend is under heavy load or restarting when a CRM fires a webhook, the invoice is permanently lost unless a complex polling fallback is built.
* **OAuth Token Decay:** Refresh tokens expire or get revoked. When background processes fail silently due to auth errors, users assume the core product is broken.
* **Duplicate Events:** If a user creates and immediately edits an invoice in their CRM, the CRM may fire multiple webhooks, leading to duplicate extractions, double-charging the user's credits, and polluting the database.
* **Rate Limits (DDoS Risk):** Bulk-importing historical data in the CRM would trigger thousands of simultaneous webhooks to KhataLens, potentially DDoSing the FastAPI server and exhausting OpenRouter/Gemini rate limits.

## Better Alternative
Instead of native integrations, the long-term solution is to build a public REST API or a **Zapier App**. This offloads OAuth, webhook retries, and error handling to Zapier, allowing KhataLens to remain focused on its core competency: highly accurate AI invoice extraction and GSTR-2B reconciliation.
