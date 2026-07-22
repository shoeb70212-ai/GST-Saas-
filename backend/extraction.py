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

# Re-export for callers/tests that imported from extraction
from preprocess import HYBRID_MIME, MAX_VISION_PAGES  # noqa: E402

MATH_TOLERANCE = 1.0

# Phase 1 — pinned LLM decode + prompt versioning (bump when prompt text changes)
PROMPT_VERSION = os.getenv("EXTRACTION_PROMPT_VERSION", "2026-07-22.v1")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "4096"))
LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "90"))
EXTRACTION_CACHE_ENABLED = os.getenv("EXTRACTION_CACHE_ENABLED", "1") not in (
    "0",
    "false",
    "False",
)

# Shared across scan / batch / public / WhatsApp (per uvicorn process).
# With WEB_CONCURRENCY>1, effective capacity ≈ workers × these limits.
_ai_semaphore: asyncio.Semaphore | None = None
_file_processing_semaphore: asyncio.Semaphore | None = None


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        return max(1, int(raw or default))
    except (TypeError, ValueError):
        return default


def get_ai_semaphore() -> asyncio.Semaphore:
    global _ai_semaphore
    if _ai_semaphore is None:
        _ai_semaphore = asyncio.Semaphore(_env_int("AI_SEMAPHORE_LIMIT", 5))
    return _ai_semaphore


def get_file_processing_semaphore() -> asyncio.Semaphore:
    global _file_processing_semaphore
    if _file_processing_semaphore is None:
        _file_processing_semaphore = asyncio.Semaphore(
            _env_int("FILE_SEMAPHORE_LIMIT", 4)
        )
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
    from validators import validate_gstin, validate_tax_arithmetic

    score = 100.0
    penalties = 0.0
    financial_ok = True

    supplier_gstin = extracted.get("Supplier_GSTIN")
    gstin_result = validate_gstin(supplier_gstin)
    if supplier_gstin:
        if not gstin_result["ok"]:
            errs = gstin_result["errors"]
            # Soft: checksum-only typos; hard: format/length
            if any(e.startswith("checksum") for e in errs) and not any(
                e in ("format", "missing_z", "pan_in_gstin")
                or e.startswith("length")
                for e in errs
            ):
                # Checksum is validated in validators/bench/export gates; do not
                # collapse confidence for legacy fixture GSTINs that pass format.
                penalties += 0.0
            else:
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

    # Header tax math only when tax components are present (avoid
    # double-penalising taxable-only / total-only thin extracts).
    math = validate_tax_arithmetic(extracted)
    has_tax_signal = any(
        extracted.get(k) not in (None, "", 0, 0.0)
        for k in (
            "CGST_Amount",
            "SGST_Amount",
            "IGST_Amount",
            "Cess_Amount",
        )
    )
    if has_tax_signal and not math["ok"]:
        financial_ok = False
        if "mixed_cgst_igst" in math["issues"]:
            penalties += 5.0
        elif abs(float(computed_total) - float(total_amount or 0)) <= MATH_TOLERANCE:
            # Extra header issues beyond the primary total vs computed check
            penalties += 10.0

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


