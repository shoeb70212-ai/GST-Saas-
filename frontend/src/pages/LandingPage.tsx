import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, Network, Banknote, CheckCircle2, ChevronRight, Calculator, FileCheck, Layers } from 'lucide-react';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

import HeroAnimation from '../components/HeroAnimation';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-accent/20 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-slate-200 bg-white/80 backdrop-blur-xl transition-all">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/favicon.png" alt="KhataLens Logo" className="w-8 h-8 drop-shadow-sm" />
            <span className="text-xl font-bold tracking-tight text-slate-900">KhataLens</span>
          </div>
          <Link 
            to="/auth" 
            className="px-6 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors border border-slate-200"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 lg:pt-40 lg:pb-32 overflow-hidden">
        {/* Soft Background Gradients */}
        <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-indigo-50 to-transparent -z-10" />
        <div className="absolute top-20 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl -z-10" />
        <div className="absolute top-40 -right-40 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl -z-10" />
        
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-left"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent font-medium text-sm mb-6 border border-accent/20 shadow-sm">
              <img src="/favicon.png" alt="Icon" className="w-4 h-4" /> Built strictly for Indian CAs & Accountants
            </span>
            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1] text-slate-900">
              Stop typing data.<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-orange-400 drop-shadow-sm">Start filing faster.</span>
            </h1>
            <p className="text-xl text-slate-600 mb-10 max-w-xl leading-relaxed">
              KhataLens reads your messy purchase bills and instantly converts them into a perfectly formatted Excel sheet ready for Tally or Zoho.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Link 
                to="/auth"
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent/40 hover:shadow-accent/60 hover:-translate-y-1"
              >
                Start Free Beta <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500 font-medium">Includes 100 free AI extraction credits. No credit card required.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="relative"
          >
            <HeroAnimation />
          </motion.div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-24 px-6 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeIn}
            className="text-center mb-16"
          >
            <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-slate-900">How KhataLens Works</h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              Automate the most tedious part of tax filing in three simple steps.
            </p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid md:grid-cols-3 gap-8 relative"
          >
            {/* Step 1 */}
            <motion.div variants={fadeIn} className="bg-slate-50 rounded-2xl p-8 border border-slate-200 text-center relative z-10 hover:shadow-md transition-shadow">
              <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl font-bold mx-auto mb-6">1</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Upload Invoices</h3>
              <p className="text-slate-600">
                Drag and drop 100s of invoices into your client's secure vault. We accept messy PDFs, JPGs, and PNGs directly from WhatsApp.
              </p>
            </motion.div>
            
            {/* Step 2 */}
            <motion.div variants={fadeIn} className="bg-white rounded-2xl p-8 border-2 border-accent text-center relative z-10 shadow-xl shadow-accent/10 md:scale-105 hover:-translate-y-1 transition-transform">
              <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-gradient-to-r from-accent to-orange-500 text-white text-xs font-bold rounded-full uppercase tracking-wider shadow-md">
                Magic Happens Here
              </div>
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <img src="/favicon.png" alt="KhataLens Logo" className="w-16 h-16 drop-shadow-md hover:scale-110 transition-transform duration-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Instant AI Extraction</h3>
              <p className="text-slate-600">
                Powered by Gemini 2.5 Flash, the system perfectly reads the GSTIN, detects the state code, and extracts every single line item and HSN code in seconds.
              </p>
            </motion.div>

            {/* Step 3 */}
            <motion.div variants={fadeIn} className="bg-slate-50 rounded-2xl p-8 border border-slate-200 text-center relative z-10 hover:shadow-md transition-shadow">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-bold mx-auto mb-6">3</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Export & File</h3>
              <p className="text-slate-600">
                Click one button to export a perfectly formatted Excel sheet, ready to be immediately ingested into Tally, Zoho Books, or the GST Portal.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Deep Dive Feature Sections */}
      <section className="py-24 px-6 overflow-hidden bg-slate-50">
        <div className="max-w-7xl mx-auto space-y-32">
          
          {/* Feature 1 */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeIn}
            className="flex flex-col lg:flex-row items-center gap-16"
          >
            <div className="flex-1 space-y-6">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <FileCheck className="w-6 h-6 text-accent" />
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">
                Unyielding accuracy on 37 critical GST fields.
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                KhataLens doesn't just look for total amounts. It acts like a Senior Accountant. It understands CGST vs SGST vs IGST. It cross-verifies that the line item totals match the grand total. It reads HSN codes, Place of Supply, and Invoice Dates even from crumpled paper receipts.
              </p>
              <ul className="space-y-3 pt-4">
                {['Line Item Level Extraction', 'Automatic Tax Rate Categorization', 'Handles Multi-Page PDFs', 'Reads Bad Handwriting & Skewed Photos'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-accent shrink-0" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1 w-full bg-slate-200/50 rounded-3xl p-8 border border-slate-200 relative group">
              <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="bg-white rounded-xl p-6 shadow-xl border border-slate-100 transform -rotate-2 group-hover:rotate-0 transition-transform duration-500">
                <div className="flex justify-between border-b pb-4 mb-4">
                  <div>
                    <div className="text-xs text-slate-500 font-bold uppercase mb-1">Supplier GSTIN</div>
                    <div className="font-mono text-slate-900">27ABCDE1234F1Z5</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500 font-bold uppercase mb-1">Invoice Date</div>
                    <div className="font-mono text-slate-900">12-MAY-2026</div>
                  </div>
                </div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100">
                      <th className="pb-2 font-medium">Item</th>
                      <th className="pb-2 font-medium">HSN</th>
                      <th className="pb-2 font-medium text-right">Tax</th>
                      <th className="pb-2 font-medium text-right">Amt</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-slate-800">
                    <tr>
                      <td className="py-3">Consulting Services</td>
                      <td className="py-3">9983</td>
                      <td className="py-3 text-right">18%</td>
                      <td className="py-3 text-right">₹10,000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>

          {/* Feature 2 */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeIn}
            className="flex flex-col lg:flex-row-reverse items-center gap-16"
          >
            <div className="flex-1 space-y-6">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Layers className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">
                Multi-Tenancy built for Firms.
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Managing 50 different clients? KhataLens keeps them perfectly isolated. Create client profiles with their specific GSTINs. When you scan invoices, they are safely locked into that client's secure vault.
              </p>
              <ul className="space-y-3 pt-4">
                {['Unlimited Client Workspaces', 'Instant Context Switching', 'Zero Data Bleed Between Clients', 'Cloud Database Indexing for Speed'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1 w-full bg-slate-200/50 rounded-3xl p-8 border border-slate-200 flex flex-col gap-4">
              {['TechCorp India', 'Sharma Traders', 'Gupta Manufacturing'].map((client, i) => (
                <div key={i} className={`bg-white rounded-xl p-5 shadow-md border ${i === 0 ? 'border-blue-500 ring-2 ring-blue-500/20 translate-x-4' : 'border-slate-200'} flex justify-between items-center transition-transform hover:scale-[1.02]`}>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">{client}</h4>
                    <p className="text-sm text-slate-500 font-mono mt-1">27AAAAA0000A1Z5</p>
                  </div>
                  <ChevronRight className={`w-6 h-6 ${i === 0 ? 'text-blue-500' : 'text-slate-400'}`} />
                </div>
              ))}
            </div>
          </motion.div>

        </div>
      </section>

      {/* Roadmap / Coming Soon Grid */}
      <section className="py-24 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeIn}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white/90 font-medium text-sm mb-4 border border-white/20">
              The Roadmap
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">We are building the Ultimate Tax OS.</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Our beta currently focuses on pure AI extraction. Here is what we are launching next month.
            </p>
          </motion.div>
          
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-6"
          >
            <motion.div variants={fadeIn} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-colors group">
              <div className="flex justify-between items-start mb-6">
                <div className="w-14 h-14 rounded-xl bg-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-7 h-7 text-accent" />
                </div>
                <span className="px-3 py-1 bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-full">Coming Soon</span>
              </div>
              <h3 className="text-2xl font-semibold mb-3">GSTR-2B AI Deep Match</h3>
              <p className="text-slate-400 leading-relaxed">Upload the government's GSTR-2B JSON file. Our AI will fuzzy-match it against your scanned bills, instantly flagging lost Input Tax Credit (ITC) due to vendor typos.</p>
            </motion.div>
            
            <motion.div variants={fadeIn} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-colors group">
              <div className="flex justify-between items-start mb-6">
                <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Network className="w-7 h-7 text-emerald-400" />
                </div>
                <span className="px-3 py-1 bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-full">Coming Soon</span>
              </div>
              <h3 className="text-2xl font-semibold mb-3">3-Tier Collaboration Workflow</h3>
              <p className="text-slate-400 leading-relaxed">Stop chasing clients for bills on WhatsApp. Business owners scan bills on their phone, which appear instantly in your dashboard for verification.</p>
            </motion.div>

            <motion.div variants={fadeIn} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-colors group">
              <div className="flex justify-between items-start mb-6">
                <div className="w-14 h-14 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Calculator className="w-7 h-7 text-purple-400" />
                </div>
                <span className="px-3 py-1 bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-full">Coming Soon</span>
              </div>
              <h3 className="text-2xl font-semibold mb-3">Tax Liability Predictor</h3>
              <p className="text-slate-400 leading-relaxed">Import a simple sales register. KhataLens instantly calculates Sales Tax minus Purchase ITC, giving your clients a real-time cashflow liability dashboard.</p>
            </motion.div>

            <motion.div variants={fadeIn} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-colors group">
              <div className="flex justify-between items-start mb-6">
                <div className="w-14 h-14 rounded-xl bg-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Banknote className="w-7 h-7 text-orange-400" />
                </div>
                <span className="px-3 py-1 bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-full">Coming Soon</span>
              </div>
              <h3 className="text-2xl font-semibold mb-3">Vendor GSTIN Verification</h3>
              <p className="text-slate-400 leading-relaxed">Automated GSTIN portal pinging. If a client uploads a bill from a vendor with a cancelled GSTIN, the system flags it instantly to prevent penalties.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Footer */}
      <footer className="bg-white border-t border-slate-200 pt-32 pb-10">
        <div className="max-w-4xl mx-auto text-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", bounce: 0.5 }}
            className="w-28 h-28 mx-auto rounded-3xl bg-slate-900 flex items-center justify-center mb-10 shadow-2xl shadow-slate-900/20 border border-slate-800"
          >
            <img src="/favicon.png" alt="KhataLens Logo" className="w-20 h-20 drop-shadow-lg" />
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl font-extrabold mb-8 text-slate-900 tracking-tight"
          >
            Ready to upgrade your firm?
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl text-slate-600 mb-12 max-w-2xl mx-auto"
          >
            Join the Beta today and experience zero-touch invoice processing. Claim your 100 free invoice scans.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <Link 
              to="/auth"
              className="inline-flex px-10 py-5 rounded-2xl bg-accent text-white hover:bg-accent-hover font-bold text-xl transition-all items-center gap-3 shadow-xl shadow-accent/30 hover:shadow-accent/50 hover:-translate-y-1"
            >
              Get Started Now <ArrowRight className="w-6 h-6" />
            </Link>
          </motion.div>
        </div>
        <div className="mt-32 pt-8 text-center border-t border-slate-200 text-sm text-slate-500 font-medium">
          &copy; {new Date().getFullYear()} KhataLens. Built strictly for Accountants.
        </div>
      </footer>
    </div>
  );
}
