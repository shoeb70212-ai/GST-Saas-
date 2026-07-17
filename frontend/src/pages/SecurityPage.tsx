import { Link } from 'react-router-dom';
import KhataLensIcon from '../components/KhataLensIcon';
import { ShieldCheck, Lock, Database, FileKey2 } from 'lucide-react';

export default function SecurityPage() {
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

      <section className="py-24 px-6 max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Enterprise-Grade <span className="text-accent">Security</span></h1>
          <p className="text-lg text-text-secondary">Your clients trust you with their data. We ensure you can trust us.</p>
        </div>

        <div className="space-y-12">
          
          {/* Feature 1 */}
          <div className="flex gap-6">
            <div className="mt-1 shrink-0 text-accent"><Database size={28} /></div>
            <div>
              <h3 className="text-xl font-bold mb-2">Strict Row-Level Security (RLS)</h3>
              <p className="text-text-secondary leading-relaxed mb-3">
                We utilize deep PostgreSQL-level isolation. Every query made to our database is cryptographically scoped to the authenticated user's session. It is mathematically impossible for Client A to query or access Client B's financial data, even if application logic were to fail.
              </p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex gap-6">
            <div className="mt-1 shrink-0 text-accent"><Lock size={28} /></div>
            <div>
              <h3 className="text-xl font-bold mb-2">Encrypted Cloud Storage</h3>
              <p className="text-text-secondary leading-relaxed mb-3">
                Files uploaded for batch processing, WhatsApp forwards, or bank statements are stored in securely encrypted cloud buckets (via Supabase Storage). Access to these files is strictly gated behind the same Row-Level Security policies that protect your database. They are never exposed to public directories.
              </p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex gap-6">
            <div className="mt-1 shrink-0 text-accent"><FileKey2 size={28} /></div>
            <div>
              <h3 className="text-xl font-bold mb-2">Password-Protected PDF Decryption</h3>
              <p className="text-text-secondary leading-relaxed mb-3">
                We natively handle AES and RC4 encrypted PDFs (like bank statements). When you provide a password in the dashboard, the decryption happens dynamically in-memory. We never store the raw passwords on disk.
              </p>
            </div>
          </div>

        </div>

        <div className="mt-16 p-8 bg-bg-surface border border-border rounded-3xl shadow-sm">
          <h3 className="text-xl font-bold mb-4">Security Roadmap (Coming Soon)</h3>
          <ul className="space-y-3 text-text-secondary">
            <li className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-text-disabled rounded-full"></div>
              <span>SOC-2 Type II Independent Audit (Our infrastructure provider, Supabase, is already SOC-2 compliant)</span>
            </li>
            <li className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-text-disabled rounded-full"></div>
              <span>Bring Your Own Key (BYOK) database encryption for Enterprise clients</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-text-secondary text-sm border-t border-border mt-12">
        <p>&copy; {new Date().getFullYear()} KhataLens. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-4">
          <Link to="/privacy" className="hover:text-accent">Privacy Policy</Link>
          <Link to="/about" className="hover:text-accent">About Us</Link>
        </div>
      </footer>
    </div>
  );
}
