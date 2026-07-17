import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # DashboardPage.tsx
    if "DashboardPage.tsx" in filepath:
        content = re.sub(r'import \{ useEffect, useState, useMemo \} from \'react\';', "import { useEffect, useState } from 'react';", content)
        content = re.sub(r'const \[estimatedSales, setEstimatedSales\] = useState<number>\(0\);', '', content)
        content = re.sub(r'const \[taxRate, setTaxRate\] = useState<number>\(18\);', '', content)
        content = re.sub(r'setEstimatedSales\([^)]+\);', '', content)
        content = re.sub(r'setTaxRate\([^)]+\);', '', content)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
