MSME GST Debt Tracker — V1 Master Build Prompt

For: Lovable.dev / Replit Agent

Product Codename: PayForce (MSME Collections with GST Leverage)

Stack: React + Vite (PWA) · FastAPI · Supabase · $0 Infrastructure

⚠️ PRE-BUILD RESEARCH MANDATE (Read Before Writing a Single Line of Code)

Before generating any UI, schema, or logic, the agent must internalize these verified legal facts that are the entire foundation of this product's value.

Verified Legal Foundation

1. GST Bad Debt Reality (Section 34, CGST Act 2017) There is NO GST credit note relief for bad debts in India. If an MSME supplier raises an invoice, pays GST to the government, and the buyer then defaults — the GST paid is a permanent, sunk financial loss. Section 34 only allows credit notes for returned goods, deficient services, or pricing corrections. This product must surface this "Sunk GST Exposure" as the primary pain metric — not as a bug, but as the core emotional hook.

2. Rule 37 of CGST Rules — The Collections Weapon If a buyer has availed Input Tax Credit (ITC) on a supplier's invoice but does NOT pay the supplier (value + GST) within 180 days from the invoice date, the buyer is legally compelled to:

Reverse the ITC claimed in GSTR-3B (Table 4B)

Pay 18% per annum interest on the reversed ITC under Section 50

This reversal is proportionate to the unpaid amount

This is the enforcement lever no other AR tool uses. The dunning messages in this app must specifically cite Rule 37 as a compliance threat to the buyer — not as a bluff, but as an accurate statement of Indian GST law. The buyer's CFO/accountant knows this is real.

3. MSMED Act Sections 15–17 — The Interest Weapon

Section 15: Buyer must pay within the agreed date, capped at 45 days from acceptance of goods/services. If no written agreement, 15 days from acceptance.

Section 16: On default beyond the due date, compound interest at 3× the RBI Bank Rate, compounded with monthly rests, accrues automatically. No court order needed.

Current RBI Bank Rate: ~6.5% → Effective MSME interest rate = ~19.5% p.a. compounded monthly

Section 23: This MSMED interest is NOT tax-deductible for the buyer — it doubles the real cost of delay.

Section 43B(h), Income Tax Act (effective April 2024): If buyer delays payment beyond 45 days to a Micro/Small enterprise, the buyer loses the tax deduction on the principal expense that year. This is the newest and most powerful lever.

4. MSME Samadhaan Portal (Section 18, MSMED Act) MSMEs with Udyam registration can file on samadhaan.msme.gov.in. The MSEFC (Facilitation Council) first conciliates, then arbitrates. The buyer must deposit 75% of the award before challenging. This is the final escalation step the app must prepare a pre-filled document for.

5. Competitive Gap Existing tools (Vyapar, Zoho, CredFlow, Growfin, Kapittx, Tally) handle AR aging and basic reminders. None of them:

Surface "Sunk GST Exposure" as a metric

Use Rule 37 ITC reversal threat in dunning copy

Calculate Section 43B(h) deferred deduction cost for the buyer

Auto-generate Samadhaan-ready filing summaries

PRODUCT VISION

PayForce is a PWA for Indian Micro and Small enterprise owners (Udyam-registered) who are owed money by buyers. It tells them exactly how much GST cash they've already lost to the government on unpaid invoices, auto-calculates the MSMED compound interest accruing daily, and arms them with legally-precise dunning messages that cite the specific GST compliance risk (Rule 37 ITC reversal) facing their buyer. It escalates to Samadhaan prep at 180 days.

Primary User: Manufacturer, trader, or service provider with Udyam registration. Turnover ₹10L–₹10Cr. Has 5–50 outstanding invoices. No CA on retainer. Uses WhatsApp for business.

Single-sentence pitch: "See the exact GST money the government already took from you on unpaid invoices — and send your buyer a legally-worded message that makes them pay."

PHASE PLAN — BUILD IN THIS EXACT ORDER

PHASE 0 — Project Setup & Supabase Schema (Day 1)

PHASE 1 — Invoice Entry & Core Ledger (Day 1–2)

PHASE 2 — The Sunk GST Widget + MSMED Interest Engine (Day 2–3)

PHASE 3 — Rule 37 Dunning Sequence Generator (Day 3–4)

PHASE 4 — Dashboard & Escalation Tracker (Day 4–5)

PHASE 5 — PWA Shell + Mobile Optimization (Day 5)

