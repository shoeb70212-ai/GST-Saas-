import os
import requests
import io
import zipfile
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
TEST_EMAIL = os.getenv("TEST_EMAIL", "test@example.com")
TEST_PASSWORD = os.getenv("TEST_PASSWORD", "password123")
API_URL = "http://127.0.0.1:8000"

def get_token():
    if not all([SUPABASE_URL, SUPABASE_ANON_KEY]):
        print("Missing SUPABASE credentials in .env")
        return None, None
        
    print(f"Logging into Supabase with {TEST_EMAIL}...")
    auth_resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON_KEY},
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if auth_resp.status_code != 200:
        print("Login failed:", auth_resp.text)
        print("Please ensure you have created a test user in Supabase auth.")
        return None, None
    
    token = auth_resp.json().get("access_token")
    user_id = auth_resp.json().get("user", {}).get("id")
    return token, user_id

def test_scan_invoice(token):
    print("\n--- Testing /api/scan-invoice (Single File) ---")
    img_data = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9'
    files = {'file': ('test.jpg', img_data, 'image/jpeg')}
    try:
        r = requests.post(f'{API_URL}/api/scan-invoice', files=files, headers={"Authorization": f"Bearer {token}"})
        print(f"Status Code: {r.status_code}")
        if r.status_code == 200: 
            print("Success: API returned extracted data.")
        else: 
            print("Error:", r.text)
    except Exception as e:
        print(f"Connection failed: {e}. Is the server running?")

def test_upload_batch(token):
    print("\n--- Testing /api/upload-batch (ZIP File) ---")
    img_data = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9'
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zf:
        zf.writestr("invoice1.jpg", img_data)
        zf.writestr("invoice2.jpg", img_data)
        
    files = {'file': ('batch.zip', zip_buffer.getvalue(), 'application/zip')}
    data = {'client_id': 'test-client-id-123'}
    try:
        r = requests.post(f'{API_URL}/api/upload-batch', files=files, data=data, headers={"Authorization": f"Bearer {token}"})
        print(f"Status Code: {r.status_code}")
        if r.status_code == 200: 
            print("Success:", r.json())
        else: 
            print("Error:", r.text)
    except Exception as e:
        print(f"Connection failed: {e}. Is the server running?")

def test_reconcile(token):
    print("\n--- Testing /api/reconcile (GSTR-2B Excel) ---")
    df = pd.DataFrame([
        ['GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice type', 'Invoice Date', 'Invoice Value(₹)', 'Place of supply', 'Supply Attracts Reverse Charge', 'Rate(%)', 'Taxable Value', 'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)', 'GSTR-1/IFF/ITC(SPG) Filing Status', 'GSTR-1/IFF/ITC(SPG) Filing Date', 'GSTR-1/IFF/ITC(SPG) Filing Period', 'GSTR-3B Filing Status', 'ITC Availability', 'Reason for Non-availability', 'Applicable % of Tax Rate'],
        ['27AADCB2230M1Z2', 'TEST SUPPLIER', 'INV-001', 'Regular', '01-03-2024', 1180, '27-Maharashtra', 'No', 18, 1000, 180, 0, 0, 0, 'Yes', '11-04-2024', '03-2024', 'Yes', 'Yes', '', '']
    ])
    
    excel_buffer = io.BytesIO()
    df.to_excel(excel_buffer, sheet_name='B2B', index=False, header=False)
    
    files = {'file': ('gstr2b.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    data = {'client_id': 'test-client-id-123', 'period': '03-2024'}
    try:
        r = requests.post(f'{API_URL}/api/reconcile', files=files, data=data, headers={"Authorization": f"Bearer {token}"})
        print(f"Status Code: {r.status_code}")
        if r.status_code == 200: 
            print("Success:", r.json())
        else: 
            print("Error:", r.text)
    except Exception as e:
        print(f"Connection failed: {e}. Is the server running?")

if __name__ == "__main__":
    print("==========================================")
    print(" LedgerLens E2E API Test Suite ")
    print("==========================================\n")
    token, user_id = get_token()
    if token:
        print("\n=> User authenticated successfully. Proceeding with tests...\n")
        # test_scan_invoice(token) # Skipping because it uses real Gemini credits
        test_upload_batch(token)
        test_reconcile(token)
        print("\nAll tests dispatched! Note: The ZIP batch runs in the background. Check backend console.")
    else:
        print("Cannot run E2E tests without valid authentication.")
