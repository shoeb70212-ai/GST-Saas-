"""Audit claim pack Excel download."""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
import io

from audit_pack import build_claim_pack_xlsx
from http_client import get_shared_client
from utils import get_current_user, verify_client_access

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

router = APIRouter()


@router.get("/audit/claim-pack")
async def download_claim_pack(
    client_id: str = Query(...),
    period: str = Query(...),
    auth: dict = Depends(get_current_user),
):
    sc = auth["supabase_client"]
    await verify_client_access(sc, client_id)
    token = auth["token"]

    select = (
        "id,supplier_name,supplier_gstin,invoice_number,invoice_date,"
        "taxable_amount,total_amount,igst,cgst,sgst,recon_status,recon_period,"
        "itc_eligibility,itc_risk_flags,ims_status,error_message"
    )
    url = (
        f"{SUPABASE_URL}/rest/v1/invoices?client_id=eq.{client_id}"
        f"&recon_period=eq.{period}&select={select}"
    )

    async with get_shared_client() as http_client:
        resp = await http_client.get(
            url,
            headers={
                "apikey": SUPABASE_ANON_KEY or "",
                "Authorization": f"Bearer {token}",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to load invoices for claim pack")
        invoices = resp.json() if isinstance(resp.json(), list) else []

    blob = build_claim_pack_xlsx(invoices)
    filename = f"KhataLens_ClaimPack_{period}.xlsx"
    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
