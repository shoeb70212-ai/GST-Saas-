import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("backend/.env")
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

invoices = supabase.table("invoices").select("id, client_id, invoice_number").is_("client_id", "null").execute()
print("Invoices with NULL client_id:", len(invoices.data))

