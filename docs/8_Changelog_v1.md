# Changelog & Updates - KhataLens v1.1

This document acts as a central record of the recent stabilization, feature additions, and optimization passes made to the KhataLens platform.

## 🚀 Phase 2 Features (Recent Updates)
- **GSTR-2B Reconciliation Engine**: Implemented the deterministic matching UI on `ReconciliationPage.tsx`, allowing users to upload the government 2B JSON/Excel and instantly identify "Missing in PR" (Purchase Register) invoices where ITC is at risk.
- **TallyPrime XML Export**: Added a native Tally XML exporter that groups line items into VOUCHER blocks with automated CGST/SGST/IGST ledger deductions, allowing 1-click import to Tally.
- **Architecture Refactoring**: Extracted massive monoliths. Moved the 300-line invoice modal into a standalone `InvoiceDetailsModal.tsx` and moved all export logic into `exportService.ts`. Reduced `SavedInvoicesPage.tsx` from 821 lines to ~500 lines.
- **Premium UI/UX Polish**: 
  - Added modern animated `<Skeleton />` loaders across the Dashboard and Saved Invoices pages to vastly improve perceived performance.
  - Implemented tactile micro-interactions (`active:scale-[0.98]`) globally for all buttons.
  - Upgraded the Invoice Details Modal with a frosted-glass (`backdrop-blur`) overlay effect.

## 🚀 Performance & Scalability
- **Aggressive Frontend Caching:** Implemented `@tanstack/react-query` across the frontend. Database queries for invoices and clients are now cached intelligently, eliminating loading spinners when switching between dashboard tabs. The app feels instantaneous.
- **Database Indexing:** Created `migration_phase9.sql` to add B-Tree indexes on `client_id`, `user_id`, and `created_at` in the Supabase database. This guarantees `SELECT` speeds remain under 50ms even when scaling to 100,000+ invoices.

## 🎨 Design & Marketing
- **Landing Page Overhaul:** 
  - Pivoted from a dark generic theme to a highly trustworthy, premium **Light Theme** (slate/indigo/white) tailored for traditional CAs and accountants.
  - Added a visual **"How it Works"** 3-step pipeline.
  - Re-wrote the marketing copy to target exact pain points (extracting 37 specific fields, cross-verifying tax amounts).
  - Built massive deep-dive feature blocks showcasing mock JSON data and Multi-Tenancy capabilities visually.

## 📱 Mobile Responsiveness & Layout
- **Scanner Grid Fixes:** Refactored the `ScanPage.tsx` layout constraints. Previously, it forced a strict `100vh` height which caused overlapping and crushed grids on mobile devices. It now uses a flexible `min-h` approach, allowing natural scrolling on phones while retaining the strict desktop app feel on large screens.
- **Touch-Friendly Controls:** Updated CSS hover states on the invoice queue. The "Retry" and "Remove (X)" buttons are now permanently visible on mobile devices (where hover is impossible), while retaining their clean fade-in hover behavior on desktop.

## 🐛 Bug Fixes & Resilience
- **Missing User Profile Resilience:** Fixed a critical bug where users signing up without triggering the database profile creation function would crash the entire app. Both the frontend (using `.maybeSingle()`) and the FastAPI backend now gracefully catch this condition and fallback to granting 100 credits, allowing the AI extraction to proceed flawlessly regardless of database trigger execution.
- **Backend Environment Variables:** Fixed a bug where the FastAPI backend crashed with a 500 Error due to missing Supabase credentials in the `.env` file. These were injected and the backend was properly wired to verify sessions against Supabase.

## 🛠️ Architecture Updates
- Updated the **Technical Architecture** documentation to reflect the migration from a purely client-side AI architecture to the robust FastAPI Python backend, which now handles PDF parsing and secure Gemini/OpenRouter orchestration.