PHASE 0 — DATABASE SCHEMA (Supabase PostgreSQL)

Build this schema first. All business logic depends on it.

-- Enable Row Level Security on all tables
-- All tables scoped to auth.uid()

-- 1. User profile / MSME owner
CREATE TABLE msme_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  gstin TEXT,                        -- 15-char GSTIN, validated format
  udyam_number TEXT,                 -- UAM-XX-XX-XXXXXXX format
  rbi_bank_rate DECIMAL(5,2) DEFAULT 6.50,  -- updated manually or fetched
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 2. Buyers (parties who owe money)
CREATE TABLE buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  gstin TEXT,                        -- buyer's GSTIN (for Rule 37 leverage)
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Invoices (core ledger)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES buyers(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  acceptance_date DATE,              -- date buyer accepted goods/services
                                     -- If NULL, use invoice_date + 1 day
  written_agreement_days INTEGER,    -- payment terms agreed in writing (max 45)
  invoice_value_ex_gst DECIMAL(12,2) NOT NULL,
  gst_rate DECIMAL(5,2) NOT NULL,    -- e.g., 18.00 for 18%
  gst_amount DECIMAL(12,2) GENERATED ALWAYS AS 
    (ROUND(invoice_value_ex_gst * gst_rate / 100, 2)) STORED,
  total_invoice_amount DECIMAL(12,2) GENERATED ALWAYS AS 
    (invoice_value_ex_gst + ROUND(invoice_value_ex_gst * gst_rate / 100, 2)) STORED,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  payment_date DATE,                 -- date of last/full payment
  status TEXT DEFAULT 'unpaid'       -- 'unpaid', 'partial', 'paid', 'escalated'
    CHECK (status IN ('unpaid', 'partial', 'paid', 'escalated')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Dunning log (track which messages were sent)
CREATE TABLE dunning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,               -- 'day1', 'day45', 'day150', 'day180'
  message_text TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  channel TEXT DEFAULT 'whatsapp'    -- 'whatsapp', 'email', 'sms'
);

-- 5. RLS Policies (all tables)
ALTER TABLE msme_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own data" ON msme_profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users see own data" ON buyers FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users see own data" ON invoices FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users see own data" ON dunning_log FOR ALL USING (user_id = auth.uid());

-- 6. Computed view for the dashboard
CREATE VIEW invoice_analytics AS
SELECT
  i.id,
  i.user_id,
  i.invoice_number,
  i.invoice_date,
  i.buyer_id,
  b.buyer_name,
  b.gstin AS buyer_gstin,
  i.invoice_value_ex_gst,
  i.gst_rate,
  i.gst_amount,
  i.total_invoice_amount,
  i.amount_paid,
  (i.total_invoice_amount - i.amount_paid) AS amount_outstanding,
  -- Sunk GST: proportional to unpaid amount
  ROUND(i.gst_amount * (i.total_invoice_amount - i.amount_paid) / NULLIF(i.total_invoice_amount, 0), 2) AS sunk_gst_exposure,
  -- Due date calculation (MSMED Act)
  CASE 
    WHEN i.written_agreement_days IS NOT NULL AND i.written_agreement_days <= 45
      THEN (COALESCE(i.acceptance_date, i.invoice_date) + i.written_agreement_days)
    ELSE (COALESCE(i.acceptance_date, i.invoice_date) + 45)
  END AS msmed_due_date,
  -- Days overdue from MSMED due date
  GREATEST(0, CURRENT_DATE - CASE 
    WHEN i.written_agreement_days IS NOT NULL AND i.written_agreement_days <= 45
      THEN (COALESCE(i.acceptance_date, i.invoice_date) + i.written_agreement_days)
    ELSE (COALESCE(i.acceptance_date, i.invoice_date) + 45)
  END) AS days_overdue_msmed,
  -- Days from invoice date (for Rule 37 tracking)
  (CURRENT_DATE - i.invoice_date) AS days_from_invoice,
  -- Rule 37 countdown: 180 days from invoice date
  GREATEST(0, 180 - (CURRENT_DATE - i.invoice_date)) AS rule37_days_remaining,
  -- Rule 37 triggered?
  (CURRENT_DATE - i.invoice_date) >= 180 AS rule37_triggered,
  i.status,
  i.created_at
FROM invoices i
JOIN buyers b ON i.buyer_id = b.id
WHERE i.status IN ('unpaid', 'partial', 'escalated');


PHASE 1 — INVOICE ENTRY UI

Screen: Add Invoice

Build a clean, mobile-first form with these fields:

Buyer Name (dropdown from saved buyers or type new)
Buyer GSTIN (optional, 15 chars, validate format: [0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})
Invoice Number
Invoice Date (date picker)
Date Buyer Accepted Goods/Services (date picker, defaults to invoice date)
Payment Terms in Writing? (Yes/No toggle)
  → If Yes: Payment days (number input, capped at 45, show warning if >45)
Invoice Amount (excluding GST)
GST Rate (dropdown: 0%, 5%, 12%, 18%, 28%)
Amount Already Paid (default 0)
Notes (optional textarea)


Show live calculations as user types:

GST Amount = Invoice Amount × GST Rate

Total Invoice = Invoice Amount + GST Amount

Outstanding = Total - Paid

MSMED Due Date = acceptance date + payment terms (or 45 days)

"GST already paid to govt on this invoice: ₹XX,XXX"

UX Rules

All amounts in Indian format: ₹1,23,456 (not ₹123,456)

No login wall on first open — allow adding 3 invoices before requiring Supabase auth signup

Mobile-first: 375px width minimum, large tap targets (44px min)

No whitespace essays. Every label is a plain Hindi-influenced business term the owner will recognize: "Udhar Baaki" not "Outstanding Receivables"

PHASE 2 — THE SUNK GST WIDGET + MSMED INTEREST ENGINE

This is the emotional core of the product. Build it as the hero card on the dashboard.

Sunk GST Widget (Top of Dashboard)

┌─────────────────────────────────────────────┐
│  💸 GST Already Paid on Unpaid Invoices      │
│                                              │
│         ₹ 47,340                             │
│                                              │
│  This money is gone. Paid to the govt.       │
│  You cannot claim it back until buyers pay.  │
│                                              │
│  [Across 8 unpaid invoices]                  │
└─────────────────────────────────────────────┘


Calculation Logic (JavaScript/Python)

def calculate_sunk_gst(invoice_value_ex_gst, gst_rate, amount_paid, total_invoice):
    """
    Sunk GST = GST component of the unpaid portion of the invoice.
    The supplier already paid this full GST to the govt on filing.
    It's a permanent cash loss unless the buyer pays.
    """
    gst_amount = invoice_value_ex_gst * (gst_rate / 100)
    outstanding = total_invoice - amount_paid
    proportion_outstanding = outstanding / total_invoice if total_invoice > 0 else 0
    return round(gst_amount * proportion_outstanding, 2)

def calculate_msmed_interest(principal, rbi_bank_rate, days_overdue_from_msmed_due):
    """
    MSMED Act Section 16: Compound interest, monthly rests, at 3× RBI Bank Rate.
    Formula: A = P × (1 + r/12)^n
    Where r = 3 × (rbi_bank_rate/100) and n = months overdue
    """
    if days_overdue_from_msmed_due <= 0:
        return 0
    
    annual_rate = 3 * rbi_bank_rate / 100   # e.g., 3 × 0.065 = 0.195
    months_overdue = days_overdue_from_msmed_due / 30.44  # average month length
    
    # Compound interest with monthly rests
    amount_with_interest = principal  ((1 + annual_rate / 12) * months_overdue)
    interest = amount_with_interest - principal
    return round(interest, 2)

def calculate_rule37_itc_at_risk(gst_amount, amount_paid, total_invoice):
    """
    The ITC the buyer has availed on this invoice.
    If they haven't paid within 180 days, this exact amount must be reversed
    PLUS 18% interest on it. This is the number we threaten them with.
    """
    outstanding = total_invoice - amount_paid
    proportion_outstanding = outstanding / total_invoice if total_invoice > 0 else 0
    itc_at_risk = gst_amount * proportion_outstanding
    return round(itc_at_risk, 2)

def calculate_section43b_deduction_loss(invoice_value_ex_gst, amount_paid, total_invoice, days_overdue_from_msmed_due):
    """
    Section 43B(h), Income Tax Act: Buyer cannot deduct this purchase expense
    this year if it's overdue beyond MSMED limits.
    This is an additional lever — the buyer loses their own P&L deduction.
    Only applies to Micro and Small enterprise suppliers (not Medium).
    """
    if days_overdue_from_msmed_due <= 0:
        return 0
    
    # Buyer's tax deduction loss on unpaid outstanding principal
    outstanding_ex_gst = invoice_value_ex_gst * (1 - amount_paid / total_invoice)
    # At 30% tax rate (approximate corporate/partnership), this is the real cost
    # We show the outstanding amount that is non-deductible, not the tax value
    return round(outstanding_ex_gst, 2)


Invoice Age Cards

Each invoice gets a status chip based on age from invoice date and MSMED due date:

Status Condition Color Label CURRENT Days overdue (MSMED) = 0 Green On Time MSMED INTEREST Days overdue (MSMED) > 0 and < 135 days from invoice Amber Interest Running RULE 37 WARNING Days from invoice 135–179 Orange ITC Risk Zone RULE 37 TRIGGERED Days from invoice ≥ 180 Red ITC Reversal Due SAMADHAAN READY Rule 37 triggered + no payment Dark Red File Now

PHASE 3 — RULE 37 DUNNING SEQUENCE GENERATOR

This is the product's most defensible feature. The app generates legally accurate, copy-paste-ready WhatsApp/email messages tailored to each invoice's exact age.

Stage Logic

function getDunningStage(daysFromInvoice, daysOverdueMsmed, invoiceNumber, buyerName, 
                          outstandingAmount, msmedInterest, itcAtRisk, msmedDueDate) {
  
  // Stage 1: Invoice issued, not yet overdue under MSMED
  if (daysOverdueMsmed <= 0) {
    return {
      stage: 'day1',
      urgency: 'low',
      message: generateStage1(invoiceNumber, buyerName, outstandingAmount, msmedDueDate)
    };
  }
  
  // Stage 2: MSMED clock has started (overdue by MSMED standard)
  if (daysOverdueMsmed > 0 && daysFromInvoice < 135) {
    return {
      stage: 'day45',
      urgency: 'medium', 
      message: generateStage2(invoiceNumber, buyerName, outstandingAmount, msmedInterest, daysOverdueMsmed)
    };
  }
  
  // Stage 3: Approaching 180-day Rule 37 window
  if (daysFromInvoice >= 135 && daysFromInvoice < 180) {
    return {
      stage: 'day150',
      urgency: 'high',
      message: generateStage3(invoiceNumber, buyerName, outstandingAmount, itcAtRisk, 180 - daysFromInvoice)
    };
  }
  
  // Stage 4: 180 days crossed — Rule 37 fully triggered
  if (daysFromInvoice >= 180) {
    return {
      stage: 'day180',
      urgency: 'critical',
      message: generateStage4(invoiceNumber, buyerName, outstandingAmount, itcAtRisk, msmedInterest)
    };
  }
}


Message Templates (Exact Copy — Do Not Soften)

Stage 1 — First Reminder (friendly, before MSMED clock)

Subject: Invoice #{invoice_number} — Payment Due on {msmed_due_date}

Dear {buyer_name},

This is a friendly reminder that Invoice #{invoice_number} for ₹{outstanding_amount} is due for payment on {msmed_due_date}.

Please process the payment to ensure continuity of supply.

Thank you,
{supplier_name}


Stage 2 — MSMED Interest Running

Subject: Invoice #{invoice_number} — OVERDUE | Statutory Interest Accruing

Dear {buyer_name},

Invoice #{invoice_number} for ₹{outstanding_amount} is now {days_overdue} days overdue beyond the statutory limit under Section 15 of the Micro, Small and Medium Enterprises Development (MSMED) Act, 2006.

As per Section 16 of the MSMED Act, compound interest at three times the RBI Bank Rate is now accruing automatically on the outstanding balance, whether or not we invoice it separately.

Current statutory interest accrued: ₹{msmed_interest}
Total amount now legally owed: ₹{total_with_interest}

Please note: Under Section 23 of the MSMED Act, this interest is not tax-deductible for your business. Further, under Section 43B(h) of the Income Tax Act (effective April 2024), the purchase expense of ₹{invoice_value_ex_gst} cannot be deducted in your P&L until payment is made.

We request immediate settlement to avoid further escalation.

{supplier_name} | Udyam Registration: {udyam_number}


Stage 3 — Rule 37 Warning (135–179 days)

Subject: URGENT — Invoice #{invoice_number} | Your ITC at Risk in {days_remaining} Days

Dear {buyer_name},

This is a formal compliance notice regarding Invoice #{invoice_number}.

Your payment of ₹{outstanding_amount} is now critically overdue. Per Rule 37 of the CGST Rules 2017, read with Section 16(2) of the CGST Act 2017, if the full payment (value + GST) is not made within 180 days of the invoice date, you are legally required to:

1. Reverse Input Tax Credit of ₹{itc_at_risk} claimed on this invoice in your GSTR-3B (Table 4B)
2. Pay interest at 18% per annum under Section 50 of the CGST Act on the reversed ITC

The 180-day deadline falls on {rule37_deadline}.
You have {days_remaining} days remaining.

ITC that must be reversed if unpaid: ₹{itc_at_risk}
Interest on reversed ITC (estimated): ₹{itc_interest_estimate}
MSMED compound interest already accrued: ₹{msmed_interest}

Clearing this invoice before {rule37_deadline} protects your ITC and avoids mandatory reversal.

Regards,
{supplier_name} | GSTIN: {supplier_gstin} | Udyam: {udyam_number}


Stage 4 — Rule 37 Triggered + Samadhaan Prep (180+ days)

Subject: LEGAL NOTICE — Invoice #{invoice_number} | Rule 37 ITC Reversal Triggered | MSME Samadhaan Filing Initiated

Dear {buyer_name},

Invoice #{invoice_number} has now crossed 180 days from the date of issue without payment of ₹{outstanding_amount}.

Under Rule 37 of the CGST Rules 2017, your obligation to reverse ITC of ₹{itc_at_risk} (plus 18% interest from date of ITC availment) has now crystallised. This reversal is legally mandatory and must appear in your next GSTR-3B filing.

Total amounts legally due from you as of {today}:
• Principal outstanding: ₹{outstanding_amount}
• MSMED Act compound interest (Sec. 16): ₹{msmed_interest}
• Total Claim: ₹{total_claim}

We are initiating proceedings under Section 18 of the MSMED Act at the Micro and Small Enterprises Facilitation Council (MSEFC). The Samadhaan application has been prepared. Note that under Section 19 of the MSMED Act, any challenge to an MSEFC award requires a 75% pre-deposit.

To avoid formal proceedings, full payment must reach us within 7 days of this notice.

{supplier_name} | GSTIN: {supplier_gstin} | Udyam: {udyam_number}
[Signed by: Proprietor/Director]


UI for Dunning Generator

Invoice Card → Click "Send Reminder"
→ App shows current stage automatically (based on age)
→ Displays the pre-filled message
→ Two buttons:
   [📋 Copy for WhatsApp]   [📧 Copy for Email]
→ Log it: "Reminder sent via WhatsApp — [date]"
→ Change stage manually if needed (override)


PHASE 4 — DASHBOARD

Layout (Mobile-first, 375px+)

┌─────────────────────────────────────────────┐
│  PayForce                    [+ Add Invoice] │
│  Namaste, Ravi Enterprises                  │
├─────────────────────────────────────────────┤
│  💸 Sunk GST Exposure         ₹47,340       │
│  GST paid to govt on unpaid invoices        │
├─────────────────────────────────────────────┤
│  📊 Total Outstanding         ₹3,12,450     │
│  Across 12 invoices                         │
├─────────────────────────────────────────────┤
│  ⚠️ MSMED Interest Accrued    ₹8,920        │
│  Legally owed to you beyond principal       │
├─────────────────────────────────────────────┤
│  🔴 Rule 37 Zone              ₹85,000       │
│  Buyer ITC at risk (135–180 day invoices)   │
├─────────────────────────────────────────────┤
│  INVOICES                    [Filter ▼]     │
│                                             │
│  [CRITICAL] Mehta Traders    ₹45,000       │
│  Inv #101 • 194 days • Rule37 Triggered    │
│  MSMED Interest: ₹3,210 | [Send Notice]   │
│                                             │
│  [WARNING] Sharma & Sons     ₹40,000       │
│  Inv #108 • 148 days • ITC Risk Zone       │
│  31 days to Rule37 deadline | [Remind Now] │
│                                             │
│  [OVERDUE] Patel Goods       ₹28,000       │
│  Inv #112 • 62 days • Interest Running     │
│  MSMED Interest: ₹620 | [Send Reminder]   │
│                                             │
│  [CURRENT] ABC Corp          ₹22,000       │
│  Inv #115 • Due in 12 days | [Send Notice] │
└─────────────────────────────────────────────┘


Invoice Detail View

Tapping any invoice opens a detail screen:

Invoice #101 — Mehta Traders
───────────────────────────────────
Invoice Date: 01-Jan-2025
Invoice Value: ₹38,136 + GST ₹6,864 = ₹45,000
Amount Paid: ₹0
Outstanding: ₹45,000
───────────────────────────────────
💸 SUNK GST EXPOSURE
₹6,864 paid to govt — permanently lost until buyer pays.

📅 MSMED TIMELINE
Due Date (45 days): 15-Feb-2025
Days Overdue: 149 days
MSMED Interest Accrued: ₹3,210
Total Legally Owed: ₹48,210

⚠️ RULE 37 STATUS
Days from Invoice: 194 (TRIGGERED)
ITC Buyer Must Reverse: ₹6,864
18% Interest on ITC: ₹432 (estimated)

📋 SECTION 43B(h) STATUS
Buyer cannot deduct ₹38,136 in current FY.

───────────────────────────────────
DUNNING HISTORY
✓ Stage 1 sent via WhatsApp — 03-Jan-2025
✓ Stage 2 sent via Email — 25-Feb-2025
✓ Stage 3 sent via WhatsApp — 01-Jun-2025
→ Stage 4 ready to send

[Generate Stage 4 Notice]
[Mark as Paid]
[Mark as Escalated]
[Download Samadhaan Summary PDF]
───────────────────────────────────


Samadhaan Summary (PDF Export)

At Stage 4, generate a plain-text summary document with:

Supplier details (name, GSTIN, Udyam number)

Buyer details (name, GSTIN, address)

Invoice details (number, date, amount)

MSMED interest calculation table (month-by-month)

Declaration that the goods/services were accepted

Total claim amount

Use pdfplumber or reportlab (Python, free) or jsPDF (React, free) to generate this.

PHASE 5 — PWA SHELL + GSTIN VALIDATION

GSTIN Format Validator (Free, No API Needed)

function validateGSTIN(gstin) {
  if (!gstin || gstin.length !== 15) return false;
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(gstin.toUpperCase());
}

// State code from first 2 digits (informational display only)
const STATE_CODES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '06': 'Haryana', '07': 'Delhi', '09': 'Uttar Pradesh', '10': 'Bihar',
  '18': 'Assam', '19': 'West Bengal', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '27': 'Maharashtra', '28': 'Andhra Pradesh', '29': 'Karnataka',
  '32': 'Kerala', '33': 'Tamil Nadu', '36': 'Telangana'
  // Add full list
};


