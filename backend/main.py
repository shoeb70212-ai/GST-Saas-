import os
import base64
import json
import io
import httpx
from fastapi import FastAPI, File, UploadFile, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from openai import AsyncOpenAI
import re
from tenacity import retry, stop_after_attempt, wait_exponential
from utils import validate_file_content

def compute_confidence(extracted: dict, computed_total: float) -> dict:
    """
    Evaluates the reliability of the AI-extracted invoice data.
    
    Starts with a perfect score of 100 and applies penalties based on missing 
    or malformed critical fields. This score determines whether an invoice 
    is auto-accepted, needs manual review, or completely failed.
    
    Args:
        extracted (dict): The raw data dictionary returned by the LLM.
        computed_total (float): The mathematically verified total amount.
        
    Returns:
        dict: A dictionary containing the numeric 'score' and string 'state'.
    """
    score = 100.0
    penalties = 0.0
    
    supplier_gstin = extracted.get("Supplier_GSTIN")
    if supplier_gstin:
        if not re.match(r'^(0[1-9]|[1-2][0-9]|3[0-7])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][A-Z0-9][0-9A-Z]$', supplier_gstin.upper()):
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
    
    Args:
        data_dict (dict): The partially populated invoice data.
        
    Returns:
        dict: The updated data dictionary with precise tax amounts and confidence scores.
    """
    taxable = sum((item.get("Amount") or 0) for item in data_dict.get("Line_Items", []))
    cgst = 0
    sgst = 0
    igst = 0
    
    sup_gstin = data_dict.get("Supplier_GSTIN")
    buy_gstin = data_dict.get("Buyer_GSTIN")
    is_interstate = False
    
    # Check GSTIN state codes (first 2 digits) to determine intra-state vs inter-state
    if sup_gstin and buy_gstin and len(sup_gstin) >= 2 and len(buy_gstin) >= 2:
        if sup_gstin[:2] != buy_gstin[:2]:
            is_interstate = True
            
    # Distribute the tax percentage from line items into the correct GST buckets
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
    
    computed_total = round(taxable + cgst + sgst + igst + (data_dict.get("Cess_Amount") or 0) + (data_dict.get("Round_Off") or 0), 2)
    if not data_dict.get("Total_Amount"):
        data_dict["Total_Amount"] = computed_total
        
    confidence = compute_confidence(data_dict, computed_total)
    data_dict["Confidence_Score"] = confidence["score"]
    data_dict["Extraction_State"] = confidence["state"]
    
    return data_dict

load_dotenv()

from fastapi import FastAPI, File, UploadFile, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ... (skipped unchanged lines) ...

app = FastAPI(title="InvoiceScanner AI Backend")

# 1. Strict Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"
    return response

# 2. Strict CORS Middleware
# Actively avoiding negative impact: Whitelisting localhost for development, but blocking everything else
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://gst-saas.vercel.app" # Placeholder for actual prod URL
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

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
    Expense_Category: str | None = Field(description="Suggested accounting ledger category. Must match one of the provided custom ledgers if available, otherwise infer from items.")
    HSN_Audit_Warning: str | None = Field(description="If any extracted HSN code strongly mismatches the item description based on standard Indian GST rules, provide a brief warning here. Otherwise, leave null.")
    Bank_Name: str | None = Field(description="Bank name")
    Branch_Name: str | None = Field(description="Bank branch name")
    IFSC_Code: str | None = Field(description="Bank IFSC code")
    UPI_ID: str | None = Field(description="UPI ID for payment")
    Invoice_Type: str | None = Field(description="One of: 'Tax Invoice', 'Bill of Supply', 'Credit Note', 'Debit Note', 'Export Invoice' - read from heading only. Default 'Tax Invoice' if no other type is legible; otherwise null.")
    Reverse_Charge_Applicable: bool | None = Field(description="Only from an explicit printed line such as 'Reverse Charge: Yes/No'. Do not infer.")
    Cess_Amount: float | None = Field(description="Read directly from a printed 'Cess' line/total. Do not calculate.")
    IRN: str | None = Field(description="64-character Invoice Reference Number. Null if absent.")
    Original_Invoice_Number: str | None = Field(description="Only populate when Invoice_Type is Credit Note or Debit Note - the invoice number being adjusted.")
    Original_Invoice_Date: str | None = Field(description="Paired with Original_Invoice_Number, same format as Invoice_Date.")
    Line_Items: list[LineItem] = Field(default_factory=list, description="List of all items or services in the invoice")

@app.get("/")
def read_root():
    return {"status": "InvoiceScanner Backend is running."}

@app.post("/api/scan-invoice")
async def scan_invoice(file: UploadFile = File(...), authorization: str = Header(None)):
    """
    Primary endpoint for processing single invoice files (PDF/Images).
    
    Workflow:
    1. Authenticates the user via Supabase JWT.
    2. Checks if the user has sufficient credits in their profile.
    3. Validates the file (magic bytes & size).
    4. Runs AI extraction (`run_ai_extraction`) to parse data.
    5. Checks the vendor GSTIN against the KYC Cache (Supabase RPC).
    6. Deducts 1 credit from the user's account.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="Missing Supabase configuration in .env.")
        
    if not client:
        raise HTTPException(status_code=500, detail="Missing API Key. Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env.")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized. Missing or invalid Authorization header.")
        
    token = authorization.split(" ")[1]
    
    # 1. Verify User and Get Profile
    async with httpx.AsyncClient() as http_client:
        # Get User
        user_resp = await http_client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session token.")
            
        user_id = user_resp.json().get("id")
        
        # Get Profile
        profile_resp = await http_client.get(
            f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}&select=credits,tally_ledgers",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        tally_ledgers = None
        if profile_resp.status_code == 200 and profile_resp.json():
            p_data = profile_resp.json()[0]
            credits = p_data.get("credits", 0)
            tally_ledgers = p_data.get("tally_ledgers")
        else:
            credits = 0 # Fallback if profile row is missing
        if credits <= 0:
            raise HTTPException(status_code=402, detail="Insufficient credits. Please recharge your wallet.")

    content = await file.read()
    
    # Security: Validate file content (magic bytes and size)
    mime_type = validate_file_content(content, file.filename)
    
    def process_file_sync(c_bytes, m_type):
        if m_type == "application/pdf":
            import fitz
            from PIL import Image
            import io
            doc = fitz.open(stream=c_bytes, filetype="pdf")
            if not doc:
                raise ValueError("Could not read PDF pages.")
            
            # AI COST OPTIMIZATION: Try extracting structured Markdown for digital PDFs
            try:
                import pymupdf4llm
                md_text = pymupdf4llm.to_markdown(doc)
                if md_text and "|" in md_text and len(md_text) > 100:
                    # Successfully extracted tabular markdown, bypass JPEG rendering
                    return md_text, "text/markdown"
            except Exception as e:
                print(f"Markdown extraction failed or skipped: {e}")
            
            gst_keywords = ["gstin", "invoice", "taxable", "cgst", "sgst", "igst", "hsn", "total", "amount", "qty", "rate"]
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
                combined = Image.new('RGB', (max_width, total_height), (255, 255, 255))
                y_offset = 0
                for img in images:
                    combined.paste(img, (0, y_offset))
                    y_offset += img.height
                
                output = io.BytesIO()
                combined.save(output, format="JPEG", quality=85)
                return output.getvalue(), "image/jpeg"
        elif m_type.startswith("image/"):
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(c_bytes))
            if img.width <= 2048 and img.height <= 2048 and img.format == 'JPEG':
                return c_bytes, m_type
            else:
                if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                    bg = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'RGBA':
                        bg.paste(img, mask=img.split()[3])
                    else:
                        bg.paste(img.convert('RGBA'), mask=img.convert('RGBA').split()[3])
                    img = bg
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                img.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                img.save(output, format="JPEG", quality=85)
                return output.getvalue(), "image/jpeg"
        return c_bytes, m_type

    import asyncio
    # Limit concurrent PDF/Image processing using a lazy global semaphore
    global _file_processing_semaphore
    if '_file_processing_semaphore' not in globals() or _file_processing_semaphore is None:
        _file_processing_semaphore = asyncio.Semaphore(4)
        
    async with _file_processing_semaphore:
        try:
            content, mime_type = await asyncio.to_thread(process_file_sync, content, mime_type)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to process file. Error: {str(e)}")

    try:
        data_dict = await run_ai_extraction(content, mime_type, tally_ledgers)
        
        # Verify GSTIN if it exists
        gstin = data_dict.get("Supplier_GSTIN")
        if gstin:
            from supabase import create_async_client
            sc = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
            sc.postgrest.auth(token)
            from gstin_service import verify_gstin
            data_dict["Supplier_GSTIN_Status"] = await verify_gstin(sc, gstin)
            
            # Deep Duplicate Detection Check
            inv_num = data_dict.get("Invoice_Number")
            if inv_num:
                dup_resp = await sc.table("invoices").select("id").eq("user_id", user_id).eq("supplier_gstin", gstin).eq("invoice_number", inv_num).execute()
                if dup_resp.data and len(dup_resp.data) > 0:
                    data_dict["Extraction_State"] = "duplicate_warning"
            
        # Deduct Credit (Atomic RPC)
        async with httpx.AsyncClient() as http_client:
            rpc_resp = await http_client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/decrement_credits",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"user_id_param": user_id}
            )
            if rpc_resp.status_code != 200:
                print(f"Failed to deduct credits. RPC response: {rpc_resp.text}")
                
        return {"status": "success", "data": data_dict}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def run_ai_extraction(content: bytes | str, mime_type: str, tally_ledgers: list = None):
    # Prepare LLM message content based on input type (text vs image)
    messages_content = []
    
    if mime_type == "text/markdown" and isinstance(content, str):
        messages_content.append({"type": "text", "text": f"Here is the raw text extracted from the invoice document:\n\n{content}"})
    else:
        # Fallback to image-based extraction
        base64_image = base64.b64encode(content).decode('utf-8')
        image_url = f"data:{mime_type};base64,{base64_image}"
        messages_content.append({"type": "image_url", "image_url": {"url": image_url}})

    ledger_instruction = ""
    if tally_ledgers:
        ledger_instruction = f"\nCRITICAL: For Expense_Category, you MUST choose exactly one of the following ledgers: {', '.join(tally_ledgers)}. If none fit, choose 'Other'."

    prompt = f"""
    You are an expert Indian Chartered Accountant assistant. 
    Analyze the following invoice image and extract the requested fields perfectly, including all line items.
    DO NOT hallucinate optional fields like PO_Number, E_Way_Bill_Number, Vehicle_Number, or Bank details. If they are not explicitly printed, return null.
    For the Expense_Category field, suggest a standard accounting ledger category based on the line items.{ledger_instruction}
    Only extract what is literally printed on the document for Invoice_Type, Reverse_Charge_Applicable, Cess_Amount, and IRN. Do not infer them.
    Only populate Original_Invoice_Number and Original_Invoice_Date for Credit/Debit Notes.
    For HSN_Audit_Warning, check if the HSN codes mathematically and logically align with the item descriptions. Flag any obvious errors.
    """

    try:
        response = await client.beta.chat.completions.parse(
            model=AI_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [{"type": "text", "text": prompt}] + messages_content
                }
            ],
            response_format=InvoiceData,
        )
        
        extracted_data = response.choices[0].message.parsed
        if not extracted_data:
            raise HTTPException(status_code=500, detail="Failed to parse structured output from primary AI.")
            
        data_dict = extracted_data.model_dump()
        
        # Apply refactored tax and confidence calculations
        data_dict = apply_tax_calculations(data_dict)
        
        return data_dict
        
    except Exception as e:
        print(f"Primary AI failed with error: {e}. Attempting fallback to Gemini...")
        if gemini_client:
            try:
                response = await gemini_client.beta.chat.completions.parse(
                    model=GEMINI_MODEL,
                    messages=[
                        {
                            "role": "user",
                            "content": [{"type": "text", "text": prompt}] + messages_content
                        }
                    ],
                    response_format=InvoiceData,
                )
                
                extracted_data = response.choices[0].message.parsed
                if not extracted_data:
                    raise HTTPException(status_code=500, detail="Failed to parse structured output from Gemini.")
                    
                data_dict = extracted_data.model_dump()
                
                # Apply refactored tax and confidence calculations
                data_dict = apply_tax_calculations(data_dict)
                
                return data_dict
            except Exception as gemini_e:
                raise HTTPException(status_code=500, detail=f"Both primary AI and Gemini fallback failed. Gemini Error: {str(gemini_e)}")
        else:
            raise HTTPException(status_code=500, detail=f"Error communicating with OpenAI (no fallback available): {str(e)}")

# from auth_routes import router as auth_router
from admin_routes import router as admin_router
from batch_routes import router as batch_router
from reconcile_routes import router as reconcile_router
from payment_routes import router as payment_router
from public_routes import router as public_router

# app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(batch_router, prefix="/api/batch", tags=["batch"])
app.include_router(reconcile_router, prefix="/api/reconcile", tags=["reconcile"])
app.include_router(payment_router, prefix="/api", tags=["payments"])
app.include_router(public_router, prefix="/api/public", tags=["public"])
