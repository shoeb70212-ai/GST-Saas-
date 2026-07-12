# KhataLens — Product Strategy & Target Audience

## Target Audience
**Primary User:** GST Accountants, Chartered Accountants (CAs), and Tax Consultants in India.
**Secondary User:** Accounting firms or agencies processing large volumes of invoices.

## Core Value Proposition
Time is money for an accountant. During GST filing season, data entry is the biggest bottleneck. KhataLens cuts data entry time by 90% by instantly digitizing physical and PDF purchase invoices with near-perfect accuracy using Gemini 2.5 Flash.

## Go-To-Market Strategy
1. **Beta Testing (Current Phase):** Onboard a small group of 5-10 accountants. Give them 100 free credits (1 credit = 1 invoice scan) to test the app in a real-world filing scenario. 
2. **Observe Usage:** Do not build new features until beta testers validate the core functionality. Pay close attention to what data they export and how they import it into Tally/Zoho.
3. **Launch & Monetize:** Once validated, integrate a payment gateway (Razorpay) allowing accountants to purchase "Scan Bundles" on a prepaid model.

## Why We Avoided Advanced Tally Integration (For Now)
We discussed building a direct Tally XML export feature. However, Tally integrations are notoriously complex, highly version-dependent, and prone to breaking. The market already has mature Tally integration software. 
**Our Strategy:** Stick to what we do best — AI extraction. We provide a highly customizable Excel (.xlsx) export. Accountants are Excel power users; they can easily map our Excel export to their existing import tools.

## Why We Avoided Dynamic Custom AI Fields
We discussed allowing accountants to prompt the AI (e.g., "Find the driver's license number if it exists on the bill").
**Our Strategy:** We abandoned this because dynamic prompting causes LLM token usage to spike unpredictably, making unit economics (cost per scan) impossible to calculate and monetize effectively. Instead, we use a rigid, highly-optimized prompt to extract 37 standard fields every single time for a flat, predictable API cost. The user can just hide the columns they don't want to see in the UI.