PWA Manifest (manifest.json)

{
  "name": "PayForce — MSME Collections",
  "short_name": "PayForce",
  "description": "GST-aware invoice collections for Indian MSMEs",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0F172A",
  "theme_color": "#2563EB",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}


Service Worker (offline support for dashboard)

Cache the dashboard and invoice list. Show stale data offline rather than an error. Use Vite PWA plugin (vite-plugin-pwa).

TECH STACK (Exact, $0 Infrastructure)

Layer Tool Cost Why Frontend React 19 + Vite Free Fastest PWA setup UI Library shadcn/ui + Tailwind Free Clean, Indian-market ready Backend FastAPI (Python 3.11) Free Calculation engine Hosting (Frontend) Vercel Free tier Auto-deploy from GitHub Hosting (Backend) Render.com Free tier (spin down) FastAPI Database + Auth Supabase Free tier (500MB) Postgres + RLS + Auth PDF Export jsPDF (React) Free Client-side Samadhaan doc PDF Parsing pdfplumber (Python) Free For future invoice upload GSTIN Validate Regex (in-app) $0 No API needed for format check Interest Calc Python math $0 No third-party needed

DESIGN SYSTEM

/ Color Tokens /
--color-bg: #0F172A;           / Navy — financial seriousness /
--color-surface: #1E293B;      / Card surface /
--color-border: #334155;       / Subtle borders /
--color-primary: #2563EB;      / Action blue /
--color-accent: #F59E0B;       / Amber — attention/warning /
--color-danger: #EF4444;       / Red — Rule 37, critical /
--color-success: #10B981;      / Green — paid /
--color-text: #F1F5F9;         / Primary text /
--color-muted: #94A3B8;        / Secondary text /

