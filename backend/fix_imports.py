import os

files_to_fix_supabase = [
    'sales_routes.py',
    'reconcile_routes.py',
    'payment_routes.py'
]

supabase_import = 'from main import SUPABASE_URL, SUPABASE_ANON_KEY'
supabase_replacement = '''import os
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
'''

for file_name in files_to_fix_supabase:
    path = os.path.join(os.getcwd(), file_name)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        if supabase_import in content:
            content = content.replace(supabase_import, supabase_replacement)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'Fixed {file_name}')

# Fix public_routes.py
path = os.path.join(os.getcwd(), 'public_routes.py')
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    if 'from main import run_ai_extraction' in content:
        content = content.replace('from main import run_ai_extraction', '# to avoid circular imports, import run_ai_extraction where used')
        content = content.replace('data_dict = await run_ai_extraction(content_bytes, mime_type)', 'from main import run_ai_extraction\\n        data_dict = await run_ai_extraction(content_bytes, mime_type)')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Fixed public_routes.py')

# Fix whatsapp_service.py
path = os.path.join(os.getcwd(), 'whatsapp_service.py')
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    if 'from main import run_ai_extraction' in content:
        content = content.replace('from main import run_ai_extraction', '# to avoid circular imports, import run_ai_extraction where used')
        content = content.replace('data_dict = await run_ai_extraction(content_bytes, mime_type, tally_ledgers)', 'from main import run_ai_extraction\\n            data_dict = await run_ai_extraction(content_bytes, mime_type, tally_ledgers)')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Fixed whatsapp_service.py')
