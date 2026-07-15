import os
import io
import fitz # PyMuPDF
import pymupdf4llm
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from typing import Optional
from supabase import create_async_client
import json

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if OPENAI_API_KEY:
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
else:
    client = None

class BankTransaction(BaseModel):
    txn_date: Optional[str] = Field(description="Date of transaction in YYYY-MM-DD format. Return null if blurry, missing, or ambiguous.")
    description: Optional[str] = Field(description="Transaction description or narration. Merge multi-line narrations. Return null if completely illegible.")
    reference_no: Optional[str] = Field(description="Reference or UTR number if present.")
    cheque_number: Optional[str] = Field(description="Cheque number if explicitly labeled.")
    withdrawal: Optional[float] = Field(description="Debit or withdrawal amount. Return null if blurry or ambiguous.")
    deposit: Optional[float] = Field(description="Credit or deposit amount. Return null if blurry or ambiguous.")
    balance: Optional[float] = Field(description="Running balance amount. Return null if blurry or ambiguous.")

class BankStatementExtract(BaseModel):
    account_number: Optional[str] = Field(description="The bank account number for these transactions. Useful if multiple accounts are present.")
    bank_name: Optional[str] = Field(description="The name of the bank (e.g., HDFC, SBI).")
    transactions: list[BankTransaction] = Field(description="List of transactions extracted. If the page has no transaction tables, return an empty list.")

async def extract_bank_statement_chunk(md_text: str, statement_period: str) -> BankStatementExtract:
    if not client:
        raise Exception("OpenAI API Key is required for GPT-4o-mini.")
        
    prompt = f"""
    You are an expert Indian Chartered Accountant assistant.
    Extract the tabular bank statement transactions from the provided markdown text.
    
    CRITICAL INSTRUCTIONS:
    1. THE ZERO HALLUCINATION MANDATE: If any number, date, or description is blurry, missing, or ambiguous, you MUST return null. Do NOT attempt to guess or hallucinate.
    2. STATEMENT PERIOD: The statement period is {statement_period}. Use this to determine the correct year for dates if only day/month is provided (e.g. '12-Jan' -> '2023-01-12').
    3. OPENING BALANCE: If the first row is 'B/F', 'Brought Forward', or 'Opening Balance', you MUST extract it as a transaction with 0 withdrawal, 0 deposit, and the specified balance.
    4. EMPTY PAGES: If the text is just Terms & Conditions or has no tabular data, return an empty transactions array [].
    5. MULTI-LINE NARRATIONS: Indian banks often span descriptions across multiple lines. Merge them into a single string.
    """

    try:
        response = await client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Markdown Text:\n\n{md_text}"}
            ],
            response_format=BankStatementExtract,
        )
        
        extracted_data = response.choices[0].message.parsed
        return extracted_data
    except Exception as e:
        print(f"GPT-4o-mini extraction failed: {e}")
        return BankStatementExtract(transactions=[])

async def process_bank_statement_bg(statement_id: str, file_path_or_bytes: bytes, user_id: str, client_id: str):
    """
    Background worker that chunks the PDF, runs extraction, performs math checks, and saves to DB.
    """
    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
    
    try:
        doc = fitz.open(stream=file_path_or_bytes, filetype="pdf")
        
        first_page_text = doc[0].get_text()
        statement_period_context = "Unknown. Look at the text for context."
        
        # Step 1: Chunk the document (5 pages at a time)
        chunk_size = 5
        total_pages = len(doc)
        
        all_transactions = []
        overall_bank_name = None
        overall_account_number = None
        
        for i in range(0, total_pages, chunk_size):
            chunk_doc = fitz.open()
            for j in range(i, min(i + chunk_size, total_pages)):
                chunk_doc.insert_pdf(doc, from_page=j, to_page=j)
                
            md_text = pymupdf4llm.to_markdown(chunk_doc)
            
            if len(md_text) < 50:
                continue
                
            extract_result = await extract_bank_statement_chunk(md_text, statement_period_context)
            
            if extract_result.bank_name and not overall_bank_name:
                overall_bank_name = extract_result.bank_name
            if extract_result.account_number and not overall_account_number:
                overall_account_number = extract_result.account_number
                
            all_transactions.extend(extract_result.transactions)
            
        # Step 2: Run Deterministic Math Engine
        db_rows = []
        previous_balance = None
        
        for idx, txn in enumerate(all_transactions):
            has_math_error = False
            needs_manual_review = False
            
            w = txn.withdrawal or 0.0
            d = txn.deposit or 0.0
            b = txn.balance
            
            # Zero Hallucination Validation
            if txn.txn_date is None or txn.balance is None:
                needs_manual_review = True
                
            if txn.withdrawal is None and txn.deposit is None:
                # Need to review if not just a descriptive row
                if not txn.description or "balance" not in txn.description.lower():
                    needs_manual_review = True
                
            # Math Verification
            if b is not None and previous_balance is not None:
                expected_balance = round(previous_balance - w + d, 2)
                actual_balance = round(b, 2)
                if abs(expected_balance - actual_balance) > 0.5:
                    has_math_error = True
            
            if b is not None:
                previous_balance = b
                
            db_rows.append({
                "statement_id": statement_id,
                "txn_date": txn.txn_date,
                "description": txn.description,
                "reference_no": txn.reference_no,
                "cheque_number": txn.cheque_number,
                "withdrawal": txn.withdrawal,
                "deposit": txn.deposit,
                "balance": txn.balance,
                "has_math_error": has_math_error,
                "needs_manual_review": needs_manual_review
            })
            
        # Step 3: Save to Database
        if db_rows:
            for i in range(0, len(db_rows), 50):
                batch = db_rows[i:i+50]
                await sc.table("bank_transactions").insert(batch).execute()
                
        # Update statement status
        await sc.table("bank_statements").update({
            "status": "completed",
            "bank_name": overall_bank_name,
            "account_number": overall_account_number
        }).eq("id", statement_id).execute()
        
    except Exception as e:
        print(f"Error processing bank statement: {e}")
        await sc.table("bank_statements").update({
            "status": "failed"
        }).eq("id", statement_id).execute()
