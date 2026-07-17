import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # 1. HeroAnimation.tsx useState
    if "HeroAnimation.tsx" in filepath:
        content = re.sub(r'import\s*\{\s*useState\s*,\s*useEffect\s*,\s*useRef\s*\}\s*from\s*[\'"]react[\'"];?', "import { useEffect, useRef } from 'react';", content)

    # 2. KhataLensIcon.tsx el
    if "KhataLensIcon.tsx" in filepath:
        content = re.sub(r'delay:\s*function\(el,\s*i\)\s*\{\s*return\s*i\s*\*\s*150\s*\}', 'delay: function(_el, i) { return i * 150 }', content)
    
    # 3. DashboardPage.tsx
    if "DashboardPage.tsx" in filepath:
        content = re.sub(r'const estimatedSalesTax\s*=\s*[^\n]+;', '', content)
        content = re.sub(r'const totalITC\s*=\s*[^\n]+;', '', content)
        content = content.replace("inv.approval_status", "(inv as any).approval_status")

    # 4. SettingsPage.tsx data
    if "SettingsPage.tsx" in filepath:
        content = content.replace("const { data, error } = await supabase.rpc", "const { error } = await supabase.rpc")

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
