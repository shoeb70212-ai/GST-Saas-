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

load_dotenv()

app = FastAPI(title="InvoiceScanner AI Backend")

# Allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
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
    Confidence_Score: float | None = Field(description="A score from 0.0 to 100.0 indicating how confident you are in the overall extraction accuracy. If the image is blurry, handwritten, or ambiguous, return a lower score. Return 95-100 for perfect digital invoices.")
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
    Bank_Name: str | None = Field(description="Bank name")
    Branch_Name: str | None = Field(description="Bank branch name")
    IFSC_Code: str | None = Field(description="Bank IFSC code")
    UPI_ID: str | None = Field(description="UPI ID for payment")
    Line_Items: list[LineItem] = Field(default_factory=list, description="List of all items or services in the invoice")

@app.get("/")
def read_root():
    return {"status": "InvoiceScanner Backend is running."}

@app.post("/api/scan-invoice")
async def scan_invoice(file: UploadFile = File(...), authorization: str = Header(None)):
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
            f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}&select=credits",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        if profile_resp.status_code != 200 or not profile_resp.json():
            raise HTTPException(status_code=500, detail="Failed to fetch user profile.")
            
        credits = profile_resp.json()[0].get("credits", 0)
        if credits <= 0:
            raise HTTPException(status_code=402, detail="Insufficient credits. Please recharge your wallet.")

    content = await file.read()
    
    # Check if it's a PDF and convert to image
    mime_type = file.content_type
    if mime_type == "application/pdf":
        try:
            from pdf2image import convert_from_bytes
            # Poppler needs to be installed on the system
            pages = convert_from_bytes(content)
            if not pages:
                raise HTTPException(status_code=400, detail="Could not read PDF pages.")
            # Take the first page for now
            first_page = pages[0]
            img_byte_arr = io.BytesIO()
            first_page.save(img_byte_arr, format='JPEG')
            content = img_byte_arr.getvalue()
            mime_type = "image/jpeg"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to process PDF. Make sure poppler is installed on the system. Error: {str(e)}")

    base64_image = base64.b64encode(content).decode('utf-8')
    image_url = f"data:{mime_type};base64,{base64_image}"

    prompt = """
    You are an expert Indian Chartered Accountant assistant. 
    Analyze the following invoice image and extract the requested fields perfectly, including all line items.
    Pay close attention to image clarity and provide an accurate Confidence_Score between 0 and 100.
    """

    try:
        response = await client.beta.chat.completions.parse(
            model=AI_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ],
            response_format=InvoiceData,
        )
        
        extracted_data = response.choices[0].message.parsed
        if not extracted_data:
            raise HTTPException(status_code=500, detail="Failed to parse structured output from primary AI.")
            
        data_dict = extracted_data.model_dump()
        
        # --- STRATEGY 1: BACKEND MATH ---
        # Calculate taxes and totals locally to save AI generation tokens & speed up processing
        taxable = sum((item.get("Amount") or 0) for item in data_dict.get("Line_Items", []))
        cgst = 0
        sgst = 0
        igst = 0
        
        sup_gstin = data_dict.get("Supplier_GSTIN")
        buy_gstin = data_dict.get("Buyer_GSTIN")
        is_interstate = False
        if sup_gstin and buy_gstin and len(sup_gstin) >= 2 and len(buy_gstin) >= 2:
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
        
        if not data_dict.get("Total_Amount"):
            data_dict["Total_Amount"] = round(taxable + cgst + sgst + igst + (data_dict.get("Round_Off") or 0), 2)
            
        # Deduct Credit
        async with httpx.AsyncClient() as http_client:
            await http_client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"credits": credits - 1}
            )
            
        return {"status": "success", "data": data_dict}
        
    except Exception as e:
        print(f"Primary AI failed with error: {e}. Attempting fallback to Gemini...")
        if gemini_client:
            try:
                response = await gemini_client.beta.chat.completions.parse(
                    model=GEMINI_MODEL,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {"type": "image_url", "image_url": {"url": image_url}}
                            ]
                        }
                    ],
                    response_format=InvoiceData,
                )
                
                extracted_data = response.choices[0].message.parsed
                if not extracted_data:
                    raise HTTPException(status_code=500, detail="Failed to parse structured output from Gemini.")
                    
                data_dict = extracted_data.model_dump()
                
                # --- STRATEGY 1: BACKEND MATH ---
                taxable = sum((item.get("Amount") or 0) for item in data_dict.get("Line_Items", []))
                cgst = 0; sgst = 0; igst = 0
                sup_gstin = data_dict.get("Supplier_GSTIN")
                buy_gstin = data_dict.get("Buyer_GSTIN")
                is_interstate = False
                if sup_gstin and buy_gstin and len(sup_gstin) >= 2 and len(buy_gstin) >= 2:
                    if sup_gstin[:2] != buy_gstin[:2]:
                        is_interstate = True
                for item in data_dict.get("Line_Items", []):
                    amt = item.get("Amount") or 0
                    rate = item.get("Tax_Rate") or 0
                    tax_val = amt * (rate / 100)
                    if is_interstate: igst += tax_val
                    else: cgst += tax_val / 2; sgst += tax_val / 2
                        
                data_dict["Taxable_Amount"] = taxable
                data_dict["CGST_Amount"] = round(cgst, 2)
                data_dict["SGST_Amount"] = round(sgst, 2)
                data_dict["IGST_Amount"] = round(igst, 2)
                if not data_dict.get("Total_Amount"):
                    data_dict["Total_Amount"] = round(taxable + cgst + sgst + igst + (data_dict.get("Round_Off") or 0), 2)
                    
                # Deduct Credit
                async with httpx.AsyncClient() as http_client:
                    await http_client.patch(
                        f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}",
                        headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                        json={"credits": credits - 1}
                    )
                    
                return {"status": "success", "data": data_dict, "source": "gemini"}
            except Exception as gemini_e:
                raise HTTPException(status_code=500, detail=f"Both primary AI and Gemini fallback failed. Gemini Error: {str(gemini_e)}")
        else:
            raise HTTPException(status_code=500, detail=f"Error communicating with OpenAI (no fallback available): {str(e)}")
