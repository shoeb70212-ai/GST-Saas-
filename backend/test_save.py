import asyncio
from supabase import create_client
import os

SUPABASE_URL = "https://wmxwjkmxyrngvitxseei.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndteHdqa214eXJuZ3ZpdHhzZWVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjcxNjQ3NCwiZXhwIjoyMDk4MjkyNDc0fQ.SDA49Ivcxs-MAvZLx6fW9Mp8Y9SGGioSOS60VppW26c"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

invoice_data = {
    "user_id": "00000000-0000-0000-0000-000000000000",
    "client_id": "00000000-0000-0000-0000-000000000000",
    "file_name": "test.jpg",
    "invoice_type": "tax_invoice",
    "expense_category": "advertising"
}
line_items = []

try:
    response = supabase.rpc("save_invoice_atomic", {"invoice_data": invoice_data, "line_items": line_items}).execute()
    print("Success:", response)
except Exception as e:
    print("Error:", e)

