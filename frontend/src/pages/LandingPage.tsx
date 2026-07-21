import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Network, Banknote, CheckCircle2,
  FileCheck, Layers, Upload, FileSpreadsheet, Lock, Menu, X,
  Plus, Minus, Building2, Smartphone
} from 'lucide-react';
import LandingHero from '../components/LandingHero';
import HeroAnimation from '../components/HeroAnimation';
import { BankStatementDemo, ReconciliationDemo } from '../components/LandingFeatures';
import KhataLensIcon from '../components/KhataLensIcon';
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  creditLabel,
  formatInr,
  perCreditInr,
} from '../lib/pricing';

const starterPack = CREDIT_PACKS.find((p) => p.type === 'starter')!;
const proPack = CREDIT_PACKS.find((p) => p.type === 'pro')!;

const ease = [0.22, 1, 0.36, 1] as const;

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left bg-bg-surface hover:bg-bg-sunken/60 transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <span className="text-base font-display font-medium text-text-primary pr-6">{question}</span>
        <span className="shrink-0 w-7 h-7 rounded-md bg-bg-sunken border border-border flex items-center justify-center text-text-secondary">
          {open ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-text-secondary leading-relaxed border-t border-border pt-4 text-sm">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const faqData = [
  {
    question: "What file formats does KhataLens support?",
    answer: "PDFs (single and multi-page), JPEG, PNG, and WEBP. We optimise for phone photos of bills — including skewed or compressed images from messaging apps."
  },
  {
    question: "How does AI extraction work?",
    answer: "KhataLens extracts GSTIN, invoice number, date, line items, HSN, and tax totals. Critical fields are cross-checked where possible. Low-confidence fields are flagged for your review instead of being silently guessed. Accuracy varies by document quality — always verify before filing."
  },
  {
    question: "Is my client data secure?",
    answer: "Each client workspace is isolated with Row-Level Security (RLS) in PostgreSQL. Uploaded files are processed in memory for extraction. We run on Supabase infrastructure. Your clients' data stays logically separate across firms."
  },
  {
    question: "Can I manage multiple clients from one account?",
    answer: "Yes. Create client workspaces, each with its own GSTIN and invoice history. Switch context in one click from the sidebar — nothing from one client bleeds into another."
  },
  {
    question: "Which accounting software can I export to?",
    answer: "Structured Excel (.xlsx) formatted for Tally Prime and Zoho Books import templates, plus native Tally XML voucher export. Configure ledger mappings in Settings to match your chart of accounts."
  },
  {
    question: "How do credits and pricing work?",
    answer: `AI tasks spend prepaid wallet credits — not a monthly subscription. Invoice scan costs ${creditLabel(CREDIT_COSTS.invoiceScan)}; bank statements from ${creditLabel(CREDIT_COSTS.bankStatementBase)}; AI Deep Match from ${creditLabel(CREDIT_COSTS.deepMatchBase)}. Top up with Starter (${formatInr(starterPack.priceInr)} / ${starterPack.credits.toLocaleString('en-IN')} credits) or Pro (${formatInr(proPack.priceInr)} / ${proPack.credits.toLocaleString('en-IN')} credits). Credits do not expire. New accounts receive starter credits on signup.`
  },
  {
    question: "Is there a mobile app?",
    answer: "Not yet. The web app is responsive and works on mobile browsers for scanning and uploads. A dedicated Android app is on the roadmap."
  },
  {
    question: "How do I get started?",
    answer: "Create an account with your email — no credit card required. Open the dashboard, add a client (or your own business), and scan a clear GST invoice to see extraction in action."
  }
];

const workflowSteps = [
  { num: '01', icon: Upload, title: 'Upload', desc: 'PDFs, JPGs, PNGs — one file or a batch ZIP.' },
  { num: '02', icon: FileCheck, title: 'Extract', desc: 'GSTIN, HSN, line items, and tax totals — flagged when unsure.' },
  { num: '03', icon: Network, title: 'Reconcile', desc: 'Match against GSTR-2B and bank statements.' },
  { num: '04', icon: FileSpreadsheet, title: 'Export', desc: 'Tally-ready Excel or XML when you are ready to file.' },
];

