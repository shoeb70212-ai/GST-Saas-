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

If you charge your users **₹500 for a pack of 100 Scans**:

*   **Using AWS Textract**: Your cost is ₹84. Profit = ₹416.
*   **Using GPT-4o-mini**: Your cost is ₹3.50. Profit = ₹496.50.
*   **Using Gemini 1.5 Flash**: Your cost is ₹0.16. Profit = ₹499.84.

**Recommendation:** Start with the **Google Gemini API**. The Generative AI free tier allows you to build, test, and launch to your first 100 users without putting in a credit card. If accuracy issues arise on crumpled physical invoices, we can swap the backend to OpenAI GPT-4o-mini with 5 lines of code.