/ Typography /
--font-heading: 'DM Sans', system-ui;   / Clean, slightly rounded /
--font-body: 'Inter', system-ui;
--font-mono: 'JetBrains Mono';          / Numbers: amounts, percentages /

/ Amount Display — always mono /
.amount { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

/ Indian number formatting /
function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { 
    style: 'currency', 
    currency: 'INR', 
    maximumFractionDigits: 0 
  }).format(amount);
}


Visual signature: The "Sunk GST" number on the dashboard uses a reddish-amber gradient text with a subtle pulsing animation — it's the one emotional design moment. Everything else is clean, dark-mode, information-dense.

ENVIRONMENT VARIABLES

.env (Supabase)
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key

FastAPI backend
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_KEY=your_service_key
RBI_BANK_RATE=6.50    # Update manually when RBI changes


FILE STRUCTURE

payforce/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── lib/
│   │   │   ├── supabase.js
│   │   │   ├── calculations.js      ← All MSMED/Rule37/GST math
│   │   │   ├── dunning.js           ← Message template generator
│   │   │   └── formatters.js        ← INR formatting, date formatting
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── InvoiceCard.jsx
│   │   │   ├── InvoiceDetail.jsx
│   │   │   ├── AddInvoiceForm.jsx
│   │   │   ├── SunkGSTWidget.jsx
│   │   │   ├── DunningPanel.jsx
│   │   │   └── SamadhaanExport.jsx
│   │   └── pages/
│   │       ├── Home.jsx
│   │       ├── InvoicePage.jsx
│   │       └── Auth.jsx
│   ├── public/
│   │   └── manifest.json
│   ├── vite.config.js
│   └── package.json
├── backend/
│   ├── main.py                      ← FastAPI app
│   ├── routers/
│   │   ├── invoices.py
│   │   └── calculations.py
│   ├── services/
│   │   ├── msmed_calculator.py      ← Section 16 compound interest
│   │   ├── gst_calculator.py        ← Sunk GST, Rule 37 logic
│   │   └── dunning_engine.py        ← Stage logic
│   └── requirements.txt
├── supabase/
│   └── schema.sql                   ← Full schema from Phase 0
└── README.md


