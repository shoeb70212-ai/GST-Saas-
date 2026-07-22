"""
Tally export + converter API routes.

POST /export/tally          — IR -> XML
POST /export/tally/invoices — convenience for SavedInvoicesPage
POST /tally-converter/detect — upload file, detect type, return IR preview
POST /tally-converter/export — IR (+ optional mappings) -> validated XML
"""

from __future__ import annotations

import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from converter_service import (
    dataframe_to_document,
    detect_doc_type_from_text,
    read_tabular_file,
    apply_master_mappings,
)
from extraction import deduct_credits_rpc
from tally_export import export_document, invoices_to_document
from tally_ir import (
    DocType,
    InvoiceBatchExportRequest,
    TallyDocument,
    TallyExportRequest,
)
from utils import ensure_sufficient_credits, get_current_user, verify_client_access
import credits as credit_costs

logger = logging.getLogger(__name__)
router = APIRouter()


class ConverterExportBody(BaseModel):
    document: TallyDocument
    mappings: dict[str, str] = Field(default_factory=dict)
    auto_balance: bool = True
    include_masters: bool = True
    client_id: Optional[str] = None


def _excel_template_csv(rows: list[dict]) -> str:
    if not rows:
        return "Date,Voucher Type,Voucher No,Ledger Name,Debit,Credit,Narration,Party\n"
    import csv

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


@router.post("/export/tally")
async def export_tally_ir(
    body: TallyExportRequest,
    auth: dict = Depends(get_current_user),
):
    """Generate Tally XML from a TallyDocument IR."""
    _ = auth
    result = export_document(
        body.document,
        auto_balance=body.auto_balance,
        include_masters=body.include_masters,
    )
    result["excel_template"] = _excel_template_csv(result.pop("excel_rows", []))
    result.pop("document", None)
    return result


@router.post("/export/tally/invoices")
async def export_tally_invoices(
    body: InvoiceBatchExportRequest,
    auth: dict = Depends(get_current_user),
):
    """Convert saved invoices to Tally XML (replaces client-side exportToTallyXML)."""
    _ = auth
    if not body.invoices:
        raise HTTPException(status_code=400, detail="No invoices provided")
    doc = invoices_to_document(body)
    result = export_document(
        doc,
        auto_balance=body.auto_balance,
        include_masters=body.include_masters,
    )
    result["excel_template"] = _excel_template_csv(result.pop("excel_rows", []))
    result.pop("document", None)
    return result


