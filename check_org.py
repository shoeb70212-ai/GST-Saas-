import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("backend/.env")
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

profiles = supabase.table("profiles").select("*").execute()
print("PROFILES:")
for p in profiles.data:
    print(p)

orgs = supabase.table("organizations").select("*").execute()
print("\nORGANIZATIONS:")
for o in orgs.data:
    print(o)

members = supabase.table("organization_members").select("*").execute()
print("\nMEMBERS:")
for m in members.data:
    print(m)

