import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # 1. Fix React import
    content = re.sub(r'import React,\s*\{\s*([^\}]+)\s*\}\s*from\s*[\'"]react[\'"];?', r'import { \1 } from "react";', content)
    content = re.sub(r'import React\s*from\s*[\'"]react[\'"];?\n?', '', content)
    content = re.sub(r'import React\s*from\s*[\'"]react[\'"]', '', content)

    # 2. Fix framer-motion ease type issue
    content = re.sub(r'(ease:\s*\[[0-9., ]+\])(?!\s*as)', r'\1 as any', content)

    # 3. Fix ProGate ReactNode type import
    if "ProGate.tsx" in filepath:
        content = content.replace("import { ReactNode }", "import type { ReactNode }")

    # 4. Fix HeroAnimation.tsx useState
    if "HeroAnimation.tsx" in filepath:
        content = content.replace("import { useState, useRef, useEffect } from 'react';", "import { useRef, useEffect } from 'react';")
    
    # 5. Fix KhataLensIcon.tsx el
    if "KhataLensIcon.tsx" in filepath:
        content = content.replace("const el = e.currentTarget;", "")
        
    # 6. Fix LandingFeatures.tsx ArrowRight, motion
    if "LandingFeatures.tsx" in filepath:
        content = content.replace("import { ArrowRight, Bot, Shield, Zap, CheckCircle2, TrendingUp, Search, Lock } from 'lucide-react';", "import { Bot, Shield, Zap, CheckCircle2, TrendingUp, Search, Lock } from 'lucide-react';")
        content = content.replace("import { motion } from 'framer-motion';", "")

    # 7. Fix ClientsPage.tsx Users
    if "ClientsPage.tsx" in filepath:
        content = content.replace("import { Users, Plus, Search, MapPin, Building2, Briefcase, ChevronRight, Activity, ArrowUpRight, CheckCircle2, MoreVertical, CreditCard, FileText } from 'lucide-react';", "import { Plus, Search, MapPin, Building2, Briefcase, ChevronRight, Activity, ArrowUpRight, CheckCircle2, MoreVertical, CreditCard, FileText } from 'lucide-react';")

    # 8. Fix DashboardPage.tsx unused vars and approval_status
    if "DashboardPage.tsx" in filepath:
        content = re.sub(r'const \[isSavingSales[^;]+;', '', content)
        content = content.replace("const handleSaveSales = async", "const _handleSaveSales = async")
        content = content.replace("const estimatedLiability =", "const _estimatedLiability =")
        content = content.replace("invoice.approval_status", "(invoice as any).approval_status")

    # 9. Fix LandingPage.tsx unused vars
    if "LandingPage.tsx" in filepath:
        content = content.replace("import { ChevronRight, Play, ArrowRight, CheckCircle2, FileText, PieChart, Shield, Zap, Users, Building2, Briefcase, FileSpreadsheet, Lock, Sparkles, TrendingUp, Globe2, ScanText } from 'lucide-react';", "import { Play, CheckCircle2, FileText, PieChart, Shield, Zap, Building2, Briefcase, FileSpreadsheet, Lock, Sparkles, TrendingUp, Globe2, ScanText } from 'lucide-react';")
        content = content.replace("const fadeLeft", "// const fadeLeft")
        content = content.replace("const fadeRight", "// const fadeRight")

    # 10. Fix SavedInvoicesPage.tsx title prop on Lucide Icons
    if "SavedInvoicesPage.tsx" in filepath:
        content = re.sub(r'title=\{[^\}]+\}', '', content)
        content = re.sub(r'title="[^"]*"', '', content)

    # 11. Fix VirtualCfoPage.tsx formatter type
    if "VirtualCfoPage.tsx" in filepath:
        content = content.replace("formatter={(value: number)", "formatter={(value: any)")
        content = content.replace("(value: number, name: string, entry: any)", "(value: any, name: string, _entry: any)")

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
