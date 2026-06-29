# Invoice Extraction & UI Updates Documentation

## Overview
This document outlines the recent enhancements made to the "PayForce AI" invoice extraction platform. The updates focused on improving extraction accuracy, expanding captured data points, optimizing the user interface for large datasets, and adding fault tolerance.

## 1. Retry Functionality
- **Feature**: Added a "Retry" mechanism for failed invoice extractions.
- **Implementation**: If an invoice fails to process (e.g., due to backend connection issues or OCR failures), a "Retry" button (refresh icon) appears on the row. Clicking this resets the error state and re-triggers the API call to the backend.

## 2. Expanded Data Extraction Fields
The AI extraction model (in `backend/main.py`) was significantly expanded to extract 37 distinct data points from invoices, up from the original 17. The new fields include:
- **Addresses & Contact Info**: `Supplier_Address`, `Supplier_Phone`, `Supplier_Email`, `Buyer_Address`, `Buyer_PIN`
- **Tax & Business Identifiers**: `Supplier_PAN`, `Buyer_PAN`, `Place_Of_Supply`
- **Bank & Payment Details**: `Account_Holder`, `Account_Number`, `Bank_Name`, `Branch_Name`, `IFSC_Code`, `UPI_ID`
- **Extended Invoice Details**: `Due_Date`, `Amount_In_Words`, `Received_Amount`, `Balance_Amount`, `Previous_Balance`, `Current_Balance`

## 3. Database Schema Update
- The `supabase_schema.sql` was updated to include all newly introduced fields.
- New columns were added to the `invoices` table to ensure that when a user clicks "Save to Cloud", all 37 fields (including Bank Details and Addresses) are securely saved to the database.

## 4. UI/UX Layout Improvements
- **Issue**: Expanding the table to 37 columns caused excessive horizontal scrolling.
- **Solution**: 
  - The default grid view (`DEFAULT_COLUMNS`) was reduced to show only the most critical information: `Confidence_Score`, `Supplier_Name`, `Invoice_Date`, `Invoice_Number`, `Total_Amount`, and `GST_Amount`.
  - An **Expandable Details Panel** was introduced. Every row now has a Chevron icon. When clicked, the row expands to show a categorized, grid-based layout containing:
    - Supplier Info
    - Buyer Info
    - Bank Details
    - Other Details
    - Line Items Table
- This allows users to drill down into specific invoice details on demand without cluttering the main view.

## 5. Development Server Resilience
- Identified and resolved issues related to the backend FastAPI server not running, which previously caused "Connection Refused" errors.
- Handled UI rendering edge cases (e.g., fixing JSX parsing errors when toggling the expandable panels).
