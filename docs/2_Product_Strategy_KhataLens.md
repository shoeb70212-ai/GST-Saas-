# KhataLens — Product Strategy & Target Audience

## Target Audience
**Primary User:** GST Accountants, Chartered Accountants (CAs), and Tax Consultants in India managing 50+ clients.
**Secondary User:** Accounting firms or agencies processing large volumes of invoices and bank statements.

## Core Value Proposition
Time is money for an accountant. During GST filing season, data entry and bank reconciliation are the biggest bottlenecks. KhataLens cuts this time by 90% by instantly digitizing physical/PDF invoices and automatically matching them to bank statement rows using a "Zero Hallucination" hybrid AI engine.

## Pricing Strategy & Unit Economics
We have moved away from a pure pay-per-scan credit model to a recurring SaaS subscription model to ensure predictable MRR, while still protecting our unit economics (LLM costs).
1. **Starter Plan (₹999/mo):** Aimed at small freelancers. Includes 500 scans/month and basic reconciliation.
2. **Pro Plan (₹2,499/mo):** Aimed at mid-sized firms. Includes 2,500 scans/month, advanced AI fuzzy matching, and WhatsApp integration.
3. **CA Firm / Enterprise (Custom):** For large agencies requiring unlimited workspaces and massive volume processing.

*Cost Analysis*: We strictly utilize `gemini-2.5-flash` with structured JSON outputs. Our backend limits token payloads by processing PDF pages smartly (avoiding massive unstructured text dumps) to keep our internal cost per scan under ₹0.10.

## Go-To-Market Strategy
1. **WhatsApp Ingestion Hook:** CAs constantly complain about chasing clients for documents. By offering a dedicated WhatsApp Bot number where their clients can simply forward PDFs, we solve a massive operational headache *before* the CA even opens our app. This is our primary marketing hook.
2. **Beta Testing:** Onboard a small group of 5-10 accountants. Give them a Pro Plan trial. 
3. **Trust Building:** Emphasize the "Approve/Reject" UI. Accountants do not trust AI blindly. Positioning KhataLens as an "AI Assistant that explicitly asks for permission" rather than a "black-box automation tool" is critical to adoption.

## Strategic Decisions & Trade-offs

### Why We Avoided Advanced Tally Integration (For Now)
Tally integrations are notoriously complex, highly version-dependent, and prone to breaking. 
**Our Strategy:** Stick to what we do best — AI extraction and data structuring. We provide a highly customizable Excel (.xlsx) export. Accountants are Excel power users; they can easily map our Excel export to their existing import tools.

### Why We Enforce a "Human-in-the-Loop" for Reconciliation
We discussed building an auto-reconcile feature that posts matches directly to the ledger without human intervention.
**Our Strategy:** We abandoned this because a single hallucinated match during tax season can cause severe compliance issues (GSTR mismatches). Instead, we enforce a strict 2-Tier workflow: Tier 1 (Deterministic Math) and Tier 2 (Fuzzy AI). Both tiers deposit matches into a `SUGGESTED` state. The accountant must explicitly click "Approve" in the UI. This protects us from liability and gives the user ultimate control.
