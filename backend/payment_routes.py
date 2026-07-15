import os
from fastapi import APIRouter, HTTPException, Header, Request, Depends
from pydantic import BaseModel
import razorpay
from supabase import create_async_client
from main import SUPABASE_URL, SUPABASE_ANON_KEY

router = APIRouter()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "rzp_test_mock")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")

rzp_client = None
if RAZORPAY_KEY_ID != "rzp_test_mock":
    rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

class OrderRequest(BaseModel):
    amount: int # Amount in INR
    credits: int
    plan_type: str # 'starter' or 'pro'

@router.post("/api/create-order")
async def create_order(req: OrderRequest, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    token = authorization.split(" ")[1]
    supabase_client = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    try:
        user_resp = await supabase_client.auth.get_user(token)
        user_id = user_resp.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session token")
        
    if not rzp_client:
        # Mock response for testing without keys
        return {
            "order_id": "order_mock_" + os.urandom(4).hex(),
            "amount": req.amount * 100,
            "currency": "INR",
            "key_id": RAZORPAY_KEY_ID
        }

    try:
        order_amount = req.amount * 100 # Razorpay expects paise
        order_currency = "INR"
        order_receipt = f"rcptid_{user_id[:8]}"
        
        razorpay_order = rzp_client.order.create({
            "amount": order_amount,
            "currency": order_currency,
            "receipt": order_receipt,
            "payment_capture": "1"
        })
        
        return {
            "order_id": razorpay_order["id"],
            "amount": order_amount,
            "currency": order_currency,
            "key_id": RAZORPAY_KEY_ID
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/webhooks/payment")
async def razorpay_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature")
    
    if not rzp_client:
        # Handle mock webhook
        data = await request.json()
        if data.get("event") == "payment.captured":
            # For mock, we'd need a secure way to know who to credit, but webhooks are stateless.
            # In real scenario, we verify signature.
            pass
        return {"status": "ok"}
        
    try:
        rzp_client.utility.verify_webhook_signature(body.decode("utf-8"), signature, os.getenv("RAZORPAY_WEBHOOK_SECRET", RAZORPAY_KEY_SECRET))
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid Signature")

    payload = await request.json()
    if payload.get("event") == "payment.captured":
        payment = payload["payload"]["payment"]["entity"]
        order_id = payment.get("order_id")
        amount = payment.get("amount") / 100
        
        # Here we need to map the order_id back to a user and grant credits.
        # This requires storing the pending order in the DB during /api/create-order.
        # For MVP, we can handle payment verification directly from the frontend after success instead of webhooks,
        # OR require the frontend to pass the user_id in the payment notes.
        pass
        
    return {"status": "ok"}

@router.post("/api/verify-payment")
async def verify_payment(
    request: Request,
    authorization: str = Header(None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    token = authorization.split(" ")[1]
    supabase_client = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    try:
        user_resp = await supabase_client.auth.get_user(token)
        user_id = user_resp.user.id
        supabase_client.postgrest.auth(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session token")
        
    data = await request.json()
    payment_id = data.get("razorpay_payment_id")
    order_id = data.get("razorpay_order_id")
    signature = data.get("razorpay_signature")
    credits_to_add = data.get("credits", 0)
    amount_paid = data.get("amount", 0)
    plan_type = data.get("plan_type", "free")
    
    if rzp_client:
        try:
            rzp_client.utility.verify_payment_signature({
                'razorpay_order_id': order_id,
                'razorpay_payment_id': payment_id,
                'razorpay_signature': signature
            })
        except Exception as e:
            raise HTTPException(status_code=400, detail="Invalid payment signature")
            
    # Atomic DB Update via RPC
    try:
        import httpx
        async with httpx.AsyncClient() as http_client:
            service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            if service_role:
                # Use atomic RPC upgrade_user_tier defined in phase 37
                rpc_response = await http_client.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/upgrade_user_tier",
                    headers={
                        "apikey": service_role, 
                        "Authorization": f"Bearer {service_role}", 
                        "Content-Type": "application/json"
                    },
                    json={
                        "user_id_param": user_id,
                        "plan_type_param": plan_type,
                        "credits_param": credits_to_add,
                        "amount_paid_param": amount_paid,
                        "payment_id_param": payment_id,
                        "order_id_param": order_id
                    }
                )
                if rpc_response.status_code >= 400:
                    raise HTTPException(status_code=500, detail=f"Database update failed: {rpc_response.text}")
            else:
                raise HTTPException(status_code=500, detail="Missing Service Role Key")
            
        return {"status": "success", "message": f"Successfully upgraded to {plan_type} and added {credits_to_add} credits."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
