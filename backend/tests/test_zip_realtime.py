import os
import requests
import time
import zipfile
import io
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
TEST_EMAIL = os.getenv("TEST_EMAIL")
TEST_PASSWORD = os.getenv("TEST_PASSWORD")

def test_zip_upload():
    if not all([SUPABASE_URL, SUPABASE_ANON_KEY]):
        print("Missing credentials.")
        return

    print("Logging into Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    # Try signing up a dummy user
    import uuid
    dummy_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    dummy_password = "TestPassword123!"
    
    res = supabase.auth.sign_up({"email": dummy_email, "password": dummy_password})
    token = res.session.access_token
    user_id = res.user.id
    
    # Wait for trigger to create user row or profile if any
    time.sleep(2)
    
    # Insert a dummy client
    client_res = supabase.table('clients').insert({"user_id": user_id, "client_name": "Test Client", "gstin": "27AADCB2230M1Z3"}).execute()
    client_id = client_res.data[0]['id']

    print(f"Logged in. Using client_id: {client_id}")

    # Create an in-memory zip file
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Create a dummy image file (1x1 pixel JPEG)
        img_data = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9'
        zip_file.writestr('test1.jpg', img_data)
        zip_file.writestr('test2.jpg', img_data)

    zip_buffer.seek(0)
    
    print("Uploading ZIP batch to backend...")
    url = "http://127.0.0.1:8000/api/upload-batch"
    files = {'file': ('test_batch.zip', zip_buffer, 'application/zip')}
    data = {'client_id': client_id}
    headers = {"Authorization": f"Bearer {token}"}
    
    r = requests.post(url, files=files, data=data, headers=headers)
    print(f"Status Code: {r.status_code}")
    if r.status_code != 200:
        print("Failed:", r.text)
        return
        
    res_data = r.json()
    print("Response:", res_data)
    queued_ids = res_data.get('queued_ids', [])
    if not queued_ids:
        print("No IDs were queued.")
        return
        
    print(f"Queued IDs: {queued_ids}")
    
    # Poll database to see if they transition from 'processing' to 'completed'
    print("Polling database for status update (simulating realtime)...")
    max_retries = 30
    for i in range(max_retries):
        time.sleep(2)
        # Fetch status for the queued ids
        query = supabase.table('invoices').select('id, processing_status, error_message').in_('id', queued_ids).execute()
        invoices = query.data
        
        all_done = True
        for inv in invoices:
            status = inv.get('processing_status')
            if status not in ('completed', 'failed'):
                all_done = False
                break
                
        if all_done:
            print("All queued files have finished processing:")
            for inv in invoices:
                print(f" - {inv['id']}: {inv['processing_status']} (Error: {inv.get('error_message')})")
            break
        else:
            print(f"[{i+1}/{max_retries}] Still processing...")
            
    if not all_done:
        print("Timeout reached before all files were processed.")

if __name__ == "__main__":
    test_zip_upload()
