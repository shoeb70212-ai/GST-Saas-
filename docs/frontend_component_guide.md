# Frontend Component & UI Guide

This document outlines the React/Vite architecture, state management, and the design system used in KhataLens.

## Core Stack
- **Framework:** React 19 + TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS v4 + Framer Motion
- **Icons:** Lucide React
- **State/Caching:** React Query (`@tanstack/react-query`)
- **Routing:** React Router v7

## Context Providers

### `ClientContext.tsx`
The most critical piece of state in the application. It stores the `activeClientId`.
- **Why it exists:** KhataLens is an accountant-first SaaS. An accountant logs in once but manages 50 different businesses.
- **Implementation:** Wraps the entire application. Every data-fetching hook and dashboard component reads `activeClientId` from this context to filter the data.
- **Fallback:** If `activeClientId` is null, the app displays a "No Client Selected" empty state.

## Key UI Components

### 1. `BankStatementsPage.tsx`
The entry point for the reconciliation workflow.
- **Upload Zone:** Uses `react-dropzone`. Restricts uploads to `.pdf` only.
- **Polling Logic:** Uses a `useEffect` interval to poll the backend every 5 seconds if any statement has a `status === 'processing'`.
- **Transactions Table:** An expandable row design (Framer Motion `AnimatePresence`) that allows viewing the extracted `bank_transactions` nested under each statement. Highlights rows with `needs_manual_review = true` in yellow.

### 2. `BankReconcilePage.tsx`
The control center for the Human-in-the-Loop AI orchestration.
- **Split-View Layout:** 
  - *Left Panel:* The unmatched Bank Transactions.
  - *Right Panel:* The matched/suggested Invoices (the output of the Tier 1 & Tier 2 engines).
- **Interactions:**
  - `Approve`: Triggers the `/api/reconcile/approve` endpoint, animating the row out of the view and showing a success toast.
  - `Reject`: Dismisses the suggestion, returning the bank transaction to an unmatched state.
- **History Tab:** Allows users to view previously approved matches and trigger an `undo` operation.

## Design System (Tailwind)
We use a custom, highly opinionated Tailwind configuration (`index.css` + `tailwind.config.ts`) tailored for a modern SaaS aesthetic.
- **Backgrounds:** `bg-bg-base`, `bg-bg-surface` (for cards), `bg-bg-sunken` (for hover states).
- **Text:** `text-text-primary`, `text-text-secondary`, `text-text-disabled`.
- **Accents:** `accent-subtle`, `accent-glow`.
- **Micro-animations:** All buttons and cards use `transition-all duration-300` for smooth hover states.

## Form Elements
We strictly avoid native browser alerts or messy raw inputs.
- All forms use standard Tailwind form plugins or custom highly-styled inputs with focus rings (`focus:ring-2 focus:ring-accent`).
- Toast notifications (`react-hot-toast`) are used for all success/error states instead of alerts.
