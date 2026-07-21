import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Upload, FileSpreadsheet, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  creditLabel,
  formatInr,
  perCreditInr,
} from '../lib/pricing';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } }
};

const stagger = {
  visible: {
    transition: { staggerChildren: 0.1 }
  }
};

const TASK_CARDS = [
  {
    icon: Upload,
    title: 'Invoice Scan',
    credits: CREDIT_COSTS.invoiceScan,
    description: 'Extract all details, line items, and GST validations from a single invoice.',
    popular: false,
  },
  {
    icon: FileSpreadsheet,
    title: 'Bank Statement',
    credits: CREDIT_COSTS.bankStatementBase,
    description: 'Process and digitize complex PDF or Excel bank statements.',
    note: '*Base cost per statement',
    popular: false,
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp Receipt',
    credits: CREDIT_COSTS.whatsappReceipt,
    description: 'Forward blurry receipts directly to our WhatsApp bot for instant digitization.',
    popular: true,
  },
  {
    icon: ShieldCheck,
    title: 'AI Deep Match',
    credits: CREDIT_COSTS.deepMatchBase,
    description: 'Run our advanced AI engine to cross-reference Purchase Register vs GSTR-2B.',
    popular: false,
  },
] as const;

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary pt-24 pb-20">
      <div className="max-w-content mx-auto px-4 md:px-8">
        
        {/* Header */}
        <motion.div 
          initial="hidden" 
          animate="visible" 
          variants={fadeUp} 
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-accent border border-accent/20 bg-accent/5 mb-6">
            Pricing & Credits
          </span>
          <h1 className="text-4xl lg:text-5xl font-display font-bold mb-6">Transparent, usage-based pricing.</h1>
          <p className="text-text-secondary text-xl max-w-prose mx-auto font-light">
            You only pay for what you use. Top up your AI wallet at any time.
          </p>
        </motion.div>

        {/* Credit Breakdown */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="mb-20"
        >
          <h2 className="text-2xl font-bold mb-8 text-center flex items-center justify-center gap-2">
            <Zap className="text-accent w-6 h-6" />
            Credit Cost Breakdown
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TASK_CARDS.map((task) => {
              const Icon = task.icon;
              return (
                <motion.div
                  key={task.title}
                  variants={fadeUp}
                  className="card p-6 border-border hover:border-accent/40 transition-colors relative overflow-hidden"
                >
                  {task.popular && (
                    <div className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                      POPULAR
                    </div>
                  )}
                  <div className="w-12 h-12 bg-accent/10 text-accent rounded-2xl flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-lg mb-1">{task.title}</h3>
                  <div className="text-2xl font-display font-bold text-accent mb-4">
                    {creditLabel(task.credits)}
                  </div>
                  <p className="text-sm text-text-secondary">{task.description}</p>
                  {'note' in task && task.note ? (
                    <p className="text-xs text-text-disabled mt-2">{task.note}</p>
                  ) : null}
                </motion.div>
              );
            })}
          </div>

          <p className="text-center text-sm text-text-secondary mt-8 max-w-prose mx-auto">
            Virtual CFO, Tax Liability, GSTR-2B reconciliation, and client management are <strong className="text-text-primary">always available</strong> — no feature locks.
            You only spend credits when you run AI-powered tasks (scan, bank parse, deep match, etc.).
          </p>
        </motion.div>

        {/* Wallet Passes */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center mb-10">
            <h2 className="text-3xl font-display font-bold mb-4">Recharge your Wallet</h2>
            <p className="text-text-secondary">Purchase a bundle that fits your volume.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {CREDIT_PACKS.map((pack) => (
              <motion.div
                key={pack.type}
                variants={fadeUp}
                className={
                  pack.popular
                    ? 'relative bg-bg-surface rounded-3xl p-8 border-2 border-accent shadow-2xl shadow-accent/10 transform md:-translate-y-4'
                    : 'bg-bg-surface rounded-3xl p-8 border border-border'
                }
              >
                {pack.popular && (
                  <div className="absolute top-0 right-8 -translate-y-1/2 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                    Best Value
                  </div>
                )}
                <div
                  className={`text-xs font-bold uppercase tracking-widest mb-4 ${
                    pack.popular ? 'text-accent' : 'text-text-secondary'
                  }`}
                >
                  {pack.name}
                </div>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-5xl font-display font-bold text-text-primary">
                    {formatInr(pack.priceInr)}
                  </span>
                </div>
                <div className="text-text-secondary font-medium mb-6">
                  {pack.credits.toLocaleString('en-IN')} Credits included
                </div>

                <ul className="space-y-3 mb-8 text-sm">
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                    <span>{perCreditInr(pack)}</span>
                  </li>
                  {pack.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/auth"
                  className={
                    pack.popular
                      ? 'block w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-center font-semibold transition-colors'
                      : 'block w-full py-3 rounded-xl border border-border text-center font-semibold hover:border-accent/40 hover:text-accent transition-colors'
                  }
                >
                  {pack.popular ? 'Start Pro Trial' : 'Get Started'}
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
