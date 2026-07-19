import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("backend/.env")
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY")
supabase = create_client(url, key)

# Get user id from my previous run
uid = "078775e9-3cd5-44da-9636-08e500a53f8e"
org_id = "e172b725-ac92-4627-b9ff-8fa644eb7f5c"

# I need an auth token to bypass RLS as user. I cannot easily get this without login.
# BUT I can just look at the RPC logic and RLS!

