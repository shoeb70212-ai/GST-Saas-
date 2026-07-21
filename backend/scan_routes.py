"""
Authenticated single-invoice scan + shared AI extraction helpers.

Route: POST /api/scan-invoice (mounted under /api by main.py)
Also exports run_ai_extraction / tax helpers used by batch, public, and WhatsApp workers.
"""
import os
import base64
import io
import logging
import re
import asyncio

from fastapi import APIRouter, File, UploadFile, HTTPException, Form, Depends
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from http_client import get_shared_client
from utils import validate_file_content, get_current_user, get_org_credits
import credits as credit_costs

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if OPENROUTER_API_KEY:
    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=OPENROUTER_API_KEY,
    )
    AI_MODEL = "openai/gpt-4o-mini"
elif OPENAI_API_KEY:
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    AI_MODEL = "gpt-4o-mini"
else:
    client = None
    AI_MODEL = None

if GEMINI_API_KEY:
    gemini_client = AsyncOpenAI(
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key=GEMINI_API_KEY,
    )
    GEMINI_MODEL = "gemini-2.5-flash"
else:
    gemini_client = None
    GEMINI_MODEL = None

_file_processing_semaphore = None


def compute_confidence(extracted: dict, computed_total: float) -> dict:
    """
    Evaluates the reliability of the AI-extracted invoice data.

    Starts with a perfect score of 100 and applies penalties based on missing
    or malformed critical fields. This score determines whether an invoice
    is auto-accepted, needs manual review, or completely failed.
    """
    score = 100.0
    penalties = 0.0

    supplier_gstin = extracted.get("Supplier_GSTIN")
    if supplier_gstin:
        if not re.match(
            r'^(0[1-9]|[1-2][0-9]|3[0-7])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][A-Z0-9][0-9A-Z]$',
            supplier_gstin.upper(),
        ):
            penalties += 25.0
    else:
        penalties += 15.0

    total_amount = extracted.get("Total_Amount") or 0.0
    if abs(computed_total - total_amount) > 1.0:
        penalties += 30.0

    required = ["Supplier_Name", "Invoice_Number", "Invoice_Date", "Total_Amount"]
    missing = [f for f in required if not extracted.get(f)]
    penalties += len(missing) * 10.0

    final_score = max(0.0, score - penalties)

    if final_score >= 95:
        state = "auto_accepted"
    elif final_score >= 85:
        state = "needs_review"
    else:
        state = "needs_retry"

    return {"score": final_score, "state": state}


def apply_tax_calculations(data_dict: dict) -> dict:
    """
    Calculates and structures the GST tax components based on line items.

    Instead of relying on the AI to perfectly read the CGST/SGST/IGST breakdown,
    this function calculates it deterministically based on the Supplier and Buyer GSTINs.
    If the first 2 characters (State Code) of the GSTINs match, it applies CGST + SGST.
    If they differ, it applies IGST (Interstate).
    """
    line_items = data_dict.get("Line_Items", [])
    if not line_items:
        computed_total = data_dict.get("Total_Amount") or 0.0
        confidence = compute_confidence(data_dict, computed_total)
        data_dict["Confidence_Score"] = confidence["score"]
        data_dict["Extraction_State"] = confidence["state"]
        return data_dict

    taxable = sum((item.get("Amount") or 0) for item in line_items)
    cgst = 0
    sgst = 0
    igst = 0

    sup_gstin = data_dict.get("Supplier_GSTIN")
    buy_gstin = data_dict.get("Buyer_GSTIN")
    is_interstate = False

    if (
        sup_gstin
        and buy_gstin
        and len(sup_gstin) >= 2
        and len(buy_gstin) >= 2
    ):
        if sup_gstin[:2] != buy_gstin[:2]:
            is_interstate = True

    for item in data_dict.get("Line_Items", []):
        amt = item.get("Amount") or 0
        rate = item.get("Tax_Rate") or 0
        tax_val = amt * (rate / 100)

        if is_interstate:
            igst += tax_val
        else:
            cgst += tax_val / 2
            sgst += tax_val / 2

    data_dict["Taxable_Amount"] = taxable
    data_dict["CGST_Amount"] = round(cgst, 2)
    data_dict["SGST_Amount"] = round(sgst, 2)
    data_dict["IGST_Amount"] = round(igst, 2)

    computed_total = round(
        taxable
        + cgst
        + sgst
        + igst
        + (data_dict.get("Cess_Amount") or 0)
        + (data_dict.get("Round_Off") or 0),
        2,
    )
    if not data_dict.get("Total_Amount"):
        data_dict["Total_Amount"] = computed_total

    confidence = compute_confidence(data_dict, computed_total)
    data_dict["Confidence_Score"] = confidence["score"]
    data_dict["Extraction_State"] = confidence["state"]

    return data_dict


