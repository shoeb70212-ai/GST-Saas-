import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, ShieldCheck, Network, Banknote, CheckCircle2, ChevronRight, Calculator, FileCheck, Layers } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-accent/20 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-slate-200 bg-white/80 backdrop-blur-xl transition-all">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">LedgerLens</span>
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
        <div className="absolute top-40 -right-40 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl -z-10" />
        
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent font-medium text-sm mb-8 border border-accent/20">
              <Sparkles className="w-4 h-4" /> Built strictly for Indian CAs & Accountants
            </span>
            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1] text-slate-900">
              Stop typing data.<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-blue-600">Start filing faster.</span>
            </h1>
            <p className="text-xl text-slate-600 mb-10 max-w-3xl mx-auto leading-relaxed">
              LedgerLens is the ultimate AI Workspace for GST professionals. Drop in a crumpled photo of a purchase bill, and our Gemini AI instantly extracts 37 exact data points—including HSN, IGST/CGST, and line items.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                to="/auth"
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-accent hover:bg-accent/90 text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent/30"
              >
                Start Free Beta <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500 font-medium">Includes 100 free AI extraction credits. No credit card required.</p>
          </motion.div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-24 px-6 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-slate-900">How LedgerLens Works</h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              Automate the most tedious part of tax filing in three simple steps.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Step 1 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200 text-center relative z-10">
              <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl font-bold mx-auto mb-6">1</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Upload Invoices</h3>
              <p className="text-slate-600">
                Drag and drop 100s of invoices into your client's secure vault. We accept messy PDFs, JPGs, and PNGs directly from WhatsApp.
              </p>
            </div>
            {/* Step 2 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200 text-center relative z-10 shadow-lg shadow-slate-200/50 scale-105">
              <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-accent text-white text-xs font-bold rounded-full uppercase tracking-wider">
                Magic Happens Here
              </div>
              <div className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Instant AI Extraction</h3>
              <p className="text-slate-600">
                Powered by Gemini 2.5 Flash, the system perfectly reads the GSTIN, detects the state code, and extracts every single line item and HSN code in seconds.
              </p>
            </div>
            {/* Step 3 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200 text-center relative z-10">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-bold mx-auto mb-6">3</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Export & File</h3>
              <p className="text-slate-600">
                Click one button to export a perfectly formatted Excel sheet, ready to be immediately ingested into Tally, Zoho Books, or the GST Portal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Deep Dive Feature Sections */}
      <section className="py-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto space-y-32">
          
          {/* Feature 1 */}
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1 space-y-6">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <FileCheck className="w-6 h-6 text-accent" />
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">
                Unyielding accuracy on 37 critical GST fields.
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                LedgerLens doesn't just look for total amounts. It acts like a Senior Accountant. It understands CGST vs SGST vs IGST. It cross-verifies that the line item totals match the grand total. It reads HSN codes, Place of Supply, and Invoice Dates even from crumpled paper receipts.
              </p>
              <ul className="space-y-3 pt-4">
                {['Line Item Level Extraction', 'Automatic Tax Rate Categorization', 'Handles Multi-Page PDFs', 'Reads Bad Handwriting & Skewed Photos'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1 w-full bg-slate-100 rounded-2xl p-8 border border-slate-200 shadow-inner relative">
              <div className="bg-white rounded-xl p-6 shadow-xl border border-slate-100 transform -rotate-2">
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
                    <tr className="text-slate-500">
                      <th className="pb-2 font-medium">Item</th>
                      <th className="pb-2 font-medium">HSN</th>
                      <th className="pb-2 font-medium text-right">Tax</th>
                      <th className="pb-2 font-medium text-right">Amt</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-slate-800">
                    <tr>
                      <td className="py-2">Consulting Services</td>
                      <td className="py-2">9983</td>
                      <td className="py-2 text-right">18%</td>
                      <td className="py-2 text-right">₹10,000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col lg:flex-row-reverse items-center gap-16">
            <div className="flex-1 space-y-6">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Layers className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">
                Multi-Tenancy built for Firms.
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Managing 50 different clients? LedgerLens keeps them perfectly isolated. Create client profiles with their specific GSTINs. When you scan invoices, they are safely locked into that client's secure vault.
              </p>
              <ul className="space-y-3 pt-4">
                {['Unlimited Client Workspaces', 'Instant Context Switching', 'Zero Data Bleed Between Clients', 'Cloud Database Indexing for Speed'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1 w-full bg-slate-100 rounded-2xl p-8 border border-slate-200 flex flex-col gap-4">
              {['TechCorp India', 'Sharma Traders', 'Gupta Manufacturing'].map((client, i) => (
                <div key={i} className={`bg-white rounded-xl p-4 shadow-sm border ${i === 0 ? 'border-accent ring-2 ring-accent/20' : 'border-slate-200'} flex justify-between items-center transition-transform hover:scale-[1.02]`}>
                  <div>
                    <h4 className="font-bold text-slate-900">{client}</h4>
                    <p className="text-xs text-slate-500 font-mono">27AAAAA0000A1Z5</p>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${i === 0 ? 'text-accent' : 'text-slate-400'}`} />
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Roadmap / Coming Soon Grid */}
      <section className="py-24 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white/90 font-medium text-sm mb-4 border border-white/20">
              The Roadmap
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">We are building the Ultimate Tax OS.</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Our beta currently focuses on pure AI extraction. Here is what we are launching next month.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Roadmap Card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-accent" />
                </div>
                <span className="px-3 py-1 bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-full">Coming Soon</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">GSTR-2B AI Deep Match</h3>
              <p className="text-slate-400 leading-relaxed">Upload the government's GSTR-2B JSON file. Our AI will fuzzy-match it against your scanned bills, instantly flagging lost Input Tax Credit (ITC) due to vendor typos.</p>
            </div>
            
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Network className="w-6 h-6 text-emerald-400" />
                </div>
                <span className="px-3 py-1 bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-full">Coming Soon</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">3-Tier Collaboration Workflow</h3>
              <p className="text-slate-400 leading-relaxed">Stop chasing clients for bills on WhatsApp. Business owners scan bills on their phone, which appear instantly in your dashboard for verification.</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Calculator className="w-6 h-6 text-purple-400" />
                </div>
                <span className="px-3 py-1 bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-full">Coming Soon</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Tax Liability Predictor</h3>
              <p className="text-slate-400 leading-relaxed">Import a simple sales register. LedgerLens instantly calculates Sales Tax minus Purchase ITC, giving your clients a real-time cashflow liability dashboard.</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                  <Banknote className="w-6 h-6 text-orange-400" />
                </div>
                <span className="px-3 py-1 bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-full">Coming Soon</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Vendor KYC Verification</h3>
              <p className="text-slate-400 leading-relaxed">Automated GSTIN portal pinging. If a client uploads a bill from a vendor with a cancelled GSTIN, the system flags it instantly to prevent penalties.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <footer className="bg-white border-t border-slate-200 pt-24 pb-6">
        <div className="max-w-4xl mx-auto text-center px-6">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-accent flex items-center justify-center mb-8 shadow-xl shadow-accent/20">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-4xl font-bold mb-6 text-slate-900">Ready to upgrade your firm?</h2>
          <p className="text-xl text-slate-600 mb-10">
            Join the Beta today and experience zero-touch invoice processing. Claim your 100 free invoice scans.
          </p>
          <Link 
            to="/auth"
            className="inline-flex px-8 py-4 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold text-lg transition-all items-center gap-2 shadow-xl shadow-slate-900/20"
          >
            Get Started Now <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
        <div className="mt-24 pt-6 text-center border-t border-slate-200 text-sm text-slate-500 font-medium">
          &copy; {new Date().getFullYear()} LedgerLens. Built strictly for Accountants.
        </div>
      </footer>
    </div>
  );
}