@router.post("/tally-converter/detect")
async def tally_converter_detect(
    file: UploadFile = File(...),
    client_id: str = Form(...),
    doc_type: Optional[str] = Form(None),
    bank_ledger: str = Form("Bank Account"),
    pdf_password: Optional[str] = Form(None),
    auth: dict = Depends(get_current_user),
):
    """
    Upload PDF/Excel/CSV → detect document type → return IR preview + cost.
    Charges converter credits for parse/AI work.
    """
    sc = auth["supabase_client"]
    user_id = auth["user_id"]
    token = auth.get("token")
    await verify_client_access(sc, client_id)

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 25MB.")

    filename = file.filename or "upload.bin"
    ext = ""
    if "." in filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower()

    forced: DocType | None = None
    if doc_type:
        try:
            forced = DocType(doc_type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid doc_type: {doc_type}")

    cost = credit_costs.CONVERTER_BASE

    if ext in (".xlsx", ".xls", ".csv"):
        try:
            df = read_tabular_file(content, filename)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read spreadsheet: {e}")
        cost = credit_costs.converter_spreadsheet_cost(len(df))

        await ensure_sufficient_credits(sc, user_id, cost)
        remaining = await deduct_credits_rpc(
            user_id=user_id,
            amount=cost,
            task_type="tally_converter",
            file_name=filename,
            token=token,
        )
        if remaining == -1:
            raise HTTPException(status_code=402, detail="Insufficient credits.")

        tally_doc, dtype, conf = dataframe_to_document(
            df, doc_type=forced, filename=filename, bank_ledger=bank_ledger
        )
        return {
            "doc_type": dtype.value,
            "detected_doc_type": dtype.value,
            "confidence": conf,
            "cost_credits": cost,
            "credits_remaining": remaining,
            "document": tally_doc.model_dump(),
            "row_count": len(df),
        }

    if ext == ".pdf":
        try:
            import fitz
            import pymupdf4llm

            doc_pdf = fitz.open(stream=content, filetype="pdf")
            if doc_pdf.needs_pass:
                if not (pdf_password and str(pdf_password).strip()):
                    raise HTTPException(
                        status_code=400,
                        detail="This PDF is password-protected. Provide pdf_password.",
                    )
                if not doc_pdf.authenticate(str(pdf_password).strip()):
                    raise HTTPException(status_code=400, detail="Incorrect PDF password.")
                content = doc_pdf.tobytes(garbage=3, deflate=True)
                doc_pdf.close()
                doc_pdf = fitz.open(stream=content, filetype="pdf")
            page_count = len(doc_pdf)
            cost = credit_costs.converter_pdf_cost(page_count)
            try:
                md = pymupdf4llm.to_markdown(doc_pdf)
                text_hint = md[:8000]
            except Exception:
                text_hint = "\n".join(page.get_text() for page in doc_pdf)
            doc_pdf.close()
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"PDF converter failed: {e}")
            raise HTTPException(status_code=400, detail=f"Could not process PDF: {e}")

        detected, conf = detect_doc_type_from_text(text_hint)
        use_type = forced or detected

        await ensure_sufficient_credits(sc, user_id, cost)
        remaining = await deduct_credits_rpc(
            user_id=user_id,
            amount=cost,
            task_type="tally_converter",
            file_name=filename,
            token=token,
        )
        if remaining == -1:
            raise HTTPException(status_code=402, detail="Insufficient credits.")

        if use_type == DocType.BANK_STATEMENT:
            try:
                from bank_service import extract_bank_statement_chunk
                import pandas as pd

                extracted = await extract_bank_statement_chunk(text_hint[:12000], "unknown")
                rows = []
                for t in extracted.transactions or []:
                    rows.append(
                        {
                            "Date": t.txn_date,
                            "Description": t.description,
                            "Reference": t.reference_no,
                            "Cheque": t.cheque_number,
                            "Withdrawal": t.withdrawal,
                            "Deposit": t.deposit,
                            "Balance": t.balance,
                        }
                    )
                df = pd.DataFrame(rows)
                if df.empty:
                    raise HTTPException(
                        status_code=400,
                        detail="No transactions extracted from PDF bank statement.",
                    )
                tally_doc, dtype, dconf = dataframe_to_document(
                    df,
                    doc_type=DocType.BANK_STATEMENT,
                    filename=filename,
                    bank_ledger=bank_ledger,
                )
                return {
                    "doc_type": dtype.value,
                    "detected_doc_type": detected.value,
                    "confidence": max(conf, dconf),
                    "cost_credits": cost,
                    "credits_remaining": remaining,
                    "document": tally_doc.model_dump(),
                    "row_count": len(df),
                }
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(f"Bank PDF extraction failed: {e}")

        return {
            "doc_type": use_type.value,
            "detected_doc_type": detected.value,
            "confidence": conf,
            "cost_credits": cost,
            "credits_remaining": remaining,
            "document": TallyDocument(
                doc_type=use_type,
                warnings=[
                    "PDF register extraction is best-effort. "
                    "For Sales/Purchase registers, upload Excel/CSV for highest accuracy."
                ],
                source_filename=filename,
                vouchers=[],
                masters=[],
            ).model_dump(),
            "row_count": 0,
            "text_preview": text_hint[:1500],
        }

    raise HTTPException(
        status_code=400,
        detail="Unsupported file type. Upload PDF, Excel (.xlsx/.xls), or CSV.",
    )


@router.post("/tally-converter/export")
async def tally_converter_export(
    body: ConverterExportBody,
    auth: dict = Depends(get_current_user),
):
    """Apply optional master mappings and emit validated Tally XML."""
    if body.client_id:
        sc = auth["supabase_client"]
        await verify_client_access(sc, body.client_id)

    doc = apply_master_mappings(body.document, body.mappings)
    result = export_document(
        doc,
        auto_balance=body.auto_balance,
        include_masters=body.include_masters,
    )
    result["excel_template"] = _excel_template_csv(result.pop("excel_rows", []))
    return result
