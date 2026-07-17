import httpx
import hmac
import hashlib
import json
import time

# Use the same secret as in your .env
META_APP_SECRET = "your_meta_app_secret_here"
WEBHOOK_URL = "http://localhost:8000/webhook"

# A sample text message payload mimicking Meta's webhook format
payload = {
    "object": "whatsapp_business_account",
    "entry": [
        {
            "id": "1234567890",
            "changes": [
                {
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {
                            "display_phone_number": "1234567890",
                            "phone_number_id": "1234567890"
                        },
                        "messages": [
                            {
                                "from": "919876543210", # Must match a user's registered whatsapp_number in the DB
                                "id": "wamid.HBgLOTE...",
                                "timestamp": str(int(time.time())),
                                "type": "text",
                                "text": {
                                    "body": "Hello! Testing KhataLens Webhook."
                                }
                            }
                        ]
                    },
                    "field": "messages"
                }
            ]
        }
    ]
}

payload_bytes = json.dumps(payload).encode("utf-8")

# Generate the HMAC signature
signature = hmac.new(
    META_APP_SECRET.encode("utf-8"),
    payload_bytes,
    hashlib.sha256
).hexdigest()

headers = {
    "Content-Type": "application/json",
    "X-Hub-Signature-256": f"sha256={signature}"
}

print(f"Sending webhook to {WEBHOOK_URL}...")
response = httpx.post(WEBHOOK_URL, content=payload_bytes, headers=headers)
print(f"Status Code: {response.status_code}")
print(f"Response: {response.text}")
