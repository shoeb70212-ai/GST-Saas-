# WhatsApp Bot Architecture Strategy

## Overview
KhataLens utilizes WhatsApp as a primary ingestion vector for AI OCR processing. A key architectural and product decision is whether to use a **Single Global WhatsApp Number** for the entire platform or to provision **Dedicated WhatsApp Numbers** for individual CA firms. 

This document outlines the workflows, technical requirements, routing logic, and business implications of both models.

---

## Model A: Single Global Number (Current Implementation)
In this model, all users (CAs) across the platform send their invoices to one central KhataLens WhatsApp Business number.

### 1. The Workflow (CA-Driven)
* The CA receives physical bills or PDFs from their clients on their personal phone or email.
* The CA selects an "Active Client" in their KhataLens web dashboard (e.g., ABC Hardware).
* The CA forwards the invoice from their phone to the KhataLens Bot.
* The bot processes it and saves it directly to the active client's ledger.
* **Result:** The CA acts as a mandatory middleman.

### 2. Technical Routing Logic
When a message hits the `/webhook`:
1. **Identification:** The system reads the `From` field (the sender's phone number).
2. **Lookup:** It queries the `profiles` table to find the CA associated with that phone number.
3. **Data Isolation:** It checks the CA's `active_whatsapp_client_id` and saves the extracted invoice specifically to that client workspace.
4. **Concurrency:** All messages are placed into a queue managed by an `asyncio.Semaphore`, ensuring the server doesn't crash if 50 CAs upload simultaneously.

### 3. Pros & Cons
* **Pros:** Extremely cheap to run. Zero setup complexity for the CA. Easy to manage one Meta Developer App.
* **Cons:** The CA still has to manually interact with every invoice before it gets into the system.

---

## Model B: Dedicated Numbers (Enterprise Future State)
In this model, large CA firms are assigned their own dedicated WhatsApp Business number (e.g., "Sharma & Associates Automation Bot").

### 1. The Workflow (Client-Driven & Zero-Touch)
* The CA provides the dedicated WhatsApp number directly to their clients (the business owners).
* The client (e.g., the owner of ABC Hardware) takes a photo of a purchase bill and sends it to the CA's Bot.
* The bot instantly acknowledges, extracts the data, and files it.
* **Result:** The CA does absolutely zero manual forwarding. The data appears in their dashboard magically.

### 2. Technical Routing Logic
To implement this, the backend routing architecture must fundamentally change:
1. **Identify the Firm:** The webhook reads the `To` field (the bot's number) to identify which CA firm owns this instance.
2. **Identify the End-Client:** The webhook reads the `From` field (the sender). The system queries a new `client_phone_numbers` table mapping `+91-99999-99999` to "ABC Hardware" (Client ID: 45) under CA Sharma.
3. **Auto-Routing:** The system skips the CA's "active client" setting entirely and forcefully routes the invoice into Client ID 45's ledger.
4. **Interactive Validation:** If the AI has low confidence, the bot can text the *client* back: *"Is the total amount ₹500?"* instead of bothering the CA.

### 3. Business & Monetization Advantages
* **White-Labeling:** CAs can put their firm's logo and name on the WhatsApp profile. This increases brand prestige.
* **High Upsell Potential:** This feature can be locked behind a "KhataLens Enterprise" plan (e.g., ₹4,999/month), dramatically increasing ARR.
* **Client Stickiness:** Once an end-client gets used to simply WhatsApping their bills to their CA's bot, they will never want to switch to a traditional CA.

### 4. Technical Trade-Offs & Costs
* **Cost Structure:** Meta charges monthly maintenance fees for WhatsApp API numbers, plus per-conversation fees for business-initiated messages. The Enterprise pricing must absorb these costs.
* **Onboarding Friction:** Provisioning a new API number requires Facebook Business Verification for the CA's firm, which introduces friction compared to standard SaaS signups. (This can be mitigated using a BSP Embedded Signup flow).

---

## Conclusion & Next Steps
The **Single Number** approach is the correct foundation to validate the core AI OCR technology and secure early adoption.

Once product-market fit is established with solo accountants, the **Dedicated Number (Client-Driven)** architecture should be prioritized as the primary catalyst for Enterprise-tier revenue growth and large-firm adoption.
