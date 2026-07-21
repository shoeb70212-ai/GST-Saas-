import os
import logging
import httpx
from http_client import get_shared_client
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
import razorpay
from supabase import create_async_client
from utils import get_current_user, resolve_active_org_id
from credits import CREDIT_PACKS

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

router = APIRouter()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "rzp_test_mock")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", RAZORPAY_KEY_SECRET)

rzp_client = None
if RAZORPAY_KEY_ID != "rzp_test_mock":
    rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


class OrderRequest(BaseModel):
    amount: float | None = None  # Ignored; kept for API compatibility
    credits: int | None = None  # Ignored; kept for API compatibility
    plan_type: str  # 'starter' or 'pro'


@router.post("/create-order")
async def create_order(req: OrderRequest, auth: dict = Depends(get_current_user)):
    user_id = auth["user_id"]
    supabase_client = auth["supabase_client"]

    pack = CREDIT_PACKS.get((req.plan_type or "").lower())
    if not pack:
        raise HTTPException(status_code=400, detail="Invalid plan_type. Use 'starter' or 'pro'.")

    credits = pack["credits"]
    amount_inr = pack["amount_inr"]
    order_amount = int(amount_inr * 100)  # Razorpay expects paise

    if not rzp_client:
        if os.getenv("ENVIRONMENT", "development") == "production":
            raise HTTPException(status_code=500, detail="Mock payments are disabled in production")
        
        # Mock response for testing without keys
        mock_order_id = "order_mock_" + os.urandom(4).hex()
        # Persist mock order in DB for verify-payment to look up
        try:
            await supabase_client.table("payment_orders").insert({
                "order_id": mock_order_id,
                "user_id": user_id,
                "expected_credits": credits,
                "expected_amount": order_amount,
                "plan_type": req.plan_type.lower(),
                "status": "pending"
            }).execute()
        except Exception as e:
            logger.error(f"Failed to persist mock order: {e}")
            # Non-fatal for mock mode

        return {
            "order_id": mock_order_id,
            "amount": order_amount,
            "currency": "INR",
            "key_id": RAZORPAY_KEY_ID
        }

    try:
        order_currency = "INR"
        order_receipt = f"rcptid_{user_id[:8]}"

        razorpay_order = rzp_client.order.create({
            "amount": order_amount,
            "currency": order_currency,
            "receipt": order_receipt,
            "payment_capture": "1"
        })

        order_id = razorpay_order["id"]

        # Persist order in DB for secure verification later
        try:
            await supabase_client.table("payment_orders").insert({
                "order_id": order_id,
                "user_id": user_id,
                "expected_credits": credits,
                "expected_amount": order_amount,
                "plan_type": req.plan_type.lower(),
                "status": "pending"
            }).execute()
        except Exception as e:
            logger.error(f"Failed to persist order {order_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to create order record")

        return {
            "order_id": order_id,
            "amount": order_amount,
            "currency": order_currency,
            "key_id": RAZORPAY_KEY_ID
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create order error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhooks/payment")
async def razorpay_webhook(request: Request):
    """Razorpay webhook — trusted server-to-server source for credit granting."""
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature")

    if not rzp_client:
        if os.getenv("ENVIRONMENT", "development") == "production":
            logger.error("Mock webhook triggered in production environment")
            return {"status": "error"}
        # Mock mode — accept without verification (dev only)
        return {"status": "ok"}

    # Verify webhook signature
    try:
        rzp_client.utility.verify_webhook_signature(
            body.decode("utf-8"),
            signature,
            RAZORPAY_WEBHOOK_SECRET
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Signature")

    payload = await request.json()
    if payload.get("event") == "payment.captured":
        payment = payload["payload"]["payment"]["entity"]
        order_id = payment.get("order_id")
        payment_id = payment.get("id")
        amount_paid = payment.get("amount")  # in paise

        if not order_id or not payment_id:
            logger.warning("Webhook received without order_id or payment_id")
            return {"status": "ok"}

        # Use service role key to fulfill order (idempotent RPC)
        if not SUPABASE_SERVICE_KEY:
            logger.error("SUPABASE_SERVICE_ROLE_KEY not configured for webhook fulfillment")
            return {"status": "error", "detail": "Server misconfiguration"}

        try:
            async with get_shared_client() as http_client:
                rpc_response = await http_client.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/fulfill_payment_order",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "p_order_id": order_id,
                        "p_payment_id": payment_id,
                        "p_amount_paid": amount_paid
                    }
                )
                if rpc_response.status_code >= 400:
                    logger.error(f"Webhook fulfillment failed: {rpc_response.text}")
        except Exception as e:
            logger.error(f"Webhook fulfillment error: {e}")

    return {"status": "ok"}


