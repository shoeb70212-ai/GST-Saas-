# PayForce: AI Infrastructure Pricing Analysis (Updated)

To build the OCR Extraction Engine for invoices, we must choose an AI provider. Historically, companies used AWS Textract or Google Cloud Vision, but the release of "Vision LLMs" in 2024 completely disrupted this market, dropping prices by over 99%.

Here is the recalculated cost comparison to process **1,000 Invoice Images**:

## 1. Google Gemini 1.5 Flash (Recommended for V1)
*   **Pricing**: $0.075 per 1 Million input tokens. (An image is ~259 tokens).
*   **Cost per 1,000 Invoices**: ~$0.02 (approx. **₹1.60**)
*   **Free Tier**: 15 requests per minute completely free.
*   **Pros**: Literally free to start. Extremely fast.
*   **Cons**: Sometimes struggles with highly distorted handwriting compared to GPT-4o.

## 2. OpenAI GPT-4o-mini
*   **Pricing**: $0.150 per 1 Million input tokens. (OpenAI uses "tiles" for images. A crisp A4 invoice takes ~2,833 tokens).
*   **Cost per 1,000 Invoices**: ~$0.42 (approx. **₹35.00**)
*   **Free Tier**: No permanent free tier.
*   **Pros**: Industry-leading accuracy for structured JSON extraction. 
*   **Cons**: Costs money from Day 1, but still incredibly cheap.

## 3. Anthropic Claude 3.5 Haiku
*   **Pricing**: $0.25 per 1 Million input tokens. (Images average ~1,092 tokens).
*   **Cost per 1,000 Invoices**: ~$0.27 (approx. **₹22.00**)
*   **Free Tier**: No permanent free tier.
*   **Pros**: Excellent formatting adherence. 

## 4. AWS Textract (AnalyzeExpense API) — The Legacy Way
*   **Pricing**: Flat rate of $10.00 per 1,000 pages.
*   **Cost per 1,000 Invoices**: $10.00 (approx. **₹840.00**)
*   **Pros**: Specifically built by Amazon for invoices. Highly deterministic.
*   **Cons**: **100x more expensive** than Vision LLMs. 

---

## Conclusion & Unit Economics

Let's analyze your proposed pricing model of **₹1.49 per invoice scan**, taking into account both the AI costs and the fixed "other things" (servers, database, hosting).

### The Per-Scan Margin (Variable Costs)
*   **Revenue per scan**: ₹1.49
*   **OpenRouter AI Cost**: ₹0.58 
*   **Payment Gateway Fee (approx 2%)**: ₹0.03
*   **Gross Profit per scan**: **₹0.88** (a very healthy ~59% gross margin)

### The Server Costs (Fixed Costs)
To run this SaaS reliably, you will eventually need paid tiers for your infrastructure:
*   **Supabase Database (Pro Tier)**: ~$25/month (₹2,500)
*   **Vercel/Frontend Hosting (Pro Tier)**: ~$20/month (₹2,000)
*   **Total Fixed Costs**: ~₹4,500 per month

*(Note: You can start entirely on Free Tiers for both Supabase and Vercel, meaning your fixed costs are ₹0 on Day 1).*

### The Break-Even Point
To cover a fully paid professional server setup (₹4,500/month) using only the ₹0.88 profit per scan:
*   ₹4,500 ÷ ₹0.88 = **~5,113 scans per month** to break even.

### Is ₹1.49 a good price?
**Yes, absolutely.** ₹1.49 is incredibly cheap for the end-user (saving them hours of manual data entry), but still leaves you with a 59% margin. 

If you get just 100 MSMEs to use your platform, and they each process 200 invoices a month:
*   Total Scans: 20,000
*   Revenue: ₹29,800
*   AI + Gateway Costs: -₹12,200
*   Server Costs: -₹4,500
*   **Net Profit: ₹13,100 / month** (And this scales infinitely as you add users).

**Recommendation:** Sell this as prepaid "Credit Packs" to avoid micro-transaction fees. For example: **100 Scans for ₹149**.

---

## Future Strategy: The Accountant (B2B) Pivot
*Note: This is a discussed concept and still needs further planning/validation.*

If the primary user is an **Accountant/CA** managing multiple clients, the architecture and pricing strategy will evolve:
1. **Multi-Tenant Architecture**: Add a "Client" layer. An accountant logs in and scans invoices specifically into "Client A" or "Client B" workspaces.
2. **Value Proposition**: A manual data entry clerk costs ~₹15,000/mo and types ~1,000 complex invoices (₹15 per invoice). At ₹1.49 per scan, PayForce is a 10x ROI for CA firms.
3. **B2B Bulk Pricing**: Instead of prepaid credits, offer heavy monthly subscriptions (e.g., ₹3,999/month for 5,000 scans). Acquiring just 10 CA firms guarantees a profitable, recurring base revenue.
