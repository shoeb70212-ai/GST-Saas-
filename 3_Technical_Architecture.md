# PayForce: Technical Architecture (InvoiceScanner AI)

This document defines the tech stack and system architecture for the Camera-First / PDF-Upload OCR Bridge.

## 1. System Overview
The goal of the system is to ingest unstructured invoice formats (messy JPEGs from mobile cameras or digital PDFs) and output perfectly structured, verifiable JSON data that can be exported to Excel.

## 2. The Tech Stack

### Frontend (The PWA App)
*   **Framework**: React 19 + Vite
*   **Styling**: Tailwind CSS + shadcn/ui
*   **Core Capabilities**:
    *   Responsive, Mobile-First UI (designed for field usage).
    *   HTML5 Camera API integration (`<input type="file" accept="image/*" capture="environment">`) for native mobile scanning.
    *   Drag-and-drop file uploader for desktop users (`react-dropzone`).
    *   In-browser spreadsheet UI for data verification and error correction.
    *   Client-side Excel/CSV generation (`xlsx` or `papaparse` libraries).

### Backend (The AI Extraction Engine)
*   **Framework**: FastAPI (Python 3.11)
*   **Extraction Layer**: 
    *   Because **accuracy and precision are the #1 priority**, we will use **OpenAI GPT-4o**.
    *   **Crucial Feature: Structured Outputs**. OpenAI recently released a feature that guarantees 100% adherence to a JSON schema. This means the AI is mathematically forced to return the exact fields we need (e.g., `gst_amount`, `invoice_date`) in the exact format, eliminating "hallucinations" or missing commas.
*   **API Endpoints**: 
    *   `POST /api/scan-invoice`: Accepts a multipart form file (`.jpg`, `.png`, or `.pdf`), sends it to GPT-4o with a strict JSON schema definition, and returns the mathematically-verified JSON payload.

### Database (Optional for V1)
*   For the V1 Proof of Concept, a database is not strictly necessary since the workflow is "Scan -> Verify -> Export to Excel" directly in browser memory. This guarantees user privacy and reduces initial infrastructure costs to $0 (excluding LLM API costs).
*   If persistence is needed in V2, we will use **Supabase (PostgreSQL)** to store historical scans and user profiles.

## 3. The Extraction Prompt (Vision LLM)
The core intelligence of the backend relies on this prompt instruction sent to the Vision model alongside the invoice image:
*"You are an expert Indian CA assistant. Extract the following fields from this invoice image: Supplier Name, GSTIN, Invoice Date, Invoice Number, Base Amount, and GST Amount. Return the data ONLY as a valid JSON object. Do not include markdown formatting or explanations."*
