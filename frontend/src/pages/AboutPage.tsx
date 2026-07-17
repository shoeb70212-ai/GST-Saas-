import React from 'react';
import { Link } from 'react-router-dom';
import KhataLensIcon from '../components/KhataLensIcon';

export default function AboutPage() {
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

      <section className="py-24 px-6 max-w-4xl mx-auto text-center">
        <h1 className="text-5xl font-display font-bold mb-6 text-text-primary">
          Built exclusively for <span className="text-accent">Indian Chartered Accountants</span>
        </h1>
        <p className="text-xl text-text-secondary font-light max-w-2xl mx-auto mb-16 leading-relaxed">
          We are on a mission to eliminate manual data entry, so you can focus on advisory, strategy, and growing your firm.
        </p>

        <div className="text-left space-y-12">
          
          <div className="p-8 bg-bg-surface rounded-3xl border border-border shadow-md">
            <h2 className="text-2xl font-bold mb-4">The Problem with Traditional OCR</h2>
            <p className="text-text-secondary leading-relaxed mb-4">
              For years, Tax Professionals have relied on basic OCR (Optical Character Recognition) tools to extract data from invoices. But OCR is dumb. It reads text blindly, breaks when invoice formats change, and requires constant manual template creation.
            </p>
            <p className="text-text-secondary leading-relaxed">
              When dealing with complex Indian GST invoices—with varying SGST/CGST/IGST columns, HSN codes, and messy PDF scans—traditional OCR tools simply fail, resulting in hours of manual correction.
            </p>
          </div>

          <div className="p-8 bg-accent text-white rounded-3xl shadow-xl">
            <h2 className="text-2xl font-bold mb-4">The KhataLens Solution</h2>
            <p className="text-white/90 leading-relaxed mb-4">
              KhataLens is not OCR. It is an intelligent AI pipeline powered by large language models that actually <em>understands</em> accounting context. 
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-white rounded-full mt-2 shrink-0"></div>
                <span>It dynamically identifies GST numbers, verifies them in real-time against the government portal, and extracts line items perfectly regardless of the invoice layout.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-white rounded-full mt-2 shrink-0"></div>
                <span>It reads complex bank statements, categorizes transactions, and provides intelligent fuzzy-matching for instant bank reconciliation.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-white rounded-full mt-2 shrink-0"></div>
                <span>It acts as a Virtual CFO, analyzing cash flow trends directly from the extracted data.</span>
              </li>
            </ul>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-text-secondary text-sm border-t border-border mt-12">
        <p>&copy; {new Date().getFullYear()} KhataLens. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-4">
          <Link to="/privacy" className="hover:text-accent">Privacy Policy</Link>
          <Link to="/security" className="hover:text-accent">Data Security</Link>
        </div>
      </footer>
    </div>
  );
}
