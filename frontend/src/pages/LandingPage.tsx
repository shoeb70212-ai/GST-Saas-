import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Network, Banknote, CheckCircle2,
  Calculator, FileCheck, Layers, Upload,
  FileSpreadsheet, Zap, Lock, BarChart3, Menu, X,
  Plus, Minus, Quote, Star, Building2, Clock, Award, Smartphone, PlayCircle
} from 'lucide-react';
import HeroAnimation from '../components/HeroAnimation';
import { BankStatementDemo, WhatsAppDemo, ReconciliationDemo } from '../components/LandingFeatures';
import KhataLensIcon from '../components/KhataLensIcon';

// ─── Animation Variants ─────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as any } }
};
/* const fadeLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as any } }
};
const fadeRight = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as any } }
}; */
const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

// ─── Stat Counter Component ──────────────────────────────────────────────────
function StatCounter({ target, suffix, label }: { target: number; suffix: string; label: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const duration = 1800;
        const steps = 60;
        const increment = target / steps;
        let current = 0;
        const timer = setInterval(() => {
          current += increment;
          if (current >= target) { setCount(target); clearInterval(timer); }
          else setCount(Math.floor(current));
        }, duration / steps);
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-5xl font-display font-bold text-text-primary tabular-nums">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-sm text-text-secondary mt-2 font-medium uppercase tracking-widest">{label}</div>
    </div>
  );
}

// ─── FAQ Accordion Item ──────────────────────────────────────────────────────
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-2xl overflow-hidden transition-all duration-300 hover:border-border-focus">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-7 text-left bg-bg-surface hover:bg-bg-sunken transition-colors duration-200 cursor-pointer"
        aria-expanded={open}
      >
        <span className="text-lg font-display font-medium text-text-primary pr-6">{question}</span>
        <span className="shrink-0 w-8 h-8 rounded-full bg-bg-sunken border border-border flex items-center justify-center text-text-secondary transition-transform duration-300" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          {open ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as any }}
            className="overflow-hidden"
          >
            <p className="px-7 pb-7 text-text-secondary leading-relaxed font-light border-t border-border pt-5">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────
const faqData = [
  {
    question: "What file formats does KhataLens support?",
    answer: "KhataLens accepts PDFs (single and multi-page), JPEG, PNG, and WEBP images. We are specifically optimised to handle bills that have been photographed on a phone, including skewed or blurry images. If a bill arrives via WhatsApp, you can upload the compressed image directly — our AI handles it."
  },
  {
    question: "How accurate is the AI extraction?",
    answer: "KhataLens achieves over 97% accuracy on standard GST invoices. For critical fields like GSTIN, Invoice Number, Invoice Date, and grand totals, we apply secondary cross-verification against our own parsing logic. When confidence is below threshold, the field is flagged for your manual review rather than silently guessed."
  },
  {
    question: "Is my client data secure?",
    answer: "Absolutely. Each client workspace is fully isolated at the database level using Row-Level Security (RLS) in PostgreSQL. Uploaded files are processed in memory and never stored on disk. Database backups are encrypted. We are built on Supabase infrastructure, which is SOC-2 compliant. Your clients' data is physically and logically separate from every other firm."
  },
  {
    question: "Can I manage multiple clients from one account?",
    answer: "Yes — this is a core KhataLens feature. You can create unlimited client workspaces, each with its own GSTIN, invoice history, and export records. Switching between clients takes a single click. Nothing from one client's workspace ever bleeds into another's."
  },
  {
    question: "Which accounting software can I export to?",
    answer: "Our primary export is a structured Excel (.xlsx) file formatted to match the import templates for Tally Prime and Zoho Books. We also support native Tally XML voucher export for direct import into Tally ERP. You can configure custom Tally Ledger mappings in your Settings page to match your firm's chart of accounts."
  },
  {
    question: "How many invoices can I process per month?",
    answer: "During the Beta, every account gets 100 free invoice extractions. After that, you can top up your credit balance or subscribe to a monthly plan. The Pro plan (launching soon) will offer 1,000 extractions per month for ₹999/month. Batch uploads count each uploaded file as one credit."
  },
  {
    question: "Is there a mobile app?",
    answer: "Not yet, but our web app is fully responsive and works extremely well on mobile browsers. Your clients can use it to scan and upload bills directly from their phone. A dedicated Android app with offline scanning capabilities is on our roadmap for Q3 2026."
  },
  {
    question: "How do I get started?",
    answer: "Click 'Start Free Beta', create your account with your email, and you will have instant access to your dashboard with 100 free credits. No credit card is needed. The first scan typically takes under 5 seconds. We recommend starting with a clear, standard GST invoice to see the full extraction in action."
  }
];

