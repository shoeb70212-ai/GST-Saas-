import os
import io
import csv
import logging
import fitz # PyMuPDF
import pymupdf4llm
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from typing import Optional
from supabase import create_async_client
import json
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

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

class BankTransaction(BaseModel):
    txn_date: Optional[str] = Field(description="Date of transaction in YYYY-MM-DD format. Return null if blurry, missing, or ambiguous.")
    description: Optional[str] = Field(description="Transaction description or narration. Merge multi-line narrations. Return null if completely illegible.")
    reference_no: Optional[str] = Field(description="Reference or UTR number if present.")
    cheque_number: Optional[str] = Field(description="Cheque number if explicitly labeled.")
    withdrawal: Optional[float] = Field(description="Debit or withdrawal amount. Return null if blurry or ambiguous.")
    deposit: Optional[float] = Field(description="Credit or deposit amount. Return null if blurry or ambiguous.")
    balance: Optional[float] = Field(description="Running balance amount. Return null if blurry or ambiguous.")

class BankStatementExtractCSV(BaseModel):
    account_number: Optional[str] = Field(description="The bank account number for these transactions. Useful if multiple accounts are present.")
    bank_name: Optional[str] = Field(description="The name of the bank (e.g., HDFC, SBI).")
    transactions_csv: str = Field(description="""A CSV formatted string containing all transactions.
Use EXACTLY these columns: txn_date, description, reference_no, cheque_number, withdrawal, deposit, balance.
- Enclose text in double quotes if it contains commas (e.g. description).
- Leave missing/null values completely empty (e.g. ,,).
- Dates MUST be YYYY-MM-DD.
- Amounts MUST be raw numbers (no commas or currency symbols).
- DO NOT wrap the CSV in markdown code blocks, just output the raw text string.
- If no transactions exist, return an empty string.
""")

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
    1. THE ZERO HALLUCINATION MANDATE: If any number, date, or description is blurry, missing, or ambiguous, you MUST return empty/null. Do NOT attempt to guess or hallucinate.
    2. STATEMENT PERIOD: The statement period is {statement_period}. Use this to determine the correct year for dates if only day/month is provided (e.g. '12-Jan' -> '2023-01-12').
    3. OPENING BALANCE: If the first row is 'B/F', 'Brought Forward', or 'Opening Balance', you MUST extract it as a transaction with empty withdrawal, empty deposit, and the specified balance.
    4. EMPTY PAGES: If the text is just Terms & Conditions or has no tabular data, return an empty CSV string.
    5. MULTI-LINE NARRATIONS: Indian banks often span descriptions across multiple lines. Merge them into a single string.
    """

    try:
        response = await client.beta.chat.completions.parse(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Markdown Text:\n\n{md_text}"}
            ],
            response_format=BankStatementExtractCSV,
        )
        
        extracted_csv_data = response.choices[0].message.parsed
        transactions = []
        
        if extracted_csv_data.transactions_csv and extracted_csv_data.transactions_csv.strip():
            f = io.StringIO(extracted_csv_data.transactions_csv.strip())
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    def parse_float(val):
                        if not val or not str(val).strip(): return None
                        clean = str(val).replace(',', '').strip()
                        return float(clean) if clean else None
                        
                    txn = BankTransaction(
                        txn_date=row.get('txn_date') or None,
                        description=row.get('description') or None,
                        reference_no=row.get('reference_no') or None,
                        cheque_number=row.get('cheque_number') or None,
                        withdrawal=parse_float(row.get('withdrawal')),
                        deposit=parse_float(row.get('deposit')),
                        balance=parse_float(row.get('balance'))
                    )
                    transactions.append(txn)
                except Exception as row_err:
                    logger.warning(f"Error parsing CSV row {row}: {row_err}")
                    continue

        tokens = response.usage.total_tokens if response.usage else 0
        
        return BankStatementExtract(
            account_number=extracted_csv_data.account_number,
            bank_name=extracted_csv_data.bank_name,
            transactions=transactions
        ), tokens
    except Exception as e:
        logger.error(f"GPT-4o-mini extraction failed: {e}")
        return BankStatementExtract(transactions=[], account_number=None, bank_name=None), 0

async def process_bank_statement_bg(statement_id: str, file_path_or_bytes: bytes, user_id: str, client_id: str, extension: str = '.pdf', pdf_password: str = None, cost: int = 2):
    """
    Background worker that chunks the file, runs extraction, performs math checks, and saves to DB.
    If processing fails, refunds the upfront-deducted credits.
    """
    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
    
    logger.info(f"Starting process_bank_statement_bg for {statement_id}")
    all_transactions = []
    overall_bank_name = None
    overall_account_number = None
    total_statement_tokens = 0

    async def _fail(message: str):
        logger.error(f"Bank statement {statement_id} failed: {message}")
        await sc.table("bank_statements").update({
            "status": "failed",
            "error_message": message[:500],
        }).eq("id", statement_id).execute()
        try:
            await sc.rpc("refund_credits", {
                "user_id_param": user_id,
                "amount": cost,
            }).execute()
            logger.info(f"Refunded {cost} credits for failed statement {statement_id}")
        except Exception as refund_e:
            logger.error(f"Failed to refund credits for statement {statement_id}: {refund_e}")

    try:
        if extension in ['.xlsx', '.xls', '.csv']:
            import pandas as pd
            if extension == '.csv':
                df = pd.read_csv(io.BytesIO(file_path_or_bytes))
                dfs = {"Sheet1": df}
            else:
                bio = io.BytesIO(file_path_or_bytes)
                engine = "xlrd" if extension == ".xls" else "openpyxl"
                try:
                    dfs = pd.read_excel(bio, sheet_name=None, engine=engine)
                except ImportError as ie:
                    raise RuntimeError(
                        f"Server missing Excel support ({engine}). Redeploy backend with openpyxl/xlrd installed."
                    ) from ie
                except Exception as xe:
                    raise RuntimeError(f"Could not parse Excel file ({extension}): {xe}") from xe
                
            for sheet_name, df in dfs.items():
                df.dropna(how='all', axis=0, inplace=True)
                df.dropna(how='all', axis=1, inplace=True)
                
                chunk_size = 50
                for i in range(0, len(df), chunk_size):
                    status_check = await sc.table("bank_statements").select("status").eq("id", statement_id).execute()
                    if status_check.data and status_check.data[0].get("status") == "cancelled":
                        return
                        
                    progress_msg = f"processing: rows {i+1}-{min(i+chunk_size, len(df))} of {len(df)}"
                    await sc.table("bank_statements").update({"status": progress_msg[:50]}).eq("id", statement_id).execute()
                    
                    chunk_df = df.iloc[i:i+chunk_size]
                    if chunk_df.empty: continue
                    
                    md_text = chunk_df.to_markdown(index=False)
                    extract_result, tokens = await extract_bank_statement_chunk(md_text, "Unknown period (Excel/CSV)")
                    total_statement_tokens += tokens
                    
                    if extract_result.bank_name and not overall_bank_name: overall_bank_name = extract_result.bank_name
                    if extract_result.account_number and not overall_account_number: overall_account_number = extract_result.account_number
                    all_transactions.extend(extract_result.transactions)
                    
        else:
            logger.info(f"Opening PDF stream for statement {statement_id}")
            doc = fitz.open(stream=file_path_or_bytes, filetype="pdf")
            if doc.needs_pass and pdf_password:
                doc.authenticate(pdf_password)
            statement_period_context = "Unknown. Look at the text for context."
            
            total_pages = len(doc)
            logger.info(f"Extracted first page text. Total pages: {total_pages}")
            chunk_size = 10
            
            for i in range(0, total_pages, chunk_size):
                status_check = await sc.table("bank_statements").select("status").eq("id", statement_id).execute()
                if status_check.data and status_check.data[0].get("status") == "cancelled":
                    logger.info(f"Statement {statement_id} was cancelled. Halting.")
                    return
                
                start_page = i + 1
                end_page = min(i + chunk_size, total_pages)
                progress_msg = f"processing: {start_page}-{end_page} of {total_pages}"
                # Fit within 50 chars for varchar(50)
                await sc.table("bank_statements").update({"status": progress_msg[:50]}).eq("id", statement_id).execute()
                
                chunk_doc = fitz.open()
                for j in range(i, min(i + chunk_size, total_pages)):
                    chunk_doc.insert_pdf(doc, from_page=j, to_page=j)
                    
                logger.debug(f"Generating markdown for chunk {i}")
                md_text = pymupdf4llm.to_markdown(chunk_doc)
                if len(md_text) < 50:
                    logger.debug(f"Markdown too short, skipping chunk {i}")
                    continue
                    
                logger.debug(f"Requesting AI extraction for chunk {i}")
                extract_result, tokens = await extract_bank_statement_chunk(md_text, statement_period_context)
                total_statement_tokens += tokens
                logger.debug(f"AI extraction completed for chunk {i}")
                
                if extract_result.bank_name and not overall_bank_name: overall_bank_name = extract_result.bank_name
                if extract_result.account_number and not overall_account_number: overall_account_number = extract_result.account_number
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
            "account_number": overall_account_number,
            "error_message": None,
        }).eq("id", statement_id).execute()
        
        # Log Token Usage (credits were already deducted upfront in the router)
        try:
            await sc.rpc("decrement_credits", {
                "user_id_param": user_id, 
                "amount": 0,
                "task_type_param": "bank_statement_processing",
                "file_name_param": f"statement_{statement_id}",
                "tokens_used_param": total_statement_tokens
            }).execute()
        except Exception as log_e:
            logger.warning(f"Token usage log failed for {statement_id}: {log_e}")
        
    except Exception as e:
        await _fail(str(e))