class LineItem(BaseModel):
    Description: str | None = Field(description="Description of the item or service")
    HSN_SAC: str | None = Field(description="HSN or SAC code")
    Quantity: float | None = Field(description="Quantity of items")
    Unit_Price: float | None = Field(description="Rate or price per unit")
    Amount: float | None = Field(description="Total amount for this line item before tax")
    Tax_Rate: float | None = Field(description="GST tax rate percentage for this item if specified")


class InvoiceData(BaseModel):
    Supplier_Name: str | None = Field(description="Name of the supplier")
    Supplier_Address: str | None = Field(description="Full address of the supplier")
    Supplier_Phone: str | None = Field(description="Phone number of the supplier")
    Supplier_Email: str | None = Field(description="Email address of the supplier")
    Supplier_GSTIN: str | None = Field(description="GSTIN of the supplier (15 characters)")
    Supplier_PAN: str | None = Field(description="PAN number of the supplier")
    Buyer_Name: str | None = Field(description="Name of the buyer")
    Buyer_Address: str | None = Field(description="Full address of the buyer")
    Buyer_PIN: str | None = Field(description="PIN code of the buyer")
    Buyer_GSTIN: str | None = Field(description="GSTIN of the buyer (15 characters)")
    Buyer_PAN: str | None = Field(description="PAN number of the buyer")
    Place_Of_Supply: str | None = Field(description="Place of supply")
    Invoice_Date: str | None = Field(description="Date of the invoice in DD-MM-YYYY format if possible")
    Due_Date: str | None = Field(description="Due date of the invoice in DD-MM-YYYY format if possible")
    Invoice_Number: str | None = Field(description="Invoice number")
    PO_Number: str | None = Field(description="Purchase Order (PO) Number if available")
    E_Way_Bill_Number: str | None = Field(description="E-Way Bill Number if available")
    Vehicle_Number: str | None = Field(description="Vehicle Number if available")
    Round_Off: float | None = Field(description="Round off amount if any")
    Total_Amount: float | None = Field(description="Total invoice amount including taxes")
    GST_Amount: float | None = Field(description="Total GST amount on the invoice")
    Amount_In_Words: str | None = Field(description="Total amount written in words")
    Received_Amount: float | None = Field(description="Amount received")
    Balance_Amount: float | None = Field(description="Balance amount due")
    Previous_Balance: float | None = Field(description="Previous balance")
    Current_Balance: float | None = Field(description="Current balance")
    Account_Holder: str | None = Field(description="Bank account holder name")
    Account_Number: str | None = Field(description="Bank account number")
    Expense_Category: str | None = Field(
        description="Suggested accounting ledger category. Must match one of the provided custom ledgers if available, otherwise infer from items."
    )
    HSN_Audit_Warning: str | None = Field(
        description="If any extracted HSN code strongly mismatches the item description based on standard Indian GST rules, provide a brief warning here. Otherwise, leave null."
    )
    Bank_Name: str | None = Field(description="Bank name")
    Branch_Name: str | None = Field(description="Bank branch name")
    IFSC_Code: str | None = Field(description="Bank IFSC code")
    UPI_ID: str | None = Field(description="UPI ID for payment")
    Invoice_Type: str | None = Field(
        description="One of: 'Tax Invoice', 'Bill of Supply', 'Credit Note', 'Debit Note', 'Export Invoice' - read from heading only. Default 'Tax Invoice' if no other type is legible; otherwise null."
    )
    Reverse_Charge_Applicable: bool | None = Field(
        description="Only from an explicit printed line such as 'Reverse Charge: Yes/No'. Do not infer."
    )
    Cess_Amount: float | None = Field(
        description="Read directly from a printed 'Cess' line/total. Do not calculate."
    )
    IRN: str | None = Field(description="64-character Invoice Reference Number. Null if absent.")
    Original_Invoice_Number: str | None = Field(
        description="Only populate when Invoice_Type is Credit Note or Debit Note - the invoice number being adjusted."
    )
    Original_Invoice_Date: str | None = Field(
        description="Paired with Original_Invoice_Number, same format as Invoice_Date."
    )
    Line_Items: list[LineItem] = Field(
        default_factory=list, description="List of all items or services in the invoice"
    )


