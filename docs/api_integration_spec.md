# API Integration Specification

This document details the core FastAPI backend routes used by the React frontend for the Bank Reconciliation and WhatsApp ingestion workflows.

## Base URL
Local: `http://localhost:8000`
Production: `https://your-backend.onrender.com`

All endpoints (except Webhooks) require a Supabase JWT Bearer token in the `Authorization` header.

## 1. Bank Statements API

### `POST /api/bank-statements/upload`
Uploads a PDF bank statement for processing.
- **Request:** `multipart/form-data`
  - `file`: The PDF file.
  - `client_id`: UUID of the client.
- **Response:**
  ```json
  {
    "status": "success",
    "message": "Statement upload started.",
    "data": { "statement_id": "uuid" }
  }
  ```
- **Behavior:** This kicks off the background PyMuPDF extraction process. The statement status is initially set to `processing`.

### `GET /api/bank-statements/list/{client_id}`
Retrieves all statements for a client.
- **Response:** Array of statement objects with their current `status`.

### `GET /api/bank-statements/{statement_id}/transactions`
Retrieves all parsed line items (bank transactions) for a specific statement.

## 2. Reconciliation Engine API

### `POST /api/reconcile/run`
Triggers the Hybrid Reconciliation Engine (Tier 1 Math + Tier 2 AI).
- **Request Body:**
  ```json
  { "client_id": "uuid" }
  ```
- **Behavior:** Finds unmatched invoices and bank transactions. Generates `SUGGESTED` matches.

### `GET /api/reconcile/suggestions/{client_id}`
Fetches the current list of pending `SUGGESTED` matches to display in the UI.

### `POST /api/reconcile/approve`
Approves a pending match, updating the actual ledger.
- **Request Body:**
  ```json
  { "suggestion_id": "uuid", "client_id": "uuid" }
  ```
- **Behavior:** Executes the `approve_reconciliation_match` RPC on Supabase.

### `POST /api/reconcile/undo`
Reverses a previously approved match.
- **Request Body:**
  ```json
  { "suggestion_id": "uuid", "client_id": "uuid" }
  ```
- **Behavior:** Executes the `undo_reconciliation_match` RPC on Supabase.

## 3. WhatsApp Webhook API

### `GET /api/whatsapp/webhook`
Used by the WhatsApp Cloud API to verify the webhook endpoint.
- **Query Params:** `hub.mode`, `hub.challenge`, `hub.verify_token`
- **Response:** Returns the raw `hub.challenge` integer if the token matches.

### `POST /api/whatsapp/webhook`
Receives incoming messages and PDF attachments from clients.
- **Request Body:** Standard WhatsApp JSON payload containing `messages[0].document`.
- **Behavior:** 
  1. Identifies the sender's phone number.
  2. Looks up the associated `client_id` in the database.
  3. Downloads the PDF media.
  4. Automatically routes the PDF to the invoice scanning pipeline or bank statement pipeline based on a quick AI heuristic check.
