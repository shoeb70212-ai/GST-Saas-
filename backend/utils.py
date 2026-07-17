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
    pass

from supabase.client import ClientOptions
async def get_user_supabase_client(authorization: str):
    """
    Creates an async Supabase client using the user's JWT.
    This enforces Postgres Row Level Security (RLS) on all backend queries,
    preventing users from bypassing RBAC by hitting the API directly.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # We use ANON_KEY + User's JWT so RLS applies correctly
    return await create_async_client(
        SUPABASE_URL, 
        os.getenv("VITE_SUPABASE_ANON_KEY"),
        options=ClientOptions(headers={"Authorization": authorization})
    )

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


import io

def remove_pdf_password_if_present(pdf_bytes: bytes, password: str) -> bytes:
    try:
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if reader.is_encrypted:
            res = reader.decrypt(password)
            if res:
                writer = PdfWriter()
                for page in reader.pages:
                    writer.add_page(page)
                out = io.BytesIO()
                writer.write(out)
                return out.getvalue()
    except Exception as e:
        print(f'Error removing PDF password: {e}')
    return pdf_bytes
