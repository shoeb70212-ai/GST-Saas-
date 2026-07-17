# KhataLens Dynamic Credit System

## 1. Overview
The KhataLens platform uses a pre-paid, usage-based credit wallet to manage AI processing costs. Instead of flat subscriptions, users purchase "Wallet Passes" (e.g., Starter Pass, Pro Pass) which grant them a fixed number of AI credits. These credits are deducted in real-time as users perform AI-intensive actions across the platform.

The system is designed to be **dynamic**—different tasks consume varying amounts of computational resources and LLM tokens. Therefore, the credit deduction scales proportionally with the complexity and volume of the task.

## 2. Core Credit Costs

| Task | Base Credit Cost | Scaling Factor | Endpoint / Service |
| :--- | :--- | :--- | :--- |
| **Invoice Scan (Web)** | 1 Credit | 1 per document | `backend/main.py` |
| **Invoice Scan (WhatsApp)**| 1 Credit | 1 per receipt/image | `backend/whatsapp_service.py` |
| **Batch Invoice Upload** | 1 Credit | 1 per document inside the zip | `backend/batch_routes.py` |
| **Bank Statement Scan** | 2 Credits | +2 Credits per 5 pages (PDF) or 50 rows (Excel) | `backend/bank_routes.py` |
| **AI Deep Match (Recon)** | 5 Credits | +5 Credits per 20 items cross-referenced | `backend/reconcile_routes.py` |

## 3. Backend Logic & Architecture

The credit deduction logic is enforced strictly at the database level using a Postgres RPC function (`decrement_credits`).

### 3.1. The `decrement_credits` RPC Function
Located in Supabase (`migration_phase41_usage_audit.sql`), this function acts as an atomic lock. It performs the following in a single database transaction:
1. Locates the active organization for the requesting user.
2. Checks if `credits >= amount`.
3. If true, subtracts the `amount` and returns the new `current_credits`.
4. If false, it gracefully returns `-1`.
5. Logs the transaction automatically into the `credit_usage_logs` table (including `tokens_used` and `file_name`).

### 3.2. Strict 402 Error Enforcement
If `decrement_credits` returns `-1`, the FastAPI backend **immediately** halts execution and throws an `HTTPException(status_code=402, detail="Insufficient credits")`.
This prevents the backend from making expensive calls to OpenRouter/Gemini APIs when the user's wallet is empty. 

#### Example (`main.py` snippet)
```python
rpc_resp = await http_client.post(
    f"{SUPABASE_URL}/rest/v1/rpc/decrement_credits",
    json={"user_id_param": user_id, "amount": 1, ...}
)

if rpc_resp.json() == -1:
    raise HTTPException(status_code=402, detail="Insufficient credits. Please recharge your wallet.")
```

### 3.3. Volume-Based Scaling Logic
Certain tasks, like Bank Statements and Deep Matching, are not fixed cost. The backend dynamically calculates the `cost` variable before requesting the deduction.

- **Bank Statements:** Evaluates the number of pages (for PDFs) or the total row count (for CSV/Excel).
  `cost = max(2, math.ceil(len(pdf_pages) / 5) * 2)`
- **AI Deep Match:** Evaluates the sum of missing GSTR-2B entries + unmatched Purchase Register entries.
  `cost = max(5, math.ceil(total_items / 20) * 5)`

### 3.4. Upfront vs Post Deduction
- **Upfront Check (Batch/Bank):** Because a user might upload a 500-page bank statement or a zip file of 10,000 invoices, `batch_routes.py` and `bank_routes.py` calculate the total cost and run `decrement_credits` *before* the background task starts. If insufficient, it fails immediately.
- **Post Deduction (Single Invoices):** For a standard 1-credit invoice scan, the AI extraction runs, and the credit is deducted immediately upon completion. If the user hits 0 credits, the *next* upload will be blocked.

## 4. Frontend Integration

### 4.1. Pricing Page (`/pricing`)
The `PricingPage.tsx` component serves as the public-facing documentation for the credit system. It clearly maps out the costs described in Section 2, ensuring users understand exactly what they are paying for before they recharge.

### 4.2. Wallet Dashboard (`/wallet`)
The Wallet page allows authenticated users to:
1. View their live, available credit balance.
2. See their `credit_usage_logs` and `transactions` (recharges).
3. Purchase new "Passes" (Starter Pass / Pro Pass) using the Razorpay integration. 

If a user hits a 402 error anywhere in the app, they are gently prompted to navigate to the Wallet page to top up their account.