PHASE-WISE EXECUTION CHECKLIST

✅ PHASE 0 — Schema (Do First)

[ ] Create Supabase project (free)

[ ] Run schema.sql in Supabase SQL editor

[ ] Enable email auth in Supabase dashboard

[ ] Test RLS: confirm user A cannot see user B's invoices

[ ] Confirm invoice_analytics view returns correct computed columns

✅ PHASE 1 — Invoice Entry

[ ] AddInvoiceForm with all fields + live calculations

[ ] Buyer autocomplete (from existing buyers table)

[ ] New buyer creation inline

[ ] GSTIN format validation (regex, no API)

[ ] Submit → insert to invoices table via Supabase client

[ ] Success state: invoice card appears in list immediately

✅ PHASE 2 — Calculations Engine

[ ] calculations.js — all math functions with JSDoc

[ ] SunkGSTWidget — hero card with total sunk GST

[ ] MsmedInterestBadge — per-invoice interest display

[ ] Rule37Countdown — days remaining chip

[ ] Section 43B(h) deduction loss display (informational label)

[ ] Unit test all calculation functions with known values

✅ PHASE 3 — Dunning Generator

[ ] dunning.js — stage determination function

[ ] All 4 message templates with variable interpolation

[ ] DunningPanel component — shows current stage + message

