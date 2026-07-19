import os
import json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("backend/.env")
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user = supabase.table("profiles").select("*").limit(1).execute()
if not user.data:
    print("No users found")
    exit()

uid = user.data[0]["id"]
print("Testing with user:", uid)
org_id = user.data[0].get("active_org_id")
print("User active_org_id:", org_id)

invoice_data = {
    "user_id": uid,
    "client_id": None,
    "file_name": "test.pdf",
    "supplier_name": "Test Supplier",
    "invoice_number": "TEST-123",
    "org_id": org_id,
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