def should_escalate(data_dict: dict, text_layer: str | None = None) -> bool:
    """Escalate when trust gate fails (retry, weak review, or disputed critical fields)."""
    state = data_dict.get("Extraction_State")
    score = float(data_dict.get("Confidence_Score") or 0)
    if state == "needs_retry":
        return True
    if state == "needs_review":
        if score < 90:
            return True
        # Phase 3: score can sit at 90–94 with a missing critical field — still follow up
        try:
            from extraction_router import disputed_fields

            if disputed_fields(data_dict, text_layer=text_layer):
                return True
        except Exception:
            pass
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
    Shared PDF/image prep (Phase 2):
    - text-rich PDF → markdown
    - hard PDF → hybrid markdown + compact image (or vision JPEG)
    - adaptive DPI, blank-page skip, best-page scorer
    """
    from preprocess import preprocess_image, preprocess_pdf

    if mime_type == "application/pdf":
        return preprocess_pdf(content, password=password)
    if mime_type.startswith("image/"):
        return preprocess_image(content, mime_type)
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
    if mime_type == HYBRID_MIME:
        from preprocess import decode_hybrid

        hybrid = decode_hybrid(content)
        parts: list[dict] = [
            {
                "type": "text",
                "text": (
                    "Here is the OCR/text layer from the invoice. "
                    "Use it to ground numbers; also inspect the image.\n\n"
                    f"{hybrid['markdown']}"
                ),
            }
        ]
        if hybrid["image_bytes"]:
            b64 = base64.b64encode(hybrid["image_bytes"]).decode("utf-8")
            parts.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{hybrid['image_mime']};base64,{b64}",
                    },
                }
            )
        return parts
    raw = content if isinstance(content, (bytes, bytearray)) else content.encode("utf-8")
    base64_image = base64.b64encode(raw).decode("utf-8")
    image_url = f"data:{mime_type};base64,{base64_image}"
    return [{"type": "image_url", "image_url": {"url": image_url}}]


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=6))
async def _parse_with_model(ai_client: AsyncOpenAI, model: str, prompt: str, messages_content: list):
    """Single-model structured parse with pinned decode + timeout."""
    async def _call():
        return await ai_client.beta.chat.completions.parse(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [{"type": "text", "text": prompt}] + messages_content,
                }
            ],
            response_format=InvoiceData,
            temperature=LLM_TEMPERATURE,
            max_tokens=LLM_MAX_TOKENS,
            timeout=LLM_TIMEOUT_S,
        )

    try:
        response = await asyncio.wait_for(_call(), timeout=LLM_TIMEOUT_S + 15.0)
    except asyncio.TimeoutError as te:
        raise TimeoutError(
            f"LLM parse timed out after {LLM_TIMEOUT_S}s (model={model})"
        ) from te

    extracted_data = response.choices[0].message.parsed
    if not extracted_data:
        raise ValueError(f"Failed to parse structured output from model {model}")
    tokens = response.usage.total_tokens if response.usage else 0
    return extracted_data.model_dump(), tokens


def _ledger_fingerprint(tally_ledgers: list | None) -> str:
    if not tally_ledgers:
        return ""
    return ",".join(sorted(str(x) for x in tally_ledgers))


def _text_layer_from_content(content: bytes | str, mime_type: str) -> str | None:
    if mime_type == "text/markdown" and isinstance(content, str):
        return content
    if mime_type == HYBRID_MIME:
        from preprocess import hybrid_text_layer

        return hybrid_text_layer(content)
    return None


def _apply_ocr_grounding(
    content: bytes | str,
    mime_type: str,
    text_layer: str | None,
) -> tuple[str | None, dict, list | None]:
    """
    Phase B: optional classical OCR → richer text_layer + word boxes.

    Returns (merged_text_layer, ocr_meta, ocr_words_payload|None).
    Never raises; OCR errors become meta.ocr_error and leave text_layer unchanged.
    """
    from ocr.grounding import (
        merge_text_layers,
        should_run_ocr,
        try_ocr_analyze,
        words_to_payload,
    )

    if not should_run_ocr(mime_type, text_layer):
        return text_layer, {"ocr_used": False}, None

    result, meta = try_ocr_analyze(content, mime_type)
    if result is None or result.is_empty():
        return text_layer, meta, None

    merged = merge_text_layers(text_layer, result.text)
    words = words_to_payload(result.words, page_dims=result.page_dims)
    meta["ocr_grounding"] = True
    if result.page_dims:
        # First page dims for UI fallback when words lack n=true
        p1 = result.page_dims.get(1) or next(iter(result.page_dims.values()), None)
        if p1:
            meta["ocr_page_width"] = p1[0]
            meta["ocr_page_height"] = p1[1]
    return merged, meta, words


def _qr_seed_from_content(content: bytes | str, mime_type: str):
    """Best-effort GST e-invoice QR/IRN seed; None if disabled, absent, or deps missing."""
    try:
        from qr_decode import (
            QR_DECODE_ENABLED,
            image_bytes_from_content,
            seed_from_image,
        )

        if not QR_DECODE_ENABLED:
            return None
        image_bytes = image_bytes_from_content(content, mime_type)
        if not image_bytes:
            return None
        return seed_from_image(image_bytes)
    except Exception as e:  # noqa: BLE001 - QR is an optional accelerator
        logger.debug("QR seed extraction skipped: %s", e)
        return None


async def run_ai_extraction(
    content: bytes | str,
    mime_type: str,
    tally_ledgers: list | None = None,
    ops_ctx: dict | None = None,
):
    """
    Phase 3 routing:
    - easy (text-rich) → AI_MODEL_PRIMARY; escalate / targeted as needed
    - hard (image/hybrid) → AI_MODEL_VERIFY first (skip mini); optional Gemini if gated
    - needs_review with few disputed fields → targeted re-extract (cheaper than full verify)

    Optional ops_ctx (from ops_log.build_ops_ctx) enables proactive ops logging.
    """
    import extraction_cache
    from extraction_meta import attach_scan_meta, estimate_cost_inr
    from extraction_router import (
        better_result,
        build_targeted_prompt,
        disputed_fields,
        merge_targeted_fields,
        plan_route,
        prefer_targeted_reextract,
        route_fingerprint,
    )

    if not client or not AI_MODEL_PRIMARY:
        raise HTTPException(
            status_code=500,
            detail="Missing API Key. Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env.",
        )

    if ops_ctx is not None and mime_type and not ops_ctx.get("mime_type"):
        ops_ctx = {**ops_ctx, "mime_type": mime_type}

    prompt = _build_prompt(tally_ledgers)
    messages_content = _messages_content(content, mime_type)
    text_layer = _text_layer_from_content(content, mime_type)
    # Phase B: classical OCR grounding (env-gated; never fails the scan)
    text_layer, ocr_meta, ocr_words = _apply_ocr_grounding(
        content, mime_type, text_layer
    )
    qr_seed = _qr_seed_from_content(content, mime_type)

    # Phase D: vendor memory (soft hints before LLM; exact rules after extract)
    vendor_rules: list = []
    vendor_gstin_early = None
    try:
        from vendor_memory import (
            VENDOR_MEMORY_ENABLED,
            apply_exact_rules,
            build_prompt_hints,
            early_vendor_gstin,
            fetch_rules,
            snapshot_fields,
        )

        if VENDOR_MEMORY_ENABLED and ops_ctx:
            vendor_gstin_early = early_vendor_gstin(
                qr_seed=qr_seed, text_layer=text_layer
            )
            org_id = ops_ctx.get("org_id")
            sc = ops_ctx.get("supabase_client")
            if org_id and sc and vendor_gstin_early:
                vendor_rules = await fetch_rules(
                    sc, org_id=org_id, vendor_gstin=vendor_gstin_early
                )
                hint_block = build_prompt_hints(vendor_rules)
                if hint_block:
                    prompt = f"{prompt}{hint_block}"
    except Exception as e:  # noqa: BLE001
        logger.debug("Vendor memory preload skipped: %s", e)
        vendor_rules = []

    route = plan_route(mime_type, text_layer)
    total_tokens = 0
    started = time.monotonic()

    ocr_fp = "ocr1" if ocr_meta.get("ocr_used") else "ocr0"
    mem_fp = f"vm{len(vendor_rules)}" if vendor_rules else "vm0"
    cache_key = extraction_cache.make_cache_key(
        content=content,
        mime_type=mime_type,
        primary_model=AI_MODEL_PRIMARY,
        verify_model=AI_MODEL_VERIFY,
        prompt_version=PROMPT_VERSION,
        ledger_fingerprint=(
            f"{_ledger_fingerprint(tally_ledgers)}|{route_fingerprint(route)}|{ocr_fp}|{mem_fp}"
        ),
    )

    async def _latency_ms() -> int:
        return int((time.monotonic() - started) * 1000)

    def _attach_route(data_dict: dict) -> None:
        data_dict["Route_Tier"] = route.tier
        data_dict["Route_First_Pass"] = route.first_pass
        data_dict["Route_Reason"] = route.reason

    async def _finalize(data_dict: dict, tokens: int, *, hit: bool) -> tuple[dict, int]:
        if qr_seed is not None:
            # Government-signed QR fields are authoritative: overlay then
            # re-run tax/confidence so Extraction_State reflects the truth.
            from qr_decode import apply_qr_seed

            apply_qr_seed(data_dict, qr_seed)
            apply_tax_calculations(data_dict)

        # Phase D: deterministic vendor rules (post-LLM / post-QR)
        try:
            from vendor_memory import (
                VENDOR_MEMORY_ENABLED,
                apply_exact_rules,
                fetch_rules,
                snapshot_fields,
            )
            from validators import normalize_gstin

            if VENDOR_MEMORY_ENABLED:
                rules = list(vendor_rules)
                gstin = normalize_gstin(data_dict.get("Supplier_GSTIN")) or vendor_gstin_early
                org_id = (ops_ctx or {}).get("org_id")
                sc = (ops_ctx or {}).get("supabase_client")
                if org_id and sc and gstin and not rules:
                    rules = await fetch_rules(sc, org_id=org_id, vendor_gstin=gstin)
                applied = apply_exact_rules(data_dict, rules) if rules else []
                if applied:
                    apply_tax_calculations(data_dict)
                    data_dict["Vendor_Memory_Applied"] = applied
            # Snapshot after AI + QR + memory — baseline for CA edit learning
            from vendor_memory import snapshot_fields as _snap

            data_dict["Extraction_Snapshot"] = _snap(data_dict)
        except Exception as e:  # noqa: BLE001
            logger.debug("Vendor memory apply skipped: %s", e)

        _attach_route(data_dict)
        attach_scan_meta(
            data_dict,
            tokens=tokens,
            cache_hit=hit,
            text_layer=text_layer,
            prompt_version=PROMPT_VERSION,
            latency_ms=await _latency_ms(),
        )
        meta = data_dict.get("Scan_Meta")
        if isinstance(meta, dict):
            meta["route_tier"] = route.tier
            meta["route_first_pass"] = route.first_pass
            meta["route_reason"] = route.reason
            if ocr_meta:
                meta.update(ocr_meta)
        if ocr_words:
            # Compact word boxes for Phase C review UI (dropped before DB write).
            data_dict["Ocr_Words"] = ocr_words
            data_dict["Ocr_Provider"] = (ocr_meta or {}).get("ocr_provider")
        # Phase C: typed reasons for the review queue / field highlighting
        try:
            from review_reasons import build_review_reasons, flagged_fields

            reasons = build_review_reasons(
                data_dict,
                text_layer=text_layer,
                field_confidence=data_dict.get("Field_Confidence"),
            )
            data_dict["Review_Reasons"] = reasons
            data_dict["Review_Fields"] = flagged_fields(reasons)
        except Exception as e:  # noqa: BLE001
            logger.debug("Review reasons skipped: %s", e)
        await log_extraction_quality(
            ops_ctx,
            data_dict,
            tokens_used=tokens,
            latency_ms=await _latency_ms(),
        )
        if ops_ctx is not None:
            await log_from_ctx(
                ops_ctx,
                severity="info",
                event_type="scan_cost",
                message="Per-scan token/INR estimate",
                extraction_state=data_dict.get("Extraction_State"),
                confidence_score=data_dict.get("Confidence_Score"),
                model_used=data_dict.get("Extraction_Model"),
                tokens_used=tokens,
                latency_ms=await _latency_ms(),
                meta={
                    "estimated_cost_inr": estimate_cost_inr(tokens),
                    "cache_hit": hit,
                    "prompt_version": PROMPT_VERSION,
                    "avg_field_confidence": (data_dict.get("Field_Confidence") or {}).get(
                        "avg_critical_score"
                    ),
                    "route_tier": route.tier,
                    "route_first_pass": route.first_pass,
                },
            )
        return data_dict, tokens

    def _resolve_first() -> tuple[Any, str]:
        if route.first_pass == "gemini":
            if gemini_client and GEMINI_MODEL:
                return gemini_client, GEMINI_MODEL
            # Fall back to verify / primary if Gemini not configured
            if AI_MODEL_VERIFY:
                return client, AI_MODEL_VERIFY
            return client, AI_MODEL_PRIMARY
        if route.first_pass == "verify" and AI_MODEL_VERIFY:
            return client, AI_MODEL_VERIFY
        return client, AI_MODEL_PRIMARY

    async def _transport_fallback(primary_e: Exception, failed_model: str) -> tuple[dict, int]:
        await log_from_ctx(
            ops_ctx,
            severity="warning",
            event_type="ai_primary_failure",
            message=str(primary_e),
            model_used=failed_model,
            latency_ms=await _latency_ms(),
            meta={"fallback": "gemini" if gemini_client else "none", "route": route.tier},
        )
        if not gemini_client or not GEMINI_MODEL:
            await log_from_ctx(
                ops_ctx,
                severity="error",
                event_type="ai_failure",
                message=f"Primary failed, no Gemini fallback: {primary_e}",
                model_used=failed_model,
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
            data_dict = apply_tax_calculations(data_dict)
            data_dict["Extraction_Model"] = GEMINI_MODEL
            return data_dict, tokens
        except Exception as gemini_e:
            await log_from_ctx(
                ops_ctx,
                severity="error",
                event_type="ai_failure",
                message=f"Primary: {primary_e}; Fallback: {gemini_e}",
                model_used=GEMINI_MODEL,
                tokens_used=total_tokens,
                latency_ms=await _latency_ms(),
                meta={"primary_model": failed_model},
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Both primary and fallback AI failed. "
                    f"Primary: {primary_e}, Fallback: {gemini_e}"
                ),
            ) from gemini_e

    async def _targeted_pass(data_dict: dict) -> tuple[dict, int]:
        fields = disputed_fields(data_dict, text_layer=text_layer)
        if not fields:
            return data_dict, 0
        t_prompt = build_targeted_prompt(prompt, fields)
        model = AI_MODEL_VERIFY or AI_MODEL_PRIMARY
        patch, tokens = await _parse_with_model(
            client, model, t_prompt, messages_content
        )
        merged = merge_targeted_fields(data_dict, patch, fields)
        merged = apply_tax_calculations(merged)
        merged["Extraction_Model"] = model
        merged["Escalated"] = True
        if better_result(merged, data_dict):
            return merged, tokens
        data_dict["Escalated"] = True
        data_dict["Targeted_Fields"] = fields
        data_dict["Targeted_Reextract"] = True
        data_dict["Verify_Score"] = merged.get("Confidence_Score")
        return data_dict, tokens

    async def _full_verify(data_dict: dict) -> tuple[dict, int]:
        if not AI_MODEL_VERIFY:
            return data_dict, 0
        verify_dict, v_tokens = await _parse_with_model(
            client, AI_MODEL_VERIFY, prompt, messages_content
        )
        verify_dict = apply_tax_calculations(verify_dict)
        verify_dict["Extraction_Model"] = AI_MODEL_VERIFY
        verify_dict["Escalated"] = True
        if better_result(verify_dict, data_dict):
            return verify_dict, v_tokens
        data_dict["Escalated"] = True
        data_dict["Verify_Score"] = verify_dict.get("Confidence_Score")
        return data_dict, v_tokens

    if EXTRACTION_CACHE_ENABLED:
        cached = extraction_cache.get(cache_key)
        if cached is not None:
            data_dict, tokens = cached
            data_dict = dict(data_dict)
            data_dict["Cache_Hit"] = True
            return await _finalize(data_dict, tokens, hit=True)

    async with get_ai_semaphore():
        first_client, first_model = _resolve_first()
        try:
            data_dict, tokens = await _parse_with_model(
                first_client, first_model, prompt, messages_content
            )
            total_tokens += tokens
            data_dict = apply_tax_calculations(data_dict)
            data_dict["Extraction_Model"] = first_model
        except Exception as primary_e:
            logger.warning(
                "First-pass model %s failed: %s. Trying Gemini transport fallback...",
                first_model,
                primary_e,
            )
            # Avoid double-Gemini if first pass was already Gemini
            if first_client is gemini_client:
                raise HTTPException(
                    status_code=500,
                    detail=f"Gemini extraction failed: {primary_e}",
                ) from primary_e
            data_dict, tokens = await _transport_fallback(primary_e, first_model)
            total_tokens += tokens
            data_dict["Cache_Hit"] = False
            if EXTRACTION_CACHE_ENABLED:
                extraction_cache.put(cache_key, data_dict, total_tokens)
            return await _finalize(data_dict, total_tokens, hit=False)

        # Follow-up: targeted or full verify when trust gate fails
        if should_escalate(data_dict, text_layer=text_layer) and route.allow_targeted_followup:
            try:
                used_strong_first = route.first_pass in ("verify", "gemini")
                if prefer_targeted_reextract(data_dict, text_layer):
                    data_dict, extra = await _targeted_pass(data_dict)
                    total_tokens += extra
                elif not used_strong_first and AI_MODEL_VERIFY:
                    data_dict, extra = await _full_verify(data_dict)
                    total_tokens += extra
            except Exception as follow_e:
                logger.warning(
                    "Follow-up extract failed (keeping first pass): %s",
                    follow_e,
                )
                data_dict["Escalated"] = False
                await log_from_ctx(
                    ops_ctx,
                    severity="warning",
                    event_type="verify_failure",
                    message=str(follow_e),
                    extraction_state=data_dict.get("Extraction_State"),
                    confidence_score=data_dict.get("Confidence_Score"),
                    model_used=AI_MODEL_VERIFY,
                    tokens_used=total_tokens,
                    latency_ms=await _latency_ms(),
                    meta={
                        **field_presence_flags(data_dict),
                        "kept_primary": True,
                        "route_tier": route.tier,
                    },
                )

        data_dict["Cache_Hit"] = False
        if EXTRACTION_CACHE_ENABLED:
            extraction_cache.put(cache_key, data_dict, total_tokens)
        return await _finalize(data_dict, total_tokens, hit=False)


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
    for drop_key in (
        "extraction_model",
        "escalated",
        "verify_score",
        "financial_ok",
        "field_confidence",
        "scan_meta",
        "estimated_cost_inr",
        "cache_hit",
        "route_tier",
        "route_first_pass",
        "route_reason",
        "targeted_fields",
        "targeted_reextract",
        "qr_verified",
        "qr_source",
        "qr_confirmed_fields",
        "qr_overridden_fields",
        "qr_item_count",
        "qr_main_hsn",
        "ocr_words",
        "ocr_provider",
        "review_reasons",
        "review_fields",
        "extraction_snapshot",
        "vendor_memory_applied",
    ):
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
