import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("backend/.env")
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

uid = "078775e9-3cd5-44da-9636-08e500a53f8e"

invoice_data = {
    "user_id": uid,
    "client_id": None,
    "file_name": "test_no_org.pdf",
    "supplier_name": "Test No Org",
    "invoice_number": "TEST-NO-ORG-1",
    "total_amount": 100
}

try:
    res = supabase.rpc("save_invoice_atomic", {
        "invoice_data": invoice_data,
        "line_items": []
    }).execute()
    print("SUCCESS:", res)
except Exception as e:
    print("ERROR:", e)

