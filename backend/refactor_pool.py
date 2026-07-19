import os
import glob

def refactor():
    files = glob.glob('backend/*.py')
    for fpath in files:
        if fpath.endswith('http_client.py') or fpath.endswith('refactor_pool.py'):
            continue
            
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        if 'httpx.AsyncClient' in content and 'async with' in content:
            # Need to add import
            if 'from http_client import get_shared_client' not in content:
                # Add import after import httpx
                if 'import httpx' in content:
                    content = content.replace('import httpx', 'import httpx\nfrom http_client import get_shared_client')
                else:
                    content = 'from http_client import get_shared_client\n' + content
                    
            content = content.replace('httpx.AsyncClient', 'get_shared_client')
            
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Refactored {fpath}")

if __name__ == '__main__':
    refactor()
