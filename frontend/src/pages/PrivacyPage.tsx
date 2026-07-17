import { Link } from 'react-router-dom';
import KhataLensIcon from '../components/KhataLensIcon';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-body overflow-x-hidden">
      {/* Header */}
      <header className="w-full bg-bg-surface/90 backdrop-blur-xl border-b border-border shadow-sm sticky top-0 z-50">
        <nav className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <KhataLensIcon size={36} className="group-hover:scale-105 transition-transform duration-200" />
            <span className="text-xl font-display font-semibold tracking-tight text-text-primary">KhataLens</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link to="/pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors font-medium">Pricing</Link>
            <Link to="/auth" className="px-6 py-2.5 rounded-full border border-border hover:border-accent/50 text-text-primary hover:text-accent text-sm font-medium transition-all duration-200">
              Sign In
            </Link>
          </div>
        </nav>
      </header>

      <section className="py-24 px-6 max-w-3xl mx-auto prose prose-slate">
        <h1 className="text-4xl font-display font-bold mb-8 text-text-primary">Privacy Policy</h1>
        
        <p className="text-text-secondary lead mb-8">
          At KhataLens, we understand that as a Chartered Accountant or Tax Professional, you are handling highly sensitive financial data. We are committed to ensuring your data remains private, secure, and entirely under your control.
        </p>

        <h3 className="text-2xl font-bold mt-10 mb-4">1. How We Process Your Data</h3>
        <p className="text-text-secondary mb-4">
          When you upload invoices or bank statements, the files are securely processed by our proprietary extraction pipeline. We utilize foundational AI models (like OpenAI and Gemini) exclusively via their secure enterprise APIs.
        </p>
        <div className="p-4 bg-accent/10 border border-accent/20 rounded-xl my-6">
          <strong>Crucial Guarantee:</strong> Your data is <em>never</em> used to train foundational AI models. We have strict zero-retention agreements with our LLM providers.
        </div>

        <h3 className="text-2xl font-bold mt-10 mb-4">2. Authentication and Access</h3>
        <p className="text-text-secondary mb-4">
          We use Supabase Authentication for secure, token-based session management. Your login credentials and sessions are securely encrypted. We do not sell, rent, or share your firm's data or your clients' data with any third-party marketing agencies.
        </p>

        <h3 className="text-2xl font-bold mt-10 mb-4">3. Privacy Roadmap (Coming Soon)</h3>
        <p className="text-text-secondary mb-4">
          As we scale towards full enterprise compliance, we are actively developing:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-text-secondary">
          <li><strong>Automated Data Retention Policies:</strong> The ability for you to set rules to auto-delete source documents (PDFs/images) after 30 or 60 days.</li>
          <li><strong>Granular Consent Portals:</strong> Tools to help you maintain compliance with the DPDP Act (India) when onboarding new clients to the portal.</li>
        </ul>

      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-text-secondary text-sm border-t border-border mt-12">
        <p>&copy; {new Date().getFullYear()} KhataLens. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-4">
          <Link to="/security" className="hover:text-accent">Data Security</Link>
          <Link to="/about" className="hover:text-accent">About Us</Link>
        </div>
      </footer>
    </div>
  );
}