@router.post("/scan-invoice")
async def scan_invoice(
    file: UploadFile = File(...),
    password: str = Form(None),
    auth: dict = Depends(get_current_user),
):
    """
    Primary endpoint for processing single invoice files (PDF/Images).

    Workflow:
    1. Authenticates the user via Supabase JWT (Depends(get_current_user)).
    2. Checks if the user has sufficient credits in their profile.
    3. Validates the file (magic bytes & size).
    4. Runs AI extraction (`run_ai_extraction`) to parse data.
    5. Checks the vendor GSTIN against the KYC Cache (Supabase RPC).
    6. Deducts 1 credit from the user's account.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="Missing Supabase configuration in .env.")

    if not client:
        raise HTTPException(
            status_code=500,
            detail="Missing API Key. Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env.",
        )

    user_id = auth["user_id"]
    token = auth["token"]
    sc = auth["supabase_client"]
    scan_cost = credit_costs.INVOICE_SCAN

    # 1. Profile ledgers + multi-org-safe credit pre-check
    tally_ledgers = None
    try:
        profile_resp = await sc.table("profiles").select("tally_ledgers").eq("id", user_id).execute()
        if profile_resp.data:
            tally_ledgers = profile_resp.data[0].get("tally_ledgers")
    except Exception:
        tally_ledgers = None

    credits = await get_org_credits(sc, user_id)
    # Lightweight guard — atomic RPC deduction still handles races
    if credits <= 0:
        raise HTTPException(
            status_code=402, detail="Insufficient credits. Please recharge your wallet."
        )

    content = await file.read()

    mime_type = validate_file_content(content, file.filename)

    def process_file_sync(c_bytes, m_type):
        if m_type == "application/pdf":
            import fitz
            from PIL import Image

            doc = fitz.open(stream=c_bytes, filetype="pdf")
            if not doc:
                raise ValueError("Could not read PDF pages.")
            if doc.needs_pass:
                if password and doc.authenticate(password):
                    from utils import remove_pdf_password_if_present

                    c_bytes = remove_pdf_password_if_present(c_bytes, password)
                    doc = fitz.open(stream=c_bytes, filetype="pdf")
                    if doc.needs_pass:
                        doc.authenticate(password)
                else:
                    raise ValueError(
                        "This PDF is password-protected. Please provide the correct password."
                    )

            try:
                import pymupdf4llm

                md_text = pymupdf4llm.to_markdown(doc)
                if md_text and "|" in md_text and len(md_text) > 100:
                    return md_text, "text/markdown"
            except Exception as e:
                logger.info(f"Markdown extraction failed or skipped: {e}")

            gst_keywords = [
                "gstin",
                "invoice",
                "taxable",
                "cgst",
                "sgst",
                "igst",
                "hsn",
                "total",
                "amount",
                "qty",
                "rate",
            ]
            valid_pages = []

            for i in range(len(doc)):
                page = doc[i]
                text = page.get_text().lower()
                score = sum(text.count(kw) for kw in gst_keywords)
                if score >= 2 or ("hsn" in text and "amount" in text):
                    valid_pages.append(i)

            if not valid_pages:
                valid_pages = [0]

            images = []
            for i in valid_pages:
                pix = doc[i].get_pixmap(dpi=150)
                img = Image.open(io.BytesIO(pix.tobytes("jpeg")))
                images.append(img)

            if len(images) == 1:
                output = io.BytesIO()
                images[0].save(output, format="JPEG", quality=85)
                return output.getvalue(), "image/jpeg"
            else:
                total_height = sum(img.height for img in images)
                max_width = max(img.width for img in images)
                combined = Image.new("RGB", (max_width, total_height), (255, 255, 255))
                y_offset = 0
                for img in images:
                    combined.paste(img, (0, y_offset))
                    y_offset += img.height

                output = io.BytesIO()
                combined.save(output, format="JPEG", quality=85)
                return output.getvalue(), "image/jpeg"
        elif m_type.startswith("image/"):
            from PIL import Image

            img = Image.open(io.BytesIO(c_bytes))
            if img.width <= 2048 and img.height <= 2048 and img.format == "JPEG":
                return c_bytes, m_type
            else:
                if img.mode in ("RGBA", "LA") or (
                    img.mode == "P" and "transparency" in img.info
                ):
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "RGBA":
                        bg.paste(img, mask=img.split()[3])
                    else:
                        bg.paste(
                            img.convert("RGBA"), mask=img.convert("RGBA").split()[3]
                        )
                    img = bg
                elif img.mode != "RGB":
                    img = img.convert("RGB")
                img.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                img.save(output, format="JPEG", quality=85)
                return output.getvalue(), "image/jpeg"
        return c_bytes, m_type

    global _file_processing_semaphore
    if _file_processing_semaphore is None:
        _file_processing_semaphore = asyncio.Semaphore(4)

    async with _file_processing_semaphore:
        try:
            content, mime_type = await asyncio.to_thread(
                process_file_sync, content, mime_type
            )
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to process file. Error: {str(e)}"
            )

    try:
        async with get_shared_client() as http_client:
            rpc_resp = await http_client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/decrement_credits",
                headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={
                    "user_id_param": user_id,
                    "amount": scan_cost,
                    "task_type_param": "invoice_scan",
                    "file_name_param": file.filename,
                    "tokens_used_param": 0,
                },
            )
            if rpc_resp.status_code != 200:
                logger.error(f"Failed to deduct credits. RPC response: {rpc_resp.text}")
                raise HTTPException(
                    status_code=500, detail="Internal error during credit deduction"
                )

            try:
                result = rpc_resp.json()
                if result == -1:
                    raise HTTPException(
                        status_code=402,
                        detail="Insufficient credits. Please recharge your wallet.",
                    )
            except ValueError:
                pass

        try:
            data_dict, tokens = await run_ai_extraction(content, mime_type, tally_ledgers)
        except Exception as ai_e:
            async with get_shared_client() as http_client:
                await http_client.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/refund_credits",
                    headers={
                        "apikey": SUPABASE_ANON_KEY,
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json={"user_id_param": user_id, "amount": scan_cost},
                )
            raise ai_e

        gstin = data_dict.get("Supplier_GSTIN")
        if gstin:
            sc = None
            try:
                from supabase import create_async_client

                sc = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
                sc.postgrest.auth(token)
                from gstin_service import verify_gstin

                data_dict["Supplier_GSTIN_Status"] = await verify_gstin(sc, gstin)
            except Exception as gstin_e:
                logger.warning(f"GSTIN verification failed (non-blocking): {gstin_e}")

            inv_num = data_dict.get("Invoice_Number")
            if inv_num and sc:
                try:
                    dup_resp = (
                        await sc.table("invoices")
                        .select("id")
                        .eq("user_id", user_id)
                        .eq("supplier_gstin", gstin)
                        .eq("invoice_number", inv_num)
                        .execute()
                    )
                    if dup_resp.data and len(dup_resp.data) > 0:
                        data_dict["Extraction_State"] = "duplicate_warning"
                except Exception as dup_e:
                    logger.warning(
                        f"Duplicate detection check failed (non-blocking): {dup_e}"
                    )

        return {"status": "success", "data": data_dict}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Scan invoice error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def run_ai_extraction(content: bytes | str, mime_type: str, tally_ledgers: list = None):
    messages_content = []

    if mime_type == "text/markdown" and isinstance(content, str):
        messages_content.append(
            {
                "type": "text",
                "text": f"Here is the raw text extracted from the invoice document:\n\n{content}",
            }
        )
    else:
        base64_image = base64.b64encode(content).decode("utf-8")
        image_url = f"data:{mime_type};base64,{base64_image}"
        messages_content.append({"type": "image_url", "image_url": {"url": image_url}})

    ledger_instruction = ""
    if tally_ledgers:
        ledger_instruction = (
            f"\nCRITICAL: For Expense_Category, you MUST choose exactly one of the following ledgers: "
            f"{', '.join(tally_ledgers)}. If none fit, choose 'Other'."
        )

    prompt = f"""
