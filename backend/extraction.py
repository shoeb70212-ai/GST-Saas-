"""
Shared invoice preprocess + AI extraction pipeline.

Used by scan, batch, public, and WhatsApp workers so every channel gets
the same PDF/image prep, mini→gpt-4o escalate, and financial trust gates.
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import re
import time
from typing import Any

from dotenv import load_dotenv
from fastapi import HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from tenacity import retry, stop_after_attempt, wait_exponential

from http_client import get_shared_client
import credits as credit_costs
from ops_log import field_presence_flags, log_extraction_quality, log_from_ctx

load_dotenv()

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Env overrides (OpenRouter uses openai/… prefixes)
if OPENROUTER_API_KEY:
    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=OPENROUTER_API_KEY,
    )
    AI_MODEL_PRIMARY = os.getenv("AI_MODEL_PRIMARY", "openai/gpt-4o-mini")
    AI_MODEL_VERIFY = os.getenv("AI_MODEL_VERIFY", "openai/gpt-4o")
elif OPENAI_API_KEY:
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    AI_MODEL_PRIMARY = os.getenv("AI_MODEL_PRIMARY", "gpt-4o-mini")
    AI_MODEL_VERIFY = os.getenv("AI_MODEL_VERIFY", "gpt-4o")
else:
    client = None
    AI_MODEL_PRIMARY = None
    AI_MODEL_VERIFY = None

# Backward-compatible alias used by older imports/tests
AI_MODEL = AI_MODEL_PRIMARY

if GEMINI_API_KEY:
    gemini_client = AsyncOpenAI(
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key=GEMINI_API_KEY,
    )
    GEMINI_MODEL = "gemini-2.5-flash"
else:
    gemini_client = None
    GEMINI_MODEL = None

GSTIN_REGEX = re.compile(
    r"^(0[1-9]|[1-2][0-9]|3[0-7])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][A-Z0-9][0-9A-Z]$"
)

MAX_VISION_PAGES = 4
MATH_TOLERANCE = 1.0

# Shared across scan / batch / public / WhatsApp
_ai_semaphore: asyncio.Semaphore | None = None
_file_processing_semaphore: asyncio.Semaphore | None = None


def get_ai_semaphore() -> asyncio.Semaphore:
    global _ai_semaphore
    if _ai_semaphore is None:
        _ai_semaphore = asyncio.Semaphore(5)
    return _ai_semaphore


def get_file_processing_semaphore() -> asyncio.Semaphore:
    global _file_processing_semaphore
    if _file_processing_semaphore is None:
        _file_processing_semaphore = asyncio.Semaphore(4)
    return _file_processing_semaphore


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------


class LineItem(BaseModel):
    Description: str | None = Field(description="Description of the item or service")
    HSN_SAC: str | None = Field(
        description="HSN or SAC code only if printed. Never invent or guess."
    )
    Quantity: float | None = Field(description="Quantity of items")
    Unit_Price: float | None = Field(description="Rate or price per unit")
    Amount: float | None = Field(description="Total amount for this line item before tax")
    Tax_Rate: float | None = Field(
        description="GST tax rate percentage for this item if specified"
    )


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
    Place_Of_Supply: str | None = Field(
        description="Place of supply as printed (state name or code). Null if absent."
    )
    Invoice_Date: str | None = Field(
        description="Date of the invoice in DD-MM-YYYY format if possible"
    )
    Due_Date: str | None = Field(
        description="Due date of the invoice in DD-MM-YYYY format if possible"
    )
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
        description=(
            "Suggested accounting ledger category. Must match one of the provided "
            "custom ledgers if available, otherwise infer from items."
        )
    )
    HSN_Audit_Warning: str | None = Field(
        description=(
            "If any extracted HSN code strongly mismatches the item description based "
            "on standard Indian GST rules, provide a brief warning here. Otherwise, leave null. "
            "Never invent missing HSN codes."
        )
    )
    Bank_Name: str | None = Field(description="Bank name")
    Branch_Name: str | None = Field(description="Bank branch name")
    IFSC_Code: str | None = Field(description="Bank IFSC code")
    UPI_ID: str | None = Field(description="UPI ID for payment")
    Invoice_Type: str | None = Field(
        description=(
            "One of: 'Tax Invoice', 'Bill of Supply', 'Credit Note', 'Debit Note', "
            "'Export Invoice' - read from heading only. Default 'Tax Invoice' if no "
            "other type is legible; otherwise null."
        )
    )
    Reverse_Charge_Applicable: bool | None = Field(
        description="Only from an explicit printed line such as 'Reverse Charge: Yes/No'. Do not infer."
    )
    Cess_Amount: float | None = Field(
        description="Read directly from a printed 'Cess' line/total. Do not calculate."
    )
    IRN: str | None = Field(description="64-character Invoice Reference Number. Null if absent.")
    Original_Invoice_Number: str | None = Field(
        description=(
            "Only populate when Invoice_Type is Credit Note or Debit Note - "
            "the invoice number being adjusted."
        )
    )
    Original_Invoice_Date: str | None = Field(
        description="Paired with Original_Invoice_Number, same format as Invoice_Date."
    )
    Line_Items: list[LineItem] = Field(
        default_factory=list, description="List of all items or services in the invoice"
    )


# ---------------------------------------------------------------------------
# Confidence / tax
# ---------------------------------------------------------------------------


def compute_confidence(extracted: dict, computed_total: float) -> dict:
    """
    Evaluates reliability of AI-extracted invoice data.

    Financial gates (₹1 tolerance): total vs computed; line-item sum vs taxable.
    auto_accepted only when score ≥ 95 AND financial_ok.
    """
    score = 100.0
    penalties = 0.0
    financial_ok = True

    supplier_gstin = extracted.get("Supplier_GSTIN")
    if supplier_gstin:
        if not GSTIN_REGEX.match(str(supplier_gstin).upper()):
            penalties += 25.0
    else:
        penalties += 15.0

    total_amount = extracted.get("Total_Amount") or 0.0
    if abs(float(computed_total) - float(total_amount)) > MATH_TOLERANCE:
        penalties += 30.0
        financial_ok = False

    line_items = extracted.get("Line_Items") or []
    if line_items:
        line_sum = sum(float(item.get("Amount") or 0) for item in line_items)
        taxable = extracted.get("Taxable_Amount")
        if taxable is None:
            taxable = line_sum
        if abs(line_sum - float(taxable)) > MATH_TOLERANCE:
            penalties += 25.0
            financial_ok = False

    required = ["Supplier_Name", "Invoice_Number", "Invoice_Date", "Total_Amount"]
    missing = [f for f in required if not extracted.get(f)]
    penalties += len(missing) * 10.0

    inv_type = (extracted.get("Invoice_Type") or "").strip().lower()
    if inv_type in ("credit note", "debit note") and not extracted.get(
        "Original_Invoice_Number"
    ):
        penalties += 10.0

    final_score = max(0.0, score - penalties)

    if final_score >= 95 and financial_ok:
        state = "auto_accepted"
    elif final_score >= 85:
        state = "needs_review"
    else:
        state = "needs_retry"

    return {"score": final_score, "state": state, "financial_ok": financial_ok}


def apply_tax_calculations(data_dict: dict) -> dict:
    """
    Deterministic CGST/SGST/IGST from supplier vs buyer GSTIN state codes.
    """
    line_items = data_dict.get("Line_Items", [])
    if not line_items:
        computed_total = data_dict.get("Total_Amount") or 0.0
        confidence = compute_confidence(data_dict, computed_total)
        data_dict["Confidence_Score"] = confidence["score"]
        data_dict["Extraction_State"] = confidence["state"]
        return data_dict

    taxable = sum((item.get("Amount") or 0) for item in line_items)
    cgst = 0.0
    sgst = 0.0
    igst = 0.0

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

    for item in line_items:
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


def should_escalate(data_dict: dict) -> bool:
    """Escalate to verify model when trust gate fails (retry or weak review)."""
    state = data_dict.get("Extraction_State")
    score = float(data_dict.get("Confidence_Score") or 0)
    if state == "needs_retry":
        return True
    if state == "needs_review" and score < 90:
        return True
    return False


# ---------------------------------------------------------------------------
# Preprocess
# ---------------------------------------------------------------------------


def preprocess_invoice_file(
    content: bytes,
    mime_type: str,
    password: str | None = None,
) -> tuple[bytes | str, str]:
    """
    Shared PDF/image prep: markdown when text-rich; else compressed JPEG pages.

    Caps vision pages at MAX_VISION_PAGES. Raises ValueError for bad password PDFs.
    """
    if mime_type == "application/pdf":
        import fitz
        from PIL import Image

        doc = fitz.open(stream=content, filetype="pdf")
        if not doc:
            raise ValueError("Could not read PDF pages.")
        if doc.needs_pass:
            if password and doc.authenticate(password):
                from utils import remove_pdf_password_if_present

                content = remove_pdf_password_if_present(content, password)
                doc = fitz.open(stream=content, filetype="pdf")
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
            logger.info("Markdown extraction failed or skipped: %s", e)

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
        valid_pages: list[int] = []

        for i in range(len(doc)):
            page = doc[i]
            text = page.get_text().lower()
            kw_score = sum(text.count(kw) for kw in gst_keywords)
            if kw_score >= 2 or ("hsn" in text and "amount" in text):
                valid_pages.append(i)

        if not valid_pages:
            valid_pages = [0]

        valid_pages = valid_pages[:MAX_VISION_PAGES]

        images = []
        for i in valid_pages:
            pix = doc[i].get_pixmap(dpi=150)
            img = Image.open(io.BytesIO(pix.tobytes("jpeg")))
            images.append(img)

        if len(images) == 1:
            output = io.BytesIO()
            images[0].save(output, format="JPEG", quality=85)
            return output.getvalue(), "image/jpeg"

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

    if mime_type.startswith("image/"):
        from PIL import Image

        img = Image.open(io.BytesIO(content))
        if img.width <= 2048 and img.height <= 2048 and img.format == "JPEG":
            return content, mime_type

        if img.mode in ("RGBA", "LA") or (
            img.mode == "P" and "transparency" in img.info
        ):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "RGBA":
                bg.paste(img, mask=img.split()[3])
            else:
                bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[3])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=85)
        return output.getvalue(), "image/jpeg"

    return content, mime_type


# ---------------------------------------------------------------------------
# AI extraction
# ---------------------------------------------------------------------------


def _build_prompt(tally_ledgers: list | None) -> str:
    ledger_instruction = ""
    if tally_ledgers:
        ledger_instruction = (
            f"\nCRITICAL: For Expense_Category, you MUST choose exactly one of the following ledgers: "
            f"{', '.join(tally_ledgers)}. If none fit, choose 'Other'."
        )

    return f"""