const capabilities = [
  {
    icon: FileCheck,
    title: 'Invoice extraction',
    body: 'Line items, HSN, CGST/SGST/IGST, and totals with confidence flags for review.',
  },
  {
    icon: Layers,
    title: 'Multi-client desk',
    body: 'Isolated workspaces per GSTIN. Switch clients without mixing data.',
  },
  {
    icon: Banknote,
    title: 'Bank statements',
    body: 'Pull transactions from PDF or spreadsheet statements for matching.',
  },
  {
    icon: Network,
    title: 'GSTR-2B & bank match',
    body: 'Flag unmatched ITC and payment gaps before you file.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Tally-ready export',
    body: 'Excel and XML mapped to purchase voucher import formats.',
  },
  {
    icon: Smartphone,
    title: 'Client uploads',
    body: 'Clients can send bills via portal upload; WhatsApp capture is available where configured.',
  },
];

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
      <title>KhataLens — GST invoice scanning & reconciliation for Indian CAs</title>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "SoftwareApplication",
            "name": "KhataLens",
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Web",
            "description": "GST invoice scanning, data extraction, and GSTR-2B reconciliation for Indian Chartered Accountants. Prepaid AI credits — no monthly subscription required.",
            "offers": [
              {
                "@type": "Offer",
                "name": starterPack.name,
                "price": String(starterPack.priceInr),
                "priceCurrency": "INR",
                "description": `${starterPack.credits.toLocaleString('en-IN')} prepaid credits`
              },
              {
                "@type": "Offer",
                "name": proPack.name,
                "price": String(proPack.priceInr),
                "priceCurrency": "INR",
                "description": `${proPack.credits.toLocaleString('en-IN')} prepaid credits`
              }
            ]
          },
          {
            "@type": "FAQPage",
            "mainEntity": faqData.map(faq => ({
              "@type": "Question",
              "name": faq.question,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": faq.answer
              }
            }))
          }
        ]
      }) }} />

      {/* Nav — solid fog bar when scrolled, no glass */}
      <header
        role="banner"
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-bg-surface border-b border-border shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <nav className="max-w-content mx-auto px-6 h-16 flex items-center justify-between" aria-label="Primary navigation">
          <Link to="/" className="flex items-center gap-2.5 group" aria-label="KhataLens Home">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <KhataLensIcon size={18} className="text-white" />
            </div>
            <span className="text-lg font-display font-semibold tracking-tight text-text-primary">KhataLens</span>
          </Link>

          <div className="hidden md:flex items-center gap-7">
            <a href="#workflow" className="text-sm text-text-secondary hover:text-text-primary transition-colors font-medium">Workflow</a>
            <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors font-medium">Features</a>
            <a href="#pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors font-medium">Pricing</a>
            <a href="#faq" className="text-sm text-text-secondary hover:text-text-primary transition-colors font-medium">FAQ</a>
            <Link to="/auth" className="text-sm font-medium text-text-primary hover:text-accent transition-colors">
              Sign In
            </Link>
            <Link to="/auth" className="btn-primary !h-9 !rounded-lg !text-sm px-4">
              Start free
            </Link>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-10 h-10 rounded-lg bg-bg-surface border border-border flex items-center justify-center text-text-secondary"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </nav>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease }}
              className="md:hidden bg-bg-surface border-b border-border overflow-hidden"
            >
              <div className="max-w-content mx-auto px-6 py-5 flex flex-col gap-3">
                <a href="#workflow" onClick={() => setMobileMenuOpen(false)} className="text-text-primary font-medium py-2 border-b border-border">Workflow</a>
                <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-text-primary font-medium py-2 border-b border-border">Features</a>
                <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-text-primary font-medium py-2 border-b border-border">Pricing</a>
                <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="text-text-primary font-medium py-2 border-b border-border">FAQ</a>
                <Link to="/auth" onClick={() => setMobileMenuOpen(false)} className="text-text-primary font-medium py-2 border-b border-border">Sign In</Link>
                <Link to="/auth" onClick={() => setMobileMenuOpen(false)} className="mt-2 btn-primary w-full">Start free</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hero — full-bleed sealed ledger (LandingHero owns motions 1–2) */}
      <LandingHero />

      {/* Trust strip — below fold; facts only, no fake ratings */}
      <section className="py-8 px-6 border-y border-border bg-bg-surface" aria-label="Product facts">
        <div className="max-w-content mx-auto flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-text-secondary font-medium">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-accent" aria-hidden="true" /> Supabase RLS isolation</span>
          <span className="inline-flex items-center gap-2"><Lock className="w-4 h-4 text-accent" aria-hidden="true" /> Org-scoped wallets</span>
          <span className="inline-flex items-center gap-2"><Building2 className="w-4 h-4 text-accent" aria-hidden="true" /> Tally & Zoho export</span>
          <span className="inline-flex items-center gap-2"><FileCheck className="w-4 h-4 text-accent" aria-hidden="true" /> GSTIN field validation</span>
        </div>
      </section>

      {/* Workflow — Motion 2: stagger once */}
      <section id="workflow" className="py-20 md:py-28 px-6" aria-labelledby="workflow-heading">
        <div className="max-w-content mx-auto">
          <div className="mb-12 max-w-xl">
            <h2 id="workflow-heading" className="text-3xl md:text-4xl font-display font-semibold text-text-primary mb-3">
              Four steps on the desk
            </h2>
            <p className="text-text-secondary text-lg">
              From a photograph of a bill to a filing-ready export — without reformatting spreadsheets by hand.
            </p>
          </div>

          <motion.ol
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08 } }
            }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 list-none p-0 m-0"
          >
            {workflowSteps.map((step) => (
              <motion.li
                key={step.num}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease } }
                }}
                className="border-t border-border pt-5"
              >
                <div className="text-xs font-mono text-text-disabled mb-3">{step.num}</div>
                <step.icon className="w-5 h-5 text-text-secondary mb-3" aria-hidden="true" />
                <h3 className="font-display text-xl font-semibold text-text-primary mb-2">{step.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{step.desc}</p>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      {/* Features — minimal cards only as list containers */}
      <section id="features" className="py-20 md:py-28 px-6 bg-bg-surface border-y border-border" aria-labelledby="features-heading">
        <div className="max-w-content mx-auto">
          <div className="mb-14 max-w-xl">
            <h2 id="features-heading" className="text-3xl md:text-4xl font-display font-semibold text-text-primary mb-3">
              Built for CA practice work
            </h2>
            <p className="text-text-secondary text-lg">
              Core tools stay available. AI tasks spend org wallet credits.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12 mb-20">
            {capabilities.map((cap) => (
              <div key={cap.title}>
                <cap.icon className="w-5 h-5 text-text-secondary mb-3" aria-hidden="true" />
                <h3 className="font-display text-lg font-semibold text-text-primary mb-2">{cap.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{cap.body}</p>
              </div>
            ))}
          </div>

          {/* Product demos — below fold; scan animation + match samples */}
          <div className="space-y-12">
            <div>
              <h3 className="font-display text-xl font-semibold mb-2 text-text-primary">Scan desk</h3>
              <p className="text-sm text-text-secondary mb-4 max-w-lg">
                Bills in, structured fields out — flagged when extraction is unsure.
              </p>
              <div className="border border-border bg-bg-base overflow-hidden max-w-3xl">
                <HeroAnimation />
              </div>
            </div>
            <div className="grid lg:grid-cols-2 gap-10">
              <div>
                <h3 className="font-display text-xl font-semibold mb-4 text-text-primary">Bank statement extract</h3>
                <div className="border border-border bg-bg-base p-4 overflow-hidden">
                  <BankStatementDemo />
                </div>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold mb-4 text-text-primary">Invoice ↔ bank match</h3>
                <div className="border border-border bg-bg-base p-4 overflow-hidden">
                  <ReconciliationDemo />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing — prepaid packs, honest enterprise */}
      <section id="pricing" className="py-20 md:py-28 px-6" aria-labelledby="pricing-heading">
        <div className="max-w-narrow mx-auto">
          <div className="text-center mb-14">
            <h2 id="pricing-heading" className="text-3xl md:text-4xl font-display font-semibold text-text-primary mb-3">
              Prepaid credit packs
            </h2>
            <p className="text-text-secondary text-lg max-w-lg mx-auto">
              One-time top-ups. No monthly subscription. Credits stay in your org wallet until you use them.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Starter */}
            <div className="bg-bg-surface rounded-xl p-7 border border-border">
              <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">{starterPack.shortName}</div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-display font-semibold text-text-primary font-mono">{formatInr(starterPack.priceInr)}</span>
              </div>
              <p className="text-sm text-text-secondary mb-5">
                {starterPack.credits.toLocaleString('en-IN')} credits · {perCreditInr(starterPack)}
              </p>
              <ul className="space-y-2.5 mb-7 text-sm" aria-label="Starter pack includes">
                {[
                  `${starterPack.credits.toLocaleString('en-IN')} prepaid credits`,
                  'Invoice scan, bank parse, deep match',
                  'Unlimited client workspaces',
                  'Excel + Tally XML export',
                  'Credits never expire',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-text-primary">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link to="/auth" className="btn-secondary w-full">
                Get started
              </Link>
            </div>

            {/* Pro — copper border / CTA only */}
            <div className="relative bg-bg-surface rounded-xl p-7 border-2 border-accent">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-accent">{proPack.shortName}</div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent-subtle px-2 py-0.5 rounded-md">
                  Popular
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-display font-semibold text-text-primary font-mono">{formatInr(proPack.priceInr)}</span>
              </div>
              <p className="text-sm text-text-secondary mb-5">
                {proPack.credits.toLocaleString('en-IN')} credits · {perCreditInr(proPack)}
              </p>
              <ul className="space-y-2.5 mb-7 text-sm" aria-label="Pro pack includes">
                {[
                  `${proPack.credits.toLocaleString('en-IN')} prepaid credits`,
                  'Priority support',
                  'AI Deep Match included in wallet use',
                  'Batch ZIP processing',
                  'Credits never expire',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-text-primary">
                    <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link to="/auth" className="btn-primary w-full">
                Buy Pro pack
              </Link>
            </div>

            {/* Enterprise */}
            <div className="bg-bg-surface rounded-xl p-7 border border-border">
              <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">Enterprise</div>
              <div className="mb-1">
                <span className="text-3xl font-display font-semibold text-text-primary">Custom</span>
              </div>
              <p className="text-sm text-text-secondary mb-5">
                High-volume practices and firms that need a tailored credit arrangement.
              </p>
              <ul className="space-y-2.5 mb-7 text-sm" aria-label="Enterprise">
                {[
                  'Volume credit packs',
                  'Dedicated onboarding support',
                  'Account manager for your firm',
                  'Contact sales for a quote',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-text-primary">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a href="mailto:sales@khatalens.com" className="btn-secondary w-full">
                Contact Sales
              </a>
            </div>
          </div>

          <p className="text-center text-sm text-text-secondary mt-8">
            Task costs: scan {creditLabel(CREDIT_COSTS.invoiceScan)} · bank from {creditLabel(CREDIT_COSTS.bankStatementBase)} · deep match from {creditLabel(CREDIT_COSTS.deepMatchBase)}.
            {' '}<Link to="/pricing" className="text-accent hover:underline">Full pricing details</Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 md:py-28 px-6 bg-bg-surface border-t border-border" aria-labelledby="faq-heading">
        <div className="max-w-prose mx-auto">
          <div className="mb-10">
            <h2 id="faq-heading" className="text-3xl md:text-4xl font-display font-semibold text-text-primary mb-3">
              Questions from the desk
            </h2>
            <p className="text-text-secondary">
              Straight answers — no invented ratings or user counts.
            </p>
          </div>
          <div className="space-y-3" role="list">
            {faqData.map((item) => (
              <div key={item.question} role="listitem">
                <FaqItem question={item.question} answer={item.answer} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA + footer */}
      <footer className="bg-bg-base border-t border-border">
        <div className="py-24 px-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-xl bg-accent flex items-center justify-center mb-8">
            <KhataLensIcon size={28} className="text-white" />
          </div>
          <h2 className="text-3xl md:text-5xl font-display font-semibold mb-4 text-text-primary tracking-tight">
            Ready for month-end?
          </h2>
          <p className="text-lg text-text-secondary mb-10 max-w-md mx-auto">
            Open a workspace, scan a bill, and see extraction on your own documents.
          </p>
          <Link
            to="/auth"
            id="footer-cta"
            className="btn-primary !h-12 !px-8 !text-base inline-flex"
          >
            Start free <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <p className="mt-5 text-sm text-text-disabled">No credit card · Instant access</p>
        </div>

        <div className="border-t border-border py-10 px-6">
          <div className="max-w-content mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
                <KhataLensIcon size={14} className="text-white" />
              </div>
              <span className="font-display font-semibold text-text-primary">KhataLens</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary">
              <a href="#features" className="hover:text-text-primary transition-colors">Features</a>
              <a href="#pricing" className="hover:text-text-primary transition-colors">Pricing</a>
              <Link to="/pricing" className="hover:text-text-primary transition-colors">Credit packs</Link>
              <a href="#faq" className="hover:text-text-primary transition-colors">FAQ</a>
              <Link to="/auth" className="hover:text-text-primary transition-colors">Sign In</Link>
              <a href="mailto:support@khatalens.com" className="hover:text-text-primary transition-colors">Contact</a>
            </div>
            <p className="text-sm text-text-disabled">
              &copy; {new Date().getFullYear()} KhataLens
            </p>
          </div>
        </div>
      </footer>

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