## Role
You are an expert Indian Chartered Accountant assistant specializing in GST invoice data extraction. Your sole job is to analyze the provided invoice and extract the requested fields perfectly according to the schema.

## Constraints
- **Do NOT Hallucinate**: For optional fields (e.g., PO_Number, E_Way_Bill_Number, Vehicle_Number, Bank details), if they are not explicitly printed on the document, you MUST return null.
- **Literal Extraction Only**: Only extract what is literally printed on the document for `Invoice_Type`, `Reverse_Charge_Applicable`, `Cess_Amount`, and `IRN`. Do NOT infer or guess them.
- **Credit/Debit Notes**: Only populate `Original_Invoice_Number` and `Original_Invoice_Date` if the document is explicitly a Credit Note or Debit Note.
- **Expense Category**: Suggest a standard accounting ledger category based on the line items.{ledger_instruction}
- **HSN Validation**: For `HSN_Audit_Warning`, check if the HSN codes align logically with the item descriptions based on standard Indian GST rules. If there's an obvious mismatch, flag it. Otherwise, return null.

## Reasoning
Carefully review the entire document first. Map the printed fields to the schema. Double-check all amounts and totals for mathematical consistency before finalizing the output.
"""

    try:
        response = await client.beta.chat.completions.parse(
            model=AI_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [{"type": "text", "text": prompt}] + messages_content,
                }
            ],
            response_format=InvoiceData,
        )

        extracted_data = response.choices[0].message.parsed
        if not extracted_data:
            raise HTTPException(
                status_code=500, detail="Failed to parse structured output from primary AI."
            )

        data_dict = extracted_data.model_dump()
        tokens = response.usage.total_tokens if response.usage else 0

        data_dict = apply_tax_calculations(data_dict)

        return data_dict, tokens

    except Exception as e:
        logger.warning(f"Primary AI failed with error: {e}. Attempting fallback to Gemini...")
        if gemini_client:
            try:
                response = await gemini_client.beta.chat.completions.parse(
                    model=GEMINI_MODEL,
                    messages=[
                        {
                            "role": "user",
                            "content": [{"type": "text", "text": prompt}]
                            + messages_content,
                        }
                    ],
                    response_format=InvoiceData,
                )

                extracted_data = response.choices[0].message.parsed
                if not extracted_data:
                    raise HTTPException(
                        status_code=500,
                        detail="Failed to parse structured output from fallback AI.",
                    )

                data_dict = extracted_data.model_dump()
                tokens = response.usage.total_tokens if response.usage else 0

                data_dict = apply_tax_calculations(data_dict)

                return data_dict, tokens
            except Exception as gemini_e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Both primary and fallback AI failed. Primary: {e}, Fallback: {gemini_e}",
                )
        raise HTTPException(
            status_code=500,
            detail=f"Error communicating with OpenAI (no fallback available): {str(e)}",
        )
