import os
import uuid
import re
import hashlib
from fastapi import HTTPException
from supabase import create_async_client

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def get_supabase_client():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing Supabase service key configuration.")
    # We must use synchronous client if public_routes expects it synchronously, 
    # but in public_routes.py we see:
    # await supabase_client.table("clients")... 
    # But wait, create_async_client is async. We shouldn't call await inside get_supabase_client if it's not async.
    pass # I'll look at how it's used.

def validate_file_content(content: bytes, filename: str) -> str:
    """
    Validates file magic bytes and size, returns verified mime type.
    """
    MAX_SIZE = 10 * 1024 * 1024 # 10 MB limit
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail=f"File {filename} is too large. Max 10MB allowed.")

    if content.startswith(b'%PDF-'):
        return "application/pdf"
    elif content.startswith(b'\xff\xd8\xff'):
        return "image/jpeg"
    elif content.startswith(b'\x89PNG\r\n\x1a\n'):
        return "image/png"
    elif content.startswith(b'RIFF') and content[8:12] == b'WEBP':
        return "image/webp"
    else:
        raise HTTPException(status_code=400, detail=f"Invalid file format for {filename}. Only PDF, JPEG, PNG, and WEBP are allowed.")

def sanitize_filename(filename: str) -> str:
    if not filename:
        return f"{uuid.uuid4()}.bin"
    # Keep only alphanumeric characters, dots, dashes, and underscores
    clean_name = re.sub(r'[^a-zA-Z0-9.\-_]', '', filename)
    # Remove leading dots or slashes
    clean_name = clean_name.lstrip('./\\')
    if not clean_name:
        return f"{uuid.uuid4()}.bin"
    return clean_name

def compute_file_hash(content: bytes) -> str:
    """
    Computes SHA-256 hash of file content for deduplication.
    """
    return hashlib.sha256(content).hexdigest()
