import os
import hmac
import hashlib
import json
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, Response
from pydantic import BaseModel

from whatsapp_service import process_whatsapp_message_bg

router = APIRouter()

# Verify token from Meta Webhook setup
WEBHOOK_VERIFY_TOKEN = os.getenv("META_WEBHOOK_VERIFY_TOKEN", "khata_lens_secret_token_123")
META_APP_SECRET = os.getenv("META_APP_SECRET")

@router.get("/webhook")
async def verify_webhook(request: Request):
    """
    Handles the webhook verification challenge from Meta.
    When setting up the webhook in the Meta Developer Console, Meta sends a GET request
    with a hub.challenge and hub.verify_token.
    """
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and token == WEBHOOK_VERIFY_TOKEN:
        # Must return the challenge string as plain text
        return Response(content=challenge, media_type="text/plain")
    else:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid verification token")

@router.post("/webhook")
async def receive_whatsapp_message(request: Request, background_tasks: BackgroundTasks):
    """
    Primary ingestion endpoint for WhatsApp messages.
    Meta expects a 200 OK within 20 seconds, or it will retry.
    We hand off the actual processing to a BackgroundTask.
    """
    raw_body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    
    # 1. HMAC Security Validation
    if META_APP_SECRET and signature:
        expected_hash = hmac.new(
            META_APP_SECRET.encode("utf-8"),
            raw_body,
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(f"sha256={expected_hash}", signature):
            raise HTTPException(status_code=403, detail="Forbidden: Invalid HMAC signature")
    elif META_APP_SECRET and not signature:
        raise HTTPException(status_code=403, detail="Forbidden: Missing signature header")

    try:
        body = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Meta webhook structure
    # body["entry"][0]["changes"][0]["value"]["messages"][0]
    try:
        entries = body.get("entry", [])
        for entry in entries:
            changes = entry.get("changes", [])
            for change in changes:
                value = change.get("value", {})
                
                # Check for incoming messages
                messages = value.get("messages", [])
                for message in messages:
                    # Spawn a background task to process the message
                    background_tasks.add_task(process_whatsapp_message_bg, message)
                    
                # We can also handle 'statuses' here if we want to track delivery receipts,
                # but it's optional for ingestion.
    except Exception as e:
        print(f"Error parsing Meta webhook payload: {e}")
        # Even on parsing error, return 200 so Meta doesn't retry a bad payload
        pass

    # Always return 200 OK immediately
    return {"status": "ok"}
