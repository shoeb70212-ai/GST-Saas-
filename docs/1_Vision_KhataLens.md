# KhataLens — Product Vision

## The Core Concept
**KhataLens** is an AI-powered automated workspace designed for Chartered Accountants (CAs) and Tax Professionals in India. 
Initially focused solely on GST Invoice Scanning, the product has evolved into a comprehensive **Zero-Hallucination Financial Orchestration Engine**. It solves the universal, time-consuming pain point of manual data entry, bank reconciliation, and document collection.

## The Problem
GST Accountants in India face three massive bottlenecks every month:
1. **Manual Invoice Data Entry**: Typing 30+ fields (GSTINs, Taxable amounts, CGST, SGST) from hundreds of physical or PDF invoices into Tally or Zoho.
2. **Document Chasing**: Begging clients for invoices and bank statements via WhatsApp, leading to fragmented, lost, or delayed data.
3. **Tedious Bank Reconciliation**: Manually matching thousands of bank statement rows to purchase invoices and sales receipts to file accurate returns.

## The Solution (KhataLens)
KhataLens acts as an automated, multi-tenant digital workspace for accountants. 
1. **Multi-Tenancy:** The accountant creates a "Workspace" for each of their clients with strict data isolation (Row-Level Security).
2. **Omnichannel Ingestion:** Clients can simply forward their invoices to a dedicated WhatsApp Bot, which automatically categorizes and routes them to the correct workspace.
3. **AI Scanning:** Google Gemini extracts all 37 critical GST fields natively in seconds from PDFs/Images.
4. **Zero-Hallucination Reconciliation:** A robust 2-Tier engine that first uses deterministic math (Tier 1 Exact Match) to instantly reconcile bank statements with invoices, and then uses AI (Tier 2 Fuzzy Match) for edge cases—always requiring a Human-in-the-Loop for final approval to guarantee 100% accounting accuracy.

## Key Differentiators
1. **"Zero Hallucination" Mandate:** We explicitly acknowledge that AI makes mistakes. By separating deterministic math from AI suggestions, and enforcing an "Approve / Reject / Undo" workflow, we give accountants complete trust in the data.
2. **Cost-Optimized AI:** Instead of letting users dynamically prompt the AI, we use strict structured outputs (`response_format` JSON) to extract a fixed schema, optimizing token usage.
3. **Accountant-First Architecture:** Built from day one with a Client Switcher, acknowledging that our true user is an accountant managing dozens of businesses, not a single business owner.

## Target Audience
- **Primary:** Mid-to-large CA Firms managing 50+ business clients.
- **Secondary:** Individual business owners (SMEs) with high invoice volume.
