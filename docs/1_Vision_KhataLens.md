# KhataLens — Product Vision

## The Pivot
This project originated as **KhataLens**, a legal enforcement and collections tool for MSMEs aimed at using GST laws (Rule 37, Section 34, MSMED Act) to force buyers to pay. 
However, after market evaluation, we pivoted to **KhataLens** — an AI-powered GST Invoice Scanner and Multi-Tenant Accountant Workspace. 
**Why?** Selling a "collections threat tool" to MSMEs is high-friction and niche. But selling "automated invoice data entry" to Accountants solves a universal, daily, time-consuming pain point that they are actively looking to pay for.

## The Problem
GST Accountants in India receive hundreds of physical or PDF purchase invoices from their clients every month. They must manually read these invoices and type 30+ fields (GSTINs, Taxable amounts, CGST, SGST, IGST, PO numbers, E-Way bills) into Tally or Zoho. This is slow, error-prone, and soul-crushing work.

## The Solution (KhataLens)
KhataLens acts as an automated, multi-tenant digital workspace for accountants. 
1. **Multi-Tenancy:** The accountant creates a "Workspace" for each of their clients.
2. **AI Scanning:** They upload the client's invoices (PDF/Image). Google Gemini 2.5 Flash extracts all 37 critical GST fields natively in seconds.
3. **Review & Export:** The accountant reviews the extracted data in a highly customizable UI, and with one click, exports it to Excel for immediate import into their accounting software.

## Key Differentiators
1. **Cost-Optimized AI:** Instead of letting users dynamically prompt the AI (which burns expensive tokens unpredictably), our AI extracts a massive, fixed list of 37 fields natively in one pass. The user customizes what they see purely on the frontend UI.
2. **Accountant-First Architecture:** Built from day one with Row-Level Security (RLS) and a Client Switcher, acknowledging that our true user is an accountant managing dozens of businesses, not a single business owner.

## What Was Parked
- Legal Dunning & MSMED Enforcement (moved out of scope due to target audience shift).
- Sunk GST Analytics (Still available as an optional widget, but no longer the core selling point).
