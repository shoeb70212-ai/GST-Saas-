import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Sparkles, Zap, Users, ArrowRight, ShieldCheck, Database, Network, LineChart, Banknote } from 'lucide-react';

const FeatureCard = ({ icon: Icon, title, description, badge }: { icon: any, title: string, description: string, badge?: string }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="relative p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-accent/50 transition-colors group"
  >
    {badge && (
      <span className="absolute -top-3 right-4 px-3 py-1 bg-accent/20 text-accent text-xs font-bold uppercase tracking-wider rounded-full backdrop-blur-md border border-accent/30">
        {badge}
      </span>
    )}
    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
      <Icon className="w-6 h-6 text-accent" />
    </div>
    <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
    <p className="text-white/70 leading-relaxed">{description}</p>
  </motion.div>
);

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white selection:bg-accent/30 font-sans overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">LedgerLens</span>
          </div>
          <Link 
            to="/auth" 
            className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 lg:pt-48 lg:pb-32">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/20 via-[#09090b] to-[#09090b] -z-10" />
        
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent font-medium text-sm mb-8 border border-accent/20">
              <Sparkles className="w-4 h-4" /> Now in Private Beta
            </span>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
              The AI Workspace for <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-purple-400">Modern Accountants</span>
            </h1>
            <p className="text-xl text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed">
              Eliminate manual data entry forever. LedgerLens uses advanced AI to instantly extract 37 fields from complex GST invoices, managing hundreds of clients in one seamless dashboard.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                to="/auth"
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(99,102,241,0.4)]"
              >
                Start Free Beta <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
            <p className="mt-4 text-sm text-white/50">Includes 100 free AI extraction credits.</p>
          </motion.div>
        </div>
      </section>

      {/* Current Features Grid */}
      <section className="py-24 px-6 border-t border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Available Today</h2>
            <p className="text-white/70 text-lg max-w-2xl mx-auto">
              Everything you need to automate your tax filing workflow right now.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard 
              icon={Zap}
              title="37-Field AI Extraction"
              description="Powered by Gemini 2.5 Flash. Instantly extracts HSN codes, IGST/CGST, PAN, and line items with near-perfect accuracy."
            />
            <FeatureCard 
              icon={Users}
              title="Client Multi-Tenancy"
              description="Manage 50+ businesses under one login. Switch contexts instantly and keep all invoice data strictly isolated."
            />
            <FeatureCard 
              icon={Database}
              title="Native Excel Export"
              description="Export extracted data into beautifully formatted Excel sheets, ready for immediate import into Tally or Zoho Books."
            />
          </div>
        </div>
      </section>

      {/* Roadmap / Coming Soon Grid */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">The Future Roadmap</h2>
            <p className="text-white/70 text-lg max-w-2xl mx-auto">
              We are building the ultimate financial operating system. Here is what is launching next.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <FeatureCard 
              badge="Coming Soon"
              icon={ShieldCheck}
              title="GSTR-2B AI Deep Match"
              description="Upload the government's GSTR-2B file. Our AI will fuzzy-match it against your scanned bills, instantly flagging lost Input Tax Credit (ITC) due to vendor typos."
            />
            <FeatureCard 
              badge="Coming Soon"
              icon={Network}
              title="3-Tier Collaboration Workflow"
              description="Stop chasing clients for bills on WhatsApp. Business owners scan bills on their phone, which appear instantly in your dashboard for verification."
            />
            <FeatureCard 
              badge="Coming Soon"
              icon={LineChart}
              title="Tax Liability Predictor"
              description="Import a simple sales register. LedgerLens instantly calculates Sales Tax minus Purchase ITC, giving your clients a real-time cashflow liability dashboard."
            />
            <FeatureCard 
              badge="Coming Soon"
              icon={Banknote}
              title="Vendor KYC Verification"
              description="Automated GSTIN portal pinging. If a client uploads a bill from a vendor with a cancelled GSTIN, the system flags it instantly to prevent penalties."
            />
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <footer className="border-t border-white/5 bg-black">
        <div className="max-w-4xl mx-auto text-center py-24 px-6">
          <h2 className="text-4xl font-bold mb-6">Ready to upgrade your firm?</h2>
          <p className="text-xl text-white/70 mb-10">
            Join the Beta today and experience zero-touch invoice processing.
          </p>
          <Link 
            to="/auth"
            className="inline-flex px-8 py-4 rounded-xl bg-white text-black hover:bg-gray-200 font-bold text-lg transition-all items-center gap-2"
          >
            Get Started Now
          </Link>
        </div>
        <div className="py-6 text-center border-t border-white/5 text-sm text-white/50">
          &copy; {new Date().getFullYear()} LedgerLens. Built for Accountants.
        </div>
      </footer>
    </div>
  );
}
