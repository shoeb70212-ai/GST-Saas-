import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # 1. HeroAnimation.tsx useState
    if "HeroAnimation.tsx" in filepath:
        content = re.sub(r'import\s*\{\s*useState\s*,\s*useRef\s*,\s*useEffect\s*\}\s*from\s*[\'"]react[\'"];?', "import { useRef, useEffect } from 'react';", content)

    # 2. KhataLensIcon.tsx el
    if "KhataLensIcon.tsx" in filepath:
        content = re.sub(r'const el = [^;]+;', '', content)
    
    # 3. LandingFeatures.tsx ArrowRight
    if "LandingFeatures.tsx" in filepath:
        content = re.sub(r'\bArrowRight\b,?\s*', '', content)

    # 4. ClientsPage.tsx Users and React
    if "ClientsPage.tsx" in filepath:
        content = re.sub(r'\bUsers\b,?\s*', '', content)
        if "import React" not in content:
            content = "import React from 'react';\n" + content

    # 5. DashboardPage.tsx
    if "DashboardPage.tsx" in filepath:
        content = re.sub(r'const _handleSaveSales = async \(\) => \{[\s\S]*?\n  \};', '', content)
        content = re.sub(r'setIsSavingSales\([^)]*\);', '', content)
        content = re.sub(r'const _estimatedLiability = [^;]+;', '', content)
        content = content.replace("invoice.approval_status", "(invoice as any).approval_status")

    # 6. LandingPage.tsx ChevronRight, Users
    if "LandingPage.tsx" in filepath:
        content = re.sub(r'\bChevronRight\b,?\s*', '', content)
        content = re.sub(r'\bUsers\b,?\s*', '', content)

    # 7. ScanPage.tsx React
    if "ScanPage.tsx" in filepath:
        if "import React" not in content:
            content = "import React from 'react';\n" + content
            
    # 8. SettingsPage.tsx data
    if "SettingsPage.tsx" in filepath:
        content = re.sub(r'\bdata\b(?=\s*=>)', '_data', content)
        content = content.replace("onSuccess: (data) => {", "onSuccess: (_data) => {")

    # 9. VirtualCfoPage.tsx entry
    if "VirtualCfoPage.tsx" in filepath:
        content = content.replace("entry: any", "_entry: any")

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
