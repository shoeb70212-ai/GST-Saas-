import os
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
TEST_EMAIL = os.getenv("TEST_EMAIL")
TEST_PASSWORD = os.getenv("TEST_PASSWORD")

def test_e2e_scan():
    if not all([SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD]):
        print("Missing test credentials in .env (TEST_EMAIL, TEST_PASSWORD). Skipping full E2E auth test.")
        # Just do a generic failure test without auth
        img_data = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9'
        files = {'file': ('test.jpg', img_data, 'image/jpeg')}
        try:
            r = requests.post('http://127.0.0.1:8000/api/scan-invoice', files=files)
            print("Without auth:", r.status_code, r.text)
        except Exception as e:
            print(e)
        return

    print("Logging into Supabase...")
    auth_resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON_KEY},
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    
    if auth_resp.status_code != 200:
        print("Login failed:", auth_resp.text)
        return
        
    token = auth_resp.json().get("access_token")
    print("Login successful.")

    img_data = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9'
    files = {'file': ('test.jpg', img_data, 'image/jpeg')}
    
    print("Testing /api/scan-invoice...")
    r = requests.post(
        'http://127.0.0.1:8000/api/scan-invoice', 
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    
    print(f"Status Code: {r.status_code}")
    try:
        resp_json = r.json()
        print("Response:", resp_json)
        if r.status_code == 200:
            data = resp_json.get("data", {})
            print("Extraction State:", data.get("Extraction_State"))
            print("Confidence Score:", data.get("Confidence_Score"))
            print("Total Amount:", data.get("Total_Amount"))
    except:
        print("Raw text:", r.text)

if __name__ == "__main__":
    test_e2e_scan()