[ ] "Copy for WhatsApp" / "Copy for Email" buttons

[ ] Log dunning entry to dunning_log table on copy

[ ] Manual stage override (if user already sent manually)

✅ PHASE 4 — Dashboard

[ ] Summary metrics row (Sunk GST, Outstanding, Interest, Rule37 Zone)

[ ] Invoice list sorted by urgency (CRITICAL → WARNING → OVERDUE → CURRENT → PAID)

[ ] Filter by: All / Overdue / Rule37 Zone / Paid

[ ] Search by buyer name or invoice number

[ ] Invoice detail page with full timeline

[ ] Samadhaan summary PDF export (jsPDF)

[ ] Mark as Paid / Mark as Escalated actions

✅ PHASE 5 — PWA + Polish

[ ] vite-plugin-pwa configuration

[ ] manifest.json with correct icons

[ ] Service worker caches dashboard for offline

[ ] Responsive design tested at 375px, 768px, 1280px

[ ] Dark mode only (consistent, no toggle needed for V1)

[ ] Loading skeletons (not spinners) for all data fetches

[ ] Empty state: "No invoices yet. Add your first invoice →"

[ ] Error state: Show Supabase error cleanly, log to console

[ ] Deploy frontend to Vercel (connect GitHub repo)

[ ] Deploy FastAPI to Render (free tier)