@router.post("/verify-payment")
async def verify_payment(
    request: Request,
    auth: dict = Depends(get_current_user),
):
    """Verify payment — uses server-stored order data, NOT client-supplied credits."""
    user_id = auth["user_id"]
    supabase_client = auth["supabase_client"]

    data = await request.json()
    payment_id = data.get("razorpay_payment_id")
    order_id = data.get("razorpay_order_id")
    signature = data.get("razorpay_signature")

    if not order_id or not payment_id:
        raise HTTPException(status_code=400, detail="Missing payment_id or order_id")

    # Fetch order from DB — use stored expected_credits/expected_amount (NOT client-supplied)
    order_resp = await supabase_client.table("payment_orders").select("*").eq("order_id", order_id).execute()

    if not order_resp.data:
        raise HTTPException(status_code=404, detail="Order not found. Please contact support.")

    order_data = order_resp.data[0]

    # Verify order belongs to this user
    if order_data.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Order does not belong to authenticated user")

    # Idempotency: if already fulfilled, return success
    if order_data.get("status") == "fulfilled":
        return {"status": "success", "message": "Payment already verified and credits granted."}

    expected_credits = order_data["expected_credits"]
    expected_amount = order_data["expected_amount"]
    plan_type = order_data["plan_type"]

    # Verify Razorpay signature and fetch actual payment amount
    actual_amount = expected_amount
    if rzp_client:
        try:
            rzp_client.utility.verify_payment_signature({
                'razorpay_order_id': order_id,
                'razorpay_payment_id': payment_id,
                'razorpay_signature': signature
            })
            
            # Fetch actual payment details
            payment_info = rzp_client.payment.fetch(payment_id)
            actual_amount = payment_info.get("amount", expected_amount)
            
            if actual_amount < expected_amount:
                raise HTTPException(status_code=400, detail="Payment amount is less than expected amount")
                
        except Exception as e:
            logger.error(f"Payment verification error: {e}")
            raise HTTPException(status_code=400, detail="Invalid payment signature or details")
    else:
        if os.getenv("ENVIRONMENT", "development") == "production":
            raise HTTPException(status_code=500, detail="Mock payments are disabled in production")

    # Fulfill order via idempotent RPC (uses service role key for upgrade_user_tier)
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing Service Role Key")

    try:
        async with get_shared_client() as http_client:
            rpc_response = await http_client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/fulfill_payment_order",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "p_order_id": order_id,
                    "p_payment_id": payment_id,
                    "p_amount_paid": actual_amount
                }
            )
            if rpc_response.status_code >= 400:
                logger.error(f"Payment fulfillment RPC failed: {rpc_response.text}")
                raise HTTPException(status_code=500, detail="Database update failed")

            result = rpc_response.json()
            if not result.get("success"):
                error_msg = result.get("error", "Unknown error")
                raise HTTPException(status_code=400, detail=f"Payment verification failed: {error_msg}")

        return {
            "status": "success",
            "message": f"Successfully upgraded to {plan_type} and added {expected_credits} credits.",
            "credits_granted": expected_credits
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Verify payment error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audit/usage-logs")
async def get_usage_logs(auth: dict = Depends(get_current_user)):
    user_id = auth["user_id"]
    sc = auth["supabase_client"]

    active_org_id = await resolve_active_org_id(sc, user_id)
    if not active_org_id:
        return {"status": "success", "data": []}

    resp = await sc.table("credit_usage_logs").select("*").eq("org_id", active_org_id).order("created_at", desc=True).limit(100).execute()
    return {"status": "success", "data": resp.data}