# KhataLens — Collaboration Workflow Specification

## The "Viral Loop" Concept
The most successful B2B SaaS products grow through **Network Effects**. If a software requires multiple stakeholders to use it to work properly, every user becomes a free salesperson.
By creating a "Business Owner -> Accountant" data handoff pipeline, an Accountant who signs up for KhataLens will organically invite all their business clients to use the app, driving user acquisition costs to zero.

---

## 👥 The Two Roles

### 1. The Business Owner (Direct User)
*   **Context:** Runs a shop, factory, or agency. Receives physical bills daily. Usually stuffs them in a drawer and hands them to the accountant at the end of the month, or sends blurry photos on WhatsApp.
*   **App Experience:** Uses the KhataLens mobile web app. 
*   **Action:** Scans the invoice with their phone camera. The AI extracts the data. 
*   **Handoff:** They click a button: **"Send to Accountant"**. 

### 2. The Accountant
*   **Context:** Sits at a desk processing data for 50+ clients.
*   **App Experience:** Uses the KhataLens desktop dashboard.
*   **Action:** Opens the "Client Inbox" for a specific business. Sees a queue of digitized invoices sent by the Business Owner.
*   **Handoff:** Verifies the AI data, makes any small corrections, and clicks **"Approve & Export"** (to Tally/Zoho).

---

## 🏗️ Technical Architecture Required (Future Implementation)

To build this connection, we need to modify the Supabase schema to link multiple users to a single "Client Workspace".

### 1. Database Schema Changes
Currently, a `client` belongs only to the user who created it (`user_id`). We need to introduce an **Access Control List (ACL)** or **Workspace Members** table.

```sql
-- New Table: workspace_members
CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'accountant')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, user_id)
);
```
*Logic:* A Business Owner signs up, creates a Client profile (Role: `owner`). They enter their Accountant's email. The system creates a `workspace_members` record (Role: `accountant`) linked to that email.

### 2. Row Level Security (RLS) Updates
We must update the `invoices` table RLS policy so that *both* the Business Owner and the Accountant can see the same invoices.
```sql
CREATE POLICY "Users can access invoices they are members of" ON invoices
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM workspace_members 
    WHERE workspace_members.client_id = invoices.client_id 
    AND workspace_members.user_id = auth.uid()
  )
);
```

### 3. Invoice Status Lifecycle
We must add a new `workflow_status` column to the `invoices` table to track where the invoice is in the pipeline:
1. `scanned`: Business owner scanned it, but hasn't sent it.
2. `pending_review`: Business owner clicked "Send to Accountant". It appears in the Accountant's inbox.
3. `approved`: Accountant verified the data.
4. `exported`: Accountant exported it to Tally.

### 4. Monetization (Who pays?)
This model allows for dual-monetization:
1. **Accountant Pays:** The accountant buys a massive "Scan Bundle" and distributes credits to their clients so the clients can scan for free.
2. **Business Owner Pays:** The app is free for accountants, but business owners must buy credits to use the scanner to send data to their accountant. 
*(Recommendation: Go with #1. Accountants understand the ROI of saving time and have the budget).*
