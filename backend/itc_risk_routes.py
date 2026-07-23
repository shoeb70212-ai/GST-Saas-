"""ITC-at-Risk API."""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query

from http_client import get_shared_client
from itc_risk import recompute_itc_risk, summarize_itc_risk
from utils import get_current_user, verify_client_access

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

router = APIRouter()


@router.get("/itc-risk")
async def get_itc_risk(
    client_id: str = Query(...),
    period: str | None = Query(None, description="MM-YYYY recon period"),
    recompute: bool = Query(True),
    auth: dict = Depends(get_current_user),
):
    sc = auth["supabase_client"]
    await verify_client_access(sc, client_id)
    token = auth["token"]

    async with get_shared_client() as http_client:
        if recompute:
            try:
                await recompute_itc_risk(
                    http_client, token=token, client_id=client_id, period=period
                )
            except Exception as e:
                logger.warning("ITC recompute failed: %s", e)

        select = (
            "id,supplier_name,supplier_gstin,invoice_number,invoice_date,"
            "taxable_amount,total_amount,igst,cgst,sgst,recon_status,recon_period,"
            "itc_eligibility,itc_risk_flags"
        )
        url = f"{SUPABASE_URL}/rest/v1/invoices?client_id=eq.{client_id}&select={select}"
        if period:
            url += f"&recon_period=eq.{period}"
        # Prefer risk rows first via filter — still fetch period invoices for aggregates
        resp = await http_client.get(
            url,
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {token}",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to load invoices for ITC risk")
        invoices = resp.json() if isinstance(resp.json(), list) else []

    summary = summarize_itc_risk(invoices)
    return {
        "status": "success",
        "client_id": client_id,
        "period": period,
        **summary,
    }