const testimonials = [
  {
    name: "Example Scenario",
    title: "Mid-size CA Practice (40+ clients)",
    quote: "A practice processing 200 invoices per quarter can reduce that to under 20 minutes with KhataLens. The GSTIN validation alone catches suspended or cancelled dealers before export. The multi-client workspace means each client's data is fully isolated.",
    rating: 5
  },
  {
    name: "Example Scenario",
    title: "Multi-Client Tax Consultancy",
    quote: "The Excel output is pre-formatted for Tally Prime with native XML voucher export. The duplicate invoice detection flags invoices already in the system. The accuracy on blurry WhatsApp-compressed bills is achieved through AI vision models, not basic OCR.",
    rating: 5
  },
  {
    name: "Example Scenario",
    title: "Independent Practitioner",
    quote: "The cross-verification logic compares AI-extracted totals against computed line-item sums. When confidence drops below 95%, the field is flagged for manual review rather than silently guessed. That auditability is essential for compliance work.",
    rating: 5
  }
];

const features = [
  {
    icon: FileCheck,
    tag: "Core AI Engine",
    headline: "48-field extraction.\nNothing slips through.",
    body: "KhataLens acts like a Senior Accountant, not a simple OCR tool. It understands the distinction between CGST, SGST, and IGST. It cross-verifies line-item subtotals against the grand total. It reads Place of Supply and derives the correct inter-state or intra-state tax treatment — automatically. It even flags suspicious HSN codes that don't match item descriptions.",
    bullets: [
      "Full line-item extraction with HSN codes",
      "Automatic CGST / SGST / IGST classification",
      "Cross-verification of tax totals with confidence scoring",
      "Reads skewed photos & WhatsApp-compressed images",
      "Duplicate invoice detection",
      "AI fallback (OpenAI → Gemini) for reliability"
    ],
    side: 'right' as const,
    demo: (
      <div className="bg-bg-surface rounded-2xl p-8 shadow-xl border border-border transform -rotate-1 group-hover:rotate-0 transition-transform duration-700">
        <div className="flex justify-between border-b border-border pb-5 mb-5">
          <div>
            <div className="text-[10px] text-text-disabled font-bold uppercase tracking-widest mb-1">Supplier GSTIN</div>
            <div className="font-mono text-text-primary font-medium">27ABCDE1234F1Z5</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-text-disabled font-bold uppercase tracking-widest mb-1">State Code</div>
            <div className="font-mono text-text-primary font-medium">27 — Maharashtra</div>
          </div>
        </div>
        <div className="space-y-3 text-sm font-mono">
          {[
            { label: 'Item', val: 'Steel Pipes' },
            { label: 'HSN', val: '7306' },
            { label: 'Qty', val: '50 pcs' },
            { label: 'Taxable', val: '₹25,000' },
            { label: 'CGST 9%', val: '₹2,250', color: 'text-warning' },
            { label: 'SGST 9%', val: '₹2,250', color: 'text-warning' },
            { label: 'Total', val: '₹29,500', bold: true },
          ].map((row) => (
            <div key={row.label} className={`flex justify-between ${row.bold ? 'border-t border-border pt-3 font-bold text-text-primary' : 'text-text-secondary'}`}>
              <span>{row.label}</span>
              <span className={row.color || ''}>{row.val}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    icon: Layers,
    tag: "Multi-Tenancy",
    headline: "One dashboard.\nEvery client, perfectly isolated.",
    body: "Managing 50 firms is a different beast from managing 1. KhataLens is built from the ground up for CA practices. Each client gets a fully segregated workspace with its own GSTIN, invoice history, and export records. You can switch between clients in one click — with zero risk of data bleed.",
    bullets: [
      "Unlimited client workspaces",
      "Instant one-click context switching",
      "Database-level isolation (RLS enforced)",
      "Per-client GSTIN registration & tracking"
    ],
    side: 'left' as const,
    demo: (
      <div className="space-y-4">
        {[
          { name: 'TechCorp India Pvt Ltd', gstin: '27ABCDE1234F1Z5', count: 148, active: true },
          { name: 'Sharma Textile Traders', gstin: '06XYZAB5678C2Z1', count: 93, active: false },
          { name: 'Gupta Manufacturing Co.', gstin: '29PQRST9012D3Z7', count: 211, active: false },
        ].map((client, i) => (
          <div key={i} className={`rounded-2xl p-5 border flex items-center justify-between transition-all duration-300 ${client.active ? 'bg-bg-surface border-accent/40 shadow-md shadow-accent/10 translate-x-3' : 'bg-bg-sunken border-border hover:border-border-focus'}`}>
            <div>
              <div className={`font-display font-semibold ${client.active ? 'text-accent' : 'text-text-primary'}`}>{client.name}</div>
              <div className="text-xs font-mono text-text-disabled mt-1">{client.gstin}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-display font-bold text-text-primary">{client.count}</div>
              <div className="text-xs text-text-secondary">invoices</div>
            </div>
          </div>
        ))}
      </div>
    )
  },
  {
    icon: FileSpreadsheet,
    tag: "Export Engine",
    headline: "One click.\nTally-ready in seconds.",
    body: "Stop reformatting spreadsheets. KhataLens generates an Excel file that maps directly to Tally Prime's purchase voucher import format, Zoho Books' import template, and the GST portal's offline tool. Your data flows from bill to software with zero manual touch.",
    bullets: [
      "Tally Prime purchase voucher format",
      "Zoho Books & Busy Accounting compatible",
      "GST portal offline tool export",
      "Custom column mapping for any software"
    ],
    side: 'right' as const,
    demo: (
      <div className="bg-bg-surface rounded-2xl p-6 border border-border shadow-xl">
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-border">
          <div className="font-display font-semibold text-text-primary">Export Ready</div>
          <span className="px-3 py-1 bg-accent/10 text-accent text-xs font-bold rounded-full uppercase tracking-widest border border-accent/20">Tally Format</span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs font-mono text-text-disabled uppercase tracking-wider mb-3 px-2">
          {['Date', 'Party', 'GSTIN', 'Amount'].map(h => <div key={h}>{h}</div>)}
        </div>
        {[
          ['12/05', 'Steel Corp', '27AB…', '₹29,500'],
          ['14/05', 'Tech Ltd', '06XY…', '₹1,18,000'],
          ['15/05', 'Paper Co.', '29PQ…', '₹8,850'],
        ].map((row, i) => (
          <div key={i} className={`grid grid-cols-4 gap-2 text-sm font-mono py-3 px-2 rounded-lg ${i % 2 === 0 ? 'bg-bg-sunken' : ''}`}>
            {row.map((cell, j) => <div key={j} className="text-text-primary truncate">{cell}</div>)}
          </div>
        ))}
        <button className="mt-5 w-full py-3 rounded-xl bg-accent text-text-inverse text-sm font-semibold flex items-center justify-center gap-2 hover:bg-accent-hover transition-colors">
          <FileSpreadsheet className="w-4 h-4" /> Download .xlsx
        </button>
      </div>
    )
  },
  {
    icon: Zap,
    tag: "Batch Processing",
    headline: "100 invoices.\n3 minutes flat.",
    body: "Don't process bills one at a time. KhataLens accepts bulk uploads of up to 200 files at once. Our background queue processes them in parallel — while you work on something else. You get a single notification when the full batch is ready to export.",
    bullets: [
      "Bulk upload up to 200 files at once",
      "Background parallel processing queue",
      "Real-time progress tracking",
      "Failed items requeued automatically"
    ],
    side: 'left' as const,
    demo: (
      <div className="bg-bg-surface rounded-2xl p-6 border border-border shadow-xl space-y-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display font-semibold text-text-primary">Batch #247</span>
          <span className="text-sm text-warning font-medium">Processing…</span>
        </div>
        {[
          { name: 'invoice_batch_01.pdf', status: 'Done', pct: 100 },
          { name: 'whatsapp_img_1932.jpg', status: 'Done', pct: 100 },
          { name: 'bill_gupta_may.pdf', status: 'Reading…', pct: 65 },
          { name: 'purchase_order.png', status: 'Queued', pct: 0 },
        ].map((item, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary font-mono truncate pr-4">{item.name}</span>
              <span className={`font-medium shrink-0 ${item.status === 'Done' ? 'text-accent' : item.status === 'Reading…' ? 'text-warning' : 'text-text-disabled'}`}>{item.status}</span>
            </div>
            <div className="h-1.5 bg-bg-sunken rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${item.pct === 100 ? 'bg-accent' : 'bg-warning'}`}
                initial={{ width: 0 }}
                whileInView={{ width: `${item.pct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, delay: i * 0.2, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
        <div className="pt-2 border-t border-border text-sm text-text-disabled flex justify-between">
          <span>2 of 4 complete</span>
          <span>~45 sec remaining</span>
        </div>
      </div>
    )
  },
  {
    icon: Banknote,
    tag: "Bank Statements",
    headline: "Your PDFs,\nturned into data.",
    body: "Upload any PDF bank statement. Our specialized extractor pulls every transaction—deposits, withdrawals, and running balances—accurately, no matter how many pages.",
    bullets: [
      "Multi-page PDF extraction",
      "Debit/Credit categorization",
      "Math verification on balances",
      "Instant Tally-ready export"
    ],
    side: 'right' as const,
    demo: <BankStatementDemo />
  },
  {
    icon: Network,
    tag: "AI Reconciliation",
    headline: "Invoices meet bank txns.\nAutomatically.",
    body: "Stop checking off lines with a pencil. Our AI matching engine pairs your extracted invoices with your bank statement transactions. Approve exact matches with one click.",
    bullets: [
      "2-way fuzzy matching",
      "Handles partial & advance payments",
      "Auto-approve mode for exact matches",
      "Undo history and audit trail"
    ],
    side: 'left' as const,
    demo: <ReconciliationDemo />
  },
  {
    icon: Smartphone,
    tag: "WhatsApp Engine",
    headline: "Clients forward bills.\nWe do the rest.",
    body: "Give your clients a dedicated WhatsApp number. They forward photos of restaurant bills, taxi receipts, or vendor invoices. KhataLens automatically assigns them to their workspace and extracts the data.",
    bullets: [
      "Zero-friction client uploads",
      "Auto-assign to client workspaces",
      "Handles compressed images",
      "Instant confirmation to clients"
    ],
    side: 'right' as const,
    demo: <WhatsAppDemo />
  }
];

// ─── Main Component ──────────────────────────────────────────────────────────
export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-body overflow-x-hidden">

      {/* ── SEO Meta (inline for now, use react-helmet-async if installed) ── */}
      <title>KhataLens — AI Invoice Extraction for Indian CAs | GST Filing Automation</title>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 1 — NAVBAR
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header
        role="banner"
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-bg-surface/90 backdrop-blur-xl border-b border-border shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <nav className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between" aria-label="Primary navigation">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group" aria-label="KhataLens Home">
            <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-200">
              <KhataLensIcon size={20} className="text-white drop-shadow-md" />
            </div>
            <span className="text-xl font-display font-semibold tracking-tight text-text-primary">KhataLens</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors font-medium">Features</a>
            <a href="#pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors font-medium">Pricing</a>
            <a href="#faq" className="text-sm text-text-secondary hover:text-text-primary transition-colors font-medium">FAQ</a>
            <Link to="/auth" className="px-6 py-2.5 rounded-full border border-border hover:border-accent/50 text-text-primary hover:text-accent text-sm font-medium transition-all duration-200">
              Sign In
            </Link>
            <Link to="/auth" className="px-6 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-text-inverse text-sm font-medium transition-all duration-200 shadow-sm">
              Start Free
            </Link>
          </div>

          {/* Mobile Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-10 h-10 rounded-xl bg-bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </nav>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as any }}
              className="md:hidden bg-bg-surface border-b border-border overflow-hidden"
            >
              <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-4">
                <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-text-primary font-medium py-2 border-b border-border">Features</a>
                <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-text-primary font-medium py-2 border-b border-border">Pricing</a>
                <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="text-text-primary font-medium py-2 border-b border-border">FAQ</a>
                <Link to="/auth" onClick={() => setMobileMenuOpen(false)} className="mt-2 w-full py-3 rounded-xl bg-accent text-text-inverse text-center font-medium">Start Free Beta</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 2 — HERO
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative pt-40 pb-28 px-6 lg:pt-52 lg:pb-36 overflow-hidden" aria-labelledby="hero-heading">
        {/* Ambient Background Blobs */}
        <div aria-hidden="true" className="absolute top-24 -left-48 w-[36rem] h-[36rem] bg-accent-subtle rounded-full blur-[120px] -z-10 animate-[pulse_8s_ease-in-out_infinite]" />
        <div aria-hidden="true" className="absolute top-48 -right-48 w-[36rem] h-[36rem] bg-warning-subtle rounded-full blur-[120px] -z-10 animate-[pulse_10s_ease-in-out_infinite_2s]" />
        <div aria-hidden="true" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60rem] h-48 bg-accent-subtle rounded-full blur-[80px] -z-10 opacity-40" />

        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Copy */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as any }}
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-bg-surface border border-border shadow-sm text-text-secondary text-sm font-medium mb-10"
            >
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" aria-hidden="true" />
              Built exclusively for Indian Chartered Accountants
            </motion.div>

            <h1 id="hero-heading" className="text-[3.5rem] lg:text-[6.5rem] font-display font-extrabold tracking-tight mb-8 leading-[1.05] text-text-primary text-balance">
              From receipt scan<br className="hidden lg:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-hover block mt-2">to bank reconciliation.</span>
            </h1>

            <p className="text-xl text-text-secondary mb-10 max-w-xl leading-relaxed">
              KhataLens reads your messy bills, extracts the data, and reconciles it against bank statements. <strong className="text-text-primary font-medium">All AI. Zero typing.</strong>
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <Link
                to="/auth"
                id="hero-cta-primary"
                className="inline-flex items-center justify-center gap-3 px-9 py-4 rounded-2xl bg-accent hover:bg-accent-hover text-text-inverse font-semibold text-lg transition-all duration-200 shadow-lg shadow-accent/20 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent/25"
              >
                Start Free Beta <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-9 py-4 rounded-2xl bg-bg-surface border border-border hover:border-text-disabled text-text-primary font-medium text-lg transition-all duration-200 hover:bg-bg-sunken shadow-sm hover:shadow"
              >
                <PlayCircle className="w-5 h-5 text-accent" aria-hidden="true" />
                See how it works
              </a>
            </div>

            <p className="text-sm text-text-secondary font-medium tracking-wide">
              100 free extractions · No credit card · Instant access
            </p>
          </motion.div>

          {/* Right: Hero Animation */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] as any, delay: 0.15 }}
            className="relative"
            aria-hidden="true"
          >
            <div className="absolute -inset-4 bg-gradient-to-tr from-accent/5 via-transparent to-transparent z-10 pointer-events-none rounded-3xl" />
            <div className="rounded-3xl bg-bg-surface border border-border shadow-2xl backdrop-blur-sm relative overflow-hidden">
              <HeroAnimation />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 3 — TRUST BAR / SOCIAL PROOF
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-20 px-6 bg-bg-surface border-y border-border" aria-label="Platform statistics">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-16"
          >
            <motion.div variants={fadeUp}>
              <StatCounter target={48} suffix="+" label="Fields Extracted" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCounter target={3} suffix="s" label="Avg Scan Time" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCounter target={98} suffix="%" label="Recon Accuracy" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCounter target={0} suffix="" label="Manual Typing" />
            </motion.div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={fadeUp}
            className="mt-16 pt-16 border-t border-border flex flex-wrap items-center justify-center gap-10"
          >
            <div className="flex items-center gap-3 text-text-secondary text-sm font-medium">
              <ShieldCheck className="w-5 h-5 text-accent" aria-hidden="true" />
              Supabase RLS Isolation
            </div>
            <div className="flex items-center gap-3 text-text-secondary text-sm font-medium">
              <Lock className="w-5 h-5 text-accent" aria-hidden="true" />
              End-to-end Encrypted
            </div>
            <div className="flex items-center gap-3 text-text-secondary text-sm font-medium">
              <Award className="w-5 h-5 text-accent" aria-hidden="true" />
              GSTIN Verified Output
            </div>
            <div className="flex items-center gap-3 text-text-secondary text-sm font-medium">
              <Building2 className="w-5 h-5 text-accent" aria-hidden="true" />
              Tally & Zoho Compatible
            </div>
            <div className="flex items-center gap-3 text-text-secondary text-sm font-medium">
              <Clock className="w-5 h-5 text-accent" aria-hidden="true" />
              No Data Retention
            </div>
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 4 — HOW IT WORKS
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="how-it-works" className="py-32 px-6 bg-bg-base" aria-labelledby="how-heading">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="text-center mb-24"
          >
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-accent border border-accent/20 bg-accent/5 mb-6">
              How It Works
            </span>
            <h2 id="how-heading" className="text-4xl lg:text-6xl font-display font-bold mb-6 text-text-primary">Three steps. Zero typing.</h2>
            <p className="text-text-secondary text-xl max-w-2xl mx-auto font-light">
              From a crumpled bill on your desk to a filed return in minutes.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid md:grid-cols-3 gap-8 relative"
          >
            {/* Connecting Line (desktop) */}
            <div aria-hidden="true" className="hidden md:block absolute top-16 left-[calc(33%+2rem)] right-[calc(33%+2rem)] h-px bg-gradient-to-r from-border via-accent/30 to-border" />

            {[
              { num: '01', icon: Upload, title: 'Upload Invoices', desc: 'Drag & drop PDFs, JPGs, PNGs — even compressed WhatsApp photos. Bulk upload 200 files at once.' },
              { num: '02', icon: Zap, title: 'AI Extracts Everything', desc: 'AI reads GSTIN, HSN codes, line items, tax breakdowns, and validates totals in seconds.', highlight: true },
              { num: '03', icon: FileSpreadsheet, title: 'Export & File', desc: 'Download a Tally-ready Excel file. Import directly into your accounting software. Done.' },
            ].map((step) => (
              <motion.div
                key={step.num}
                variants={fadeUp}
                className={`relative rounded-3xl p-10 border text-center transition-all duration-300 hover:-translate-y-1 ${
                  step.highlight
                    ? 'bg-bg-surface border-accent/30 shadow-2xl shadow-accent/10 md:scale-105'
                    : 'bg-bg-sunken border-border hover:border-border-focus hover:shadow-lg'
                }`}
              >
                {step.highlight && (
                  <div aria-hidden="true" className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 bg-accent text-text-inverse text-[11px] font-bold rounded-full uppercase tracking-widest shadow-md">
                    AI Magic Here
                  </div>
                )}
                <div className="text-5xl font-display font-bold text-text-disabled/40 mb-6 select-none">{step.num}</div>
                <div className={`w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center border ${step.highlight ? 'bg-accent/10 border-accent/20' : 'bg-bg-surface border-border'}`}>
                  <step.icon className={`w-8 h-8 ${step.highlight ? 'text-accent' : 'text-text-secondary'}`} aria-hidden="true" />
                </div>
                <h3 className="text-2xl font-display font-semibold text-text-primary mb-4">{step.title}</h3>
                <p className="text-text-secondary leading-relaxed font-light">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 5 — FEATURE DEEP DIVES
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="features" className="py-32 px-6 bg-bg-surface border-y border-border" aria-labelledby="features-heading">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="text-center mb-28"
          >
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-accent border border-accent/20 bg-accent/5 mb-6">
              Features
            </span>
            <h2 id="features-heading" className="text-4xl lg:text-6xl font-display font-bold mb-6 text-text-primary">Built for the way CAs actually work.</h2>
            <p className="text-text-secondary text-xl max-w-2xl mx-auto font-light">
              Every feature was designed after talking to practicing Chartered Accountants about their real pain points.
            </p>
          </motion.div>

          <div className="space-y-40">
            {features.map((feat, idx) => (
              <motion.div
                key={idx}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={fadeUp}
                className={`flex flex-col ${feat.side === 'left' ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-20`}
              >
                {/* Copy */}
                <div className="flex-1 space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-bg-base border border-border flex items-center justify-center shadow-sm">
                      <feat.icon className="w-7 h-7 text-accent" aria-hidden="true" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-accent">{feat.tag}</span>
                  </div>
                  <h3 className="text-4xl lg:text-5xl font-display font-bold text-text-primary leading-tight whitespace-pre-line">
                    {feat.headline}
                  </h3>
                  <p className="text-xl text-text-secondary leading-relaxed font-light">{feat.body}</p>
                  <ul className="space-y-3 pt-2" aria-label={`${feat.tag} feature list`}>
                    {feat.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-3 text-text-primary font-medium">
                        <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Demo Card */}
                <div className="flex-1 w-full group">
                  <div className="bg-bg-base rounded-[2rem] p-8 border border-border relative overflow-hidden hover:border-border-focus transition-colors duration-500">
                    <div aria-hidden="true" className="absolute inset-0 bg-accent-subtle opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-[2rem]" />
                    <div className="relative z-10">
                      {feat.demo}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 6 — ROADMAP
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-32 px-6 bg-bg-base" aria-labelledby="roadmap-heading">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="text-center mb-20"
          >
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-accent border border-accent/20 bg-accent/5 mb-6">
              Roadmap
            </span>
            <h2 id="roadmap-heading" className="text-4xl lg:text-6xl font-display font-bold mb-6 text-text-primary">The Tax OS is just getting started.</h2>
            <p className="text-text-secondary text-xl max-w-2xl mx-auto font-light">
              These features are actively being built. Beta users get first access.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid md:grid-cols-2 gap-8"
          >
            {[
              { icon: ShieldCheck, title: 'GSTR-2B AI Deep Match', desc: 'Upload the government\'s GSTR-2B JSON. Our AI fuzzy-matches it against your scanned bills, instantly flagging lost ITC due to vendor typos.', quarter: 'Q3 2026' },
              { icon: Smartphone, title: 'Native Android App', desc: 'A dedicated Android app for you and your clients. Offline scanning, better edge detection, and push notifications for required approvals.', quarter: 'Q3 2026' },
              { icon: BarChart3, title: 'Tax Liability Predictor', desc: 'Import a sales register. KhataLens calculates real-time GST liability (Sales Tax minus ITC), giving clients a cashflow dashboard before filing.', quarter: 'Q4 2026' },
              { icon: Calculator, title: 'Multi-Currency Recon', desc: 'Handle international invoices and bank statements with automatic real-time exchange rate conversions and forex gain/loss calculations.', quarter: 'Q4 2026' },
            ].map((item, i) => (
              <motion.article
                key={i}
                variants={fadeUp}
                className="bg-bg-surface border border-border rounded-3xl p-10 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 transition-all duration-500 group"
              >
                <div className="flex justify-between items-start mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-bg-base border border-border flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                    <item.icon className="w-7 h-7 text-accent" aria-hidden="true" />
                  </div>
                  <span className="px-4 py-1.5 bg-bg-base text-text-secondary border border-border text-xs font-bold uppercase tracking-widest rounded-full">{item.quarter}</span>
                </div>
                <h3 className="text-2xl font-display font-semibold text-text-primary mb-4">{item.title}</h3>
                <p className="text-text-secondary leading-relaxed font-light">{item.desc}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 7 — PRICING
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="pricing" className="py-32 px-6 bg-bg-surface border-y border-border" aria-labelledby="pricing-heading">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="text-center mb-20"
          >
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-accent border border-accent/20 bg-accent/5 mb-6">
              Pricing
            </span>
            <h2 id="pricing-heading" className="text-4xl lg:text-6xl font-display font-bold mb-6 text-text-primary">Simple, honest pricing.</h2>
            <p className="text-text-secondary text-xl max-w-2xl mx-auto font-light">
              Start for free. Scale as your practice grows. No hidden fees.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {/* Free Beta */}
            <motion.div variants={fadeUp} className="bg-bg-base rounded-3xl p-8 border border-border hover:border-border-focus transition-all duration-300">
              <div className="mb-6">
                <div className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-4">Starter</div>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-4xl lg:text-5xl font-display font-bold text-text-primary">₹2,499</span>
                  <span className="text-text-secondary pb-1 font-light text-sm">/ month</span>
                </div>
                <p className="text-text-secondary font-light text-sm">Perfect for solo practitioners and small businesses.</p>
              </div>
              <ul className="space-y-3 mb-8 text-sm" aria-label="Starter plan features">
                {[
                  '1,000 invoice extractions',
                  '10 bank statement pages',
                  'Unlimited workspaces',
                  'Excel + CSV export',
                  'Email support',
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-text-primary font-medium">
                    <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" /> <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link to="/auth" className="block w-full py-3 rounded-xl border border-border text-center font-semibold text-text-primary hover:border-accent/40 hover:text-accent transition-all duration-200">
                Get Started
              </Link>
            </motion.div>

            {/* Pro */}
            <motion.div
              variants={fadeUp}
              className="relative bg-bg-base rounded-3xl p-8 border-2 border-accent shadow-2xl shadow-accent/10 transform md:-translate-y-4"
            >
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent rounded-3xl" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="text-xs font-bold uppercase tracking-widest text-accent">Pro</div>
                  <span className="px-2.5 py-1 bg-accent text-text-inverse text-[10px] font-bold rounded-full uppercase tracking-widest flex items-center gap-1">
                    <Star className="w-3 h-3" /> Most Popular
                  </span>
                </div>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-4xl lg:text-5xl font-display font-bold text-text-primary">₹7,999</span>
                  <span className="text-text-secondary pb-1 font-light text-sm">/ month</span>
                </div>
                <p className="text-text-secondary font-light text-sm mb-6">Everything in Starter, plus AI Reconciliation and WhatsApp.</p>
                <ul className="space-y-3 mb-8 text-sm" aria-label="Pro plan features">
                  {[
                    '5,000 invoice extractions',
                    'Unlimited bank statements',
                    'AI Recon Engine (Auto-match)',
                    'WhatsApp Receipt Engine',
                    'Batch processing queue',
                    'Dedicated CA support',
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-text-primary font-medium">
                      <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" /> <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/auth" className="block w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-text-inverse text-center font-semibold transition-all duration-200 shadow-lg shadow-accent/20">
                  Start Pro Trial
                </Link>
              </div>
            </motion.div>

            {/* Custom */}
            <motion.div variants={fadeUp} className="bg-bg-base rounded-3xl p-8 border border-border hover:border-border-focus transition-all duration-300">
              <div className="mb-6">
                <div className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-4">CA Firm / Enterprise</div>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-4xl lg:text-5xl font-display font-bold text-text-primary">Custom</span>
                </div>
                <p className="text-text-secondary font-light text-sm">Tailored for large practices with high volumes.</p>
              </div>
              <ul className="space-y-3 mb-8 text-sm" aria-label="Enterprise plan features">
                {[
                  'Custom extraction volumes',
                  'White-labeled portal',
                  'API Access for integrations',
                  'On-premise deployment options',
                  'Dedicated Account Manager',
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-text-primary font-medium">
                    <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" /> <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a href="mailto:sales@khatalens.com" className="block w-full py-3 rounded-xl border border-border text-center font-semibold text-text-primary hover:border-accent/40 hover:text-accent transition-all duration-200">
                Contact Sales
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 8 — TESTIMONIALS
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-32 px-6 bg-bg-base" aria-labelledby="testimonials-heading">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="text-center mb-20"
          >
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-accent border border-accent/20 bg-accent/5 mb-6">
              Testimonials
            </span>
            <h2 id="testimonials-heading" className="text-4xl lg:text-6xl font-display font-bold mb-6 text-text-primary">
              CAs who switched.<br />
              <em className="text-accent not-italic">They didn't switch back.</em>
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid md:grid-cols-3 gap-8"
          >
            {testimonials.map((t, i) => (
              <motion.blockquote
                key={i}
                variants={fadeUp}
                className="bg-bg-surface rounded-3xl p-10 border border-border hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 transition-all duration-500 flex flex-col"
              >
                <div className="flex gap-1 mb-8" aria-label={`${t.rating} out of 5 stars`}>
                  {Array.from({ length: t.rating }).map((_, si) => (
                    <Star key={si} className="w-4 h-4 text-warning fill-current" aria-hidden="true" />
                  ))}
                </div>
                <Quote className="w-8 h-8 text-accent/30 mb-6 shrink-0" aria-hidden="true" />
                <p className="text-text-primary leading-relaxed font-light flex-1 italic">"{t.quote}"</p>
                <footer className="mt-8 pt-8 border-t border-border">
                  <div className="font-display font-semibold text-text-primary">{t.name}</div>
                  <div className="text-sm text-text-secondary mt-1 font-light">{t.title}</div>
                </footer>
              </motion.blockquote>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 9 — FAQ
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="faq" className="py-32 px-6 bg-bg-surface border-t border-border" aria-labelledby="faq-heading">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="text-center mb-20"
          >
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-accent border border-accent/20 bg-accent/5 mb-6">
              FAQ
            </span>
            <h2 id="faq-heading" className="text-4xl lg:text-5xl font-display font-bold mb-6 text-text-primary">
              Questions CAs actually ask.
            </h2>
            <p className="text-text-secondary text-xl font-light">
              No marketing fluff. Straight answers.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="space-y-4"
            role="list"
          >
            {faqData.map((item, i) => (
              <motion.div key={i} variants={fadeUp} role="listitem">
                <FaqItem question={item.question} answer={item.answer} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 10 — FINAL CTA + FOOTER
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer className="bg-bg-base border-t border-border">
        {/* Final CTA Banner */}
        <div className="py-40 px-6 text-center relative overflow-hidden">
          <div aria-hidden="true" className="absolute top-0 left-1/2 -translate-x-1/2 w-[60rem] h-[30rem] bg-accent-subtle rounded-full blur-[120px] -z-10 opacity-60" />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", bounce: 0.35, duration: 0.8 }}
            className="w-28 h-28 mx-auto rounded-[2rem] bg-bg-surface border border-border flex items-center justify-center mb-12 shadow-2xl"
          >
            <KhataLensIcon size={56} animate={true} />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as any }}
            className="text-5xl lg:text-7xl font-display font-bold mb-8 text-text-primary tracking-tight"
          >
            Your practice deserves<br />
            <em className="text-accent not-italic">better tools.</em>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] as any }}
            className="text-2xl text-text-secondary mb-14 max-w-2xl mx-auto font-light"
          >
            Join 500+ Chartered Accountants who are already processing invoices in seconds, not hours.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] as any }}
            className="flex flex-col sm:flex-row items-center justify-center gap-5"
          >
            <Link
              to="/auth"
              id="footer-cta"
              className="inline-flex items-center gap-3 px-12 py-5 rounded-2xl bg-accent hover:bg-accent-hover text-text-inverse font-semibold text-xl transition-all duration-200 shadow-2xl shadow-accent/25 hover:-translate-y-1 hover:shadow-accent/35"
            >
              Start Free — 100 Extractions <ArrowRight className="w-6 h-6" aria-hidden="true" />
            </Link>
          </motion.div>
          <p className="mt-6 text-sm text-text-disabled font-medium">No credit card · Instant access · Cancel anytime</p>
        </div>

        {/* Footer Links */}
        <div className="border-t border-border py-12 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <KhataLensIcon size={16} className="text-white" />
              </div>
              <span className="font-display font-semibold text-text-primary">KhataLens</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-text-secondary">
              <a href="#features" className="hover:text-text-primary transition-colors">Features</a>
              <a href="#pricing" className="hover:text-text-primary transition-colors">Pricing</a>
              <a href="#faq" className="hover:text-text-primary transition-colors">FAQ</a>
              <Link to="/auth" className="hover:text-text-primary transition-colors">Sign In</Link>
              <a href="mailto:support@khatalens.com" className="hover:text-text-primary transition-colors">Contact</a>
            </div>
            <p className="text-sm text-text-disabled font-medium">
              &copy; {new Date().getFullYear()} KhataLens. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Reduced motion fallback */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}