V1 SCOPE GATES — DO NOT BUILD IN V1

These features are explicitly out of scope to ship fast:

Feature Why Not V1 When WhatsApp Cloud API auto-send Costs money, requires Meta approval V2 GSTIN live validation via API Paid or rate-limited V2 PDF invoice parsing (OCR) Complex, not needed for manual entry V2 E-invoice integration (IRP) Complex GSP requirements V3 Payment gateway (Razorpay) Out of scope V3 Multi-user / team accounts Add after first 50 paying users V2 Tally/Zoho import Post-product-market fit V2 AI-generated dunning customization Post-PMF V2 Automated Samadhaan portal submission API not public V3

SUCCESS METRICS FOR V1

A V1 is successful if, within 4 weeks of launch:

An MSME owner can add 10 invoices in under 10 minutes

The "Sunk GST Exposure" widget correctly calculates for all their invoices

The Stage 3 Rule 37 message can be copied and WhatsApp'd to a buyer in 1 tap

At least 1 user reports they received payment after sending a Stage 3 message

App loads in <3 seconds on a Jio 4G connection (Lighthouse mobile score >70)

FOR LOVABLE.DEV — STARTER PROMPT

Paste this into Lovable.dev to begin:

Build a React + Vite PWA called "PayForce" for Indian MSME owners to track overdue invoices using GST law compliance as a collections tool.