## Role
You are an expert Indian Chartered Accountant assistant specializing in GST invoice data extraction. Your sole job is to analyze the provided invoice and extract the requested fields perfectly according to the schema.

## Constraints
- **Do NOT Hallucinate**: For optional fields (e.g., PO_Number, E_Way_Bill_Number, Vehicle_Number, Bank details, IRN, Cess), if they are not explicitly printed on the document, you MUST return null.
- **Literal Extraction Only**: Only extract what is literally printed on the document for `Invoice_Type`, `Reverse_Charge_Applicable`, `Cess_Amount`, and `IRN`. Do NOT infer or guess them.
- **Never invent HSN/SAC**: Extract HSN only when printed on the line. Leave HSN_SAC null if missing. Do not suggest codes.
- **Credit/Debit Notes**: Only populate `Original_Invoice_Number` and `Original_Invoice_Date` if the document is explicitly a Credit Note or Debit Note.
- **Expense Category**: Suggest a standard accounting ledger category based on the line items.{ledger_instruction}
- **HSN Validation**: For `HSN_Audit_Warning`, check if printed HSN codes align logically with descriptions. If mismatch, flag it. Otherwise null.

## Reasoning
Carefully review the entire document first. Map the printed fields to the schema. Double-check all amounts and totals for mathematical consistency before finalizing the output.
"""


def _messages_content(content: bytes | str, mime_type: str) -> list[dict]:
    if mime_type == "text/markdown" and isinstance(content, str):
        return [
            {
                "type": "text",
                "text": f"Here is the raw text extracted from the invoice document:\n\n{content}",
            }
        ]
    base64_image = base64.b64encode(content).decode("utf-8")
    image_url = f"data:{mime_type};base64,{base64_image}"
    return [{"type": "image_url", "image_url": {"url": image_url}}]


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=6))
async def _parse_with_model(ai_client: AsyncOpenAI, model: str, prompt: str, messages_content: list):
    """Single-model structured parse with narrow retries (not full escalate stacks)."""
    response = await ai_client.beta.chat.completions.parse(
        model=model,
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
        raise ValueError(f"Failed to parse structured output from model {model}")
    tokens = response.usage.total_tokens if response.usage else 0
    return extracted_data.model_dump(), tokens


async def run_ai_extraction(
    content: bytes | str,
    mime_type: str,
    tally_ledgers: list | None = None,
    ops_ctx: dict | None = None,
):
    """
    Pass 1: gpt-4o-mini (AI_MODEL_PRIMARY).
    Pass 2: gpt-4o (AI_MODEL_VERIFY) only when trust gate fails.
    Gemini: last-resort transport failure only (not accuracy path).

    Optional ops_ctx (from ops_log.build_ops_ctx) enables proactive ops logging.
    """
    if not client or not AI_MODEL_PRIMARY:
        raise HTTPException(
            status_code=500,
            detail="Missing API Key. Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env.",
        )

    if ops_ctx is not None and mime_type and not ops_ctx.get("mime_type"):
        ops_ctx = {**ops_ctx, "mime_type": mime_type}

    prompt = _build_prompt(tally_ledgers)
    messages_content = _messages_content(content, mime_type)
    total_tokens = 0
    started = time.monotonic()

    async def _latency_ms() -> int:
        return int((time.monotonic() - started) * 1000)

    async with get_ai_semaphore():
        try:
            data_dict, tokens = await _parse_with_model(
                client, AI_MODEL_PRIMARY, prompt, messages_content
            )
            total_tokens += tokens
            data_dict = apply_tax_calculations(data_dict)
            data_dict["Extraction_Model"] = AI_MODEL_PRIMARY
        except Exception as primary_e:
            logger.warning(
                "Primary model %s failed: %s. Trying Gemini transport fallback...",
                AI_MODEL_PRIMARY,
                primary_e,
            )
            await log_from_ctx(
                ops_ctx,
                severity="warning",
                event_type="ai_primary_failure",
                message=str(primary_e),
                model_used=AI_MODEL_PRIMARY,
                latency_ms=await _latency_ms(),
                meta={"fallback": "gemini" if gemini_client else "none"},
            )
            if not gemini_client:
                await log_from_ctx(
                    ops_ctx,
                    severity="error",
                    event_type="ai_failure",
                    message=f"Primary failed, no Gemini fallback: {primary_e}",
                    model_used=AI_MODEL_PRIMARY,
                    latency_ms=await _latency_ms(),
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Error communicating with OpenAI (no fallback available): {primary_e}",
                ) from primary_e
            try:
                data_dict, tokens = await _parse_with_model(
                    gemini_client, GEMINI_MODEL, prompt, messages_content
                )
                total_tokens += tokens
                data_dict = apply_tax_calculations(data_dict)
                data_dict["Extraction_Model"] = GEMINI_MODEL
                await log_extraction_quality(
                    ops_ctx,
                    data_dict,
                    tokens_used=total_tokens,
                    latency_ms=await _latency_ms(),
                )
                return data_dict, total_tokens
            except Exception as gemini_e:
                await log_from_ctx(
                    ops_ctx,
                    severity="error",
                    event_type="ai_failure",
                    message=f"Primary: {primary_e}; Fallback: {gemini_e}",
                    model_used=GEMINI_MODEL,
                    tokens_used=total_tokens,
                    latency_ms=await _latency_ms(),
                    meta={"primary_model": AI_MODEL_PRIMARY},
                )
                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"Both primary and fallback AI failed. "
                        f"Primary: {primary_e}, Fallback: {gemini_e}"
                    ),
                ) from gemini_e

        if should_escalate(data_dict) and AI_MODEL_VERIFY:
            try:
                verify_dict, v_tokens = await _parse_with_model(
                    client, AI_MODEL_VERIFY, prompt, messages_content
                )
                total_tokens += v_tokens
                verify_dict = apply_tax_calculations(verify_dict)
                verify_dict["Extraction_Model"] = AI_MODEL_VERIFY
                verify_dict["Escalated"] = True
                # Prefer verify when it improves state / score
                primary_score = float(data_dict.get("Confidence_Score") or 0)
                verify_score = float(verify_dict.get("Confidence_Score") or 0)
                primary_state = data_dict.get("Extraction_State")
                verify_state = verify_dict.get("Extraction_State")
                state_rank = {"needs_retry": 0, "needs_review": 1, "auto_accepted": 2, "duplicate_warning": 2}
                if state_rank.get(verify_state, 0) > state_rank.get(primary_state, 0) or (
                    verify_state == primary_state and verify_score >= primary_score
                ):
                    await log_extraction_quality(
                        ops_ctx,
                        verify_dict,
                        tokens_used=total_tokens,
                        latency_ms=await _latency_ms(),
                    )
                    return verify_dict, total_tokens
                data_dict["Escalated"] = True
                data_dict["Verify_Score"] = verify_score
            except Exception as verify_e:
                logger.warning(
                    "Verify model %s failed (keeping primary): %s",
                    AI_MODEL_VERIFY,
                    verify_e,
                )
                data_dict["Escalated"] = False
                await log_from_ctx(
                    ops_ctx,
                    severity="warning",
                    event_type="verify_failure",
                    message=str(verify_e),
                    extraction_state=data_dict.get("Extraction_State"),
                    confidence_score=data_dict.get("Confidence_Score"),
                    model_used=AI_MODEL_VERIFY,
                    tokens_used=total_tokens,
                    latency_ms=await _latency_ms(),
                    meta={
                        **field_presence_flags(data_dict),
                        "kept_primary": True,
                    },
                )

        await log_extraction_quality(
            ops_ctx,
            data_dict,
            tokens_used=total_tokens,
            latency_ms=await _latency_ms(),
        )
        return data_dict, total_tokens


# ---------------------------------------------------------------------------
# Persist + credits helpers
# ---------------------------------------------------------------------------


def line_items_db_payload(invoice_id: str, line_items: list[dict]) -> list[dict]:
    """Map schema Line_Items keys to invoice_line_items columns."""
    payload = []
    for li in line_items or []:
        payload.append(
            {
                "invoice_id": invoice_id,
                "description": li.get("Description") or li.get("description"),
                "hsn_sac": li.get("HSN_SAC") or li.get("hsn_sac"),
                "quantity": li.get("Quantity") if "Quantity" in li else li.get("quantity"),
                "unit_price": li.get("Unit_Price") if "Unit_Price" in li else li.get("unit_price"),
                "tax_rate": li.get("Tax_Rate") if "Tax_Rate" in li else li.get("tax_rate"),
                "amount": li.get("Amount") if "Amount" in li else li.get("amount"),
            }
        )
    return payload


async def persist_extracted_invoice(
    sc,
    invoice_id: str,
    data_dict: dict,
    *,
    extra_fields: dict | None = None,
    processing_status: str = "completed",
) -> None:
    """
    Update invoice row + insert line items (shared by batch / public / WA update paths).
    """
    from utils import format_date_to_iso

    db_update = {k.lower(): v for k, v in data_dict.items() if k != "Line_Items"}
    # Drop non-column helpers
    for drop_key in ("extraction_model", "escalated", "verify_score", "financial_ok"):
        db_update.pop(drop_key, None)

    if "invoice_date" in db_update:
        db_update["invoice_date"] = format_date_to_iso(db_update["invoice_date"])
    if "due_date" in db_update:
        db_update["due_date"] = format_date_to_iso(db_update["due_date"])
    if "original_invoice_date" in db_update:
        db_update["original_invoice_date"] = format_date_to_iso(
            db_update["original_invoice_date"]
        )

    db_update["processing_status"] = processing_status
    db_update["error_message"] = None
    if extra_fields:
        db_update.update(extra_fields)

    await sc.table("invoices").update(db_update).eq("id", invoice_id).execute()

    line_items = data_dict.get("Line_Items", [])
    if line_items:
        items_payload = line_items_db_payload(invoice_id, line_items)
        resp = await sc.table("invoice_line_items").insert(items_payload).execute()
        if not resp.data:
            raise Exception("Database error: Failed to insert line items")


async def deduct_credits_rpc(
    *,
    user_id: str,
    amount: int,
    task_type: str,
    file_name: str,
    token: str | None = None,
    tokens_used: int = 0,
    use_service_key: bool = False,
) -> int:
    """
    HTTP decrement_credits helper. Returns remaining credits or -1 if insufficient.
    Same costs as credits.py — no pricing redesign.
    """
    from utils import SUPABASE_SERVICE_KEY

    api_key = SUPABASE_SERVICE_KEY if use_service_key else SUPABASE_ANON_KEY
    auth_token = SUPABASE_SERVICE_KEY if use_service_key else (token or "")
    async with get_shared_client() as http_client:
        rpc_resp = await http_client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/decrement_credits",
            headers={
                "apikey": api_key,
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            json={
                "user_id_param": user_id,
                "amount": amount,
                "task_type_param": task_type,
                "file_name_param": file_name,
                "tokens_used_param": tokens_used,
            },
        )
    if rpc_resp.status_code != 200:
        logger.error("decrement_credits failed: %s", rpc_resp.text)
        raise HTTPException(status_code=500, detail="Internal error during credit deduction")
    try:
        return rpc_resp.json()
    except ValueError:
        return 0


async def refund_credits_rpc(
    *,
    user_id: str,
    amount: int,
    token: str | None = None,
    use_service_key: bool = False,
) -> None:
    from utils import SUPABASE_SERVICE_KEY

    api_key = SUPABASE_SERVICE_KEY if use_service_key else SUPABASE_ANON_KEY
    auth_token = SUPABASE_SERVICE_KEY if use_service_key else (token or "")
    async with get_shared_client() as http_client:
        await http_client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/refund_credits",
            headers={
                "apikey": api_key,
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            json={"user_id_param": user_id, "amount": amount},
        )


# Re-export cost constants for callers that import from extraction
INVOICE_SCAN_COST = credit_costs.INVOICE_SCAN
