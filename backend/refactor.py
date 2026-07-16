import os
import re

files = [
    r"d:\GST SAAS\backend\bank_routes.py",
    r"d:\GST SAAS\backend\bank_reconcile_routes.py"
]

for fp in files:
    if not os.path.exists(fp):
        continue
    with open(fp, "r", encoding="utf-8") as f:
        content = f.read()

    # Make sure get_user_supabase_client is imported
    if "get_user_supabase_client" not in content:
        content = content.replace("from supabase import create_async_client", "from supabase import create_async_client\nfrom utils import get_user_supabase_client")

    # Regex replace the auth pattern
    content = re.sub(
        r'SERVICE_ROLE\s*=\s*os\.getenv\("SUPABASE_SERVICE_ROLE_KEY",\s*SUPABASE_ANON_KEY\)\n\s*sc\s*=\s*await\s*create_async_client\(SUPABASE_URL,\s*SERVICE_ROLE\)',
        r'sc = await get_user_supabase_client(authorization)',
        content
    )
    
    with open(fp, "w", encoding="utf-8") as f:
        f.write(content)
print("Done")