Tech stack: React 19, Vite, Tailwind CSS, shadcn/ui, Supabase (auth + postgres).

Start with this exact Supabase schema:
[paste the schema.sql from Phase 0 above]

Build Phase 1 first: A mobile-first invoice entry form with these fields: buyer name, buyer GSTIN, invoice number, invoice date, acceptance date, payment terms (days, max 45), invoice amount (ex-GST), GST rate (0/5/12/18/28%), amount paid.

Show live calculations: GST amount, total invoice, outstanding, due date (MSMED), and a highlighted "GST Already Paid to Govt: ₹XX,XXX" figure.

Dark theme (#0F172A background). Use DM Sans for headings, Inter for body, JetBrains Mono for all rupee amounts. Indian number formatting (₹1,23,456 not ₹123,456).

After Phase 1 works, I will give you the next phase.


FOR REPLIT AGENT — STARTER PROMPT

Paste this into Replit Agent to begin:

Create a full-stack web app called "PayForce" with this structure:
- /frontend: React 19 + Vite + Tailwind + shadcn/ui (PWA)
- /backend: FastAPI (Python 3.11) with these packages: fastapi, uvicorn, supabase-py, pdfplumber, python-dotenv, reportlab

Start by building the backend calculation engine in /backend/services/calculations.py with these exact functions:
1. calculate_sunk_gst(invoice_value_ex_gst, gst_rate, amount_paid, total_invoice) → float
2. calculate_msmed_interest(principal, rbi_bank_rate, days_overdue_from_msmed_due) → float (compound, monthly rests, 3x RBI rate)
3. calculate_rule37_itc_at_risk(gst_amount, amount_paid, total_invoice) → float
4. get_msmed_due_date(acceptance_date, written_agreement_days) → date (max 45 days)
5. get_dunning_stage(days_from_invoice, days_overdue_msmed) → str ('day1'|'day45'|'day150'|'day180')

Write unit tests for each function using pytest with these known values:
- Invoice: ₹1,00,000 ex-GST, 18% GST = ₹18,000, total = ₹1,18,000
- Accepted: Jan 1 2025, no written agreement (so due: Jan 16 2025)
- Today: Jul 15 2025 (195 days from invoice, 180 days overdue MSMED)
- Expected sunk GST: ₹18,000 (fully unpaid)
- Expected MSMED interest at 6.5% RBI rate: ~₹12,850 (calculated)
- Expected ITC at risk: ₹18,000
- Expected stage: 'day180'

Run the tests first. Fix any failures. Then tell me what you built.


Document prepared by Claude — Research verified against CGST Act 2017, CGST Rules 2017, MSMED Act 2006, Finance Act 2023, and live market research as of June 2026.

Legal note: Message templates are accurate statements of Indian law but should be reviewed by a CA or lawyer before use in formal legal proceedings. The tool generates awareness and informal pressure, not legal notices proper.

I want to build the complete and detail prompt is attached