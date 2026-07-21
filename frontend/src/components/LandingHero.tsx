import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Full-bleed editorial hero — Fog & Copper Seal.
 * Dominant visual is a ruled ledger plane + oversized copper wax seal (CSS/SVG),
 * not an inset product screenshot or media card.
 */
export default function LandingHero() {
  return (
    <section
      className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* Full-bleed visual plane */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {/* Paper grain */}
        <div
          className="absolute inset-0 opacity-[0.35] mix-blend-multiply"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E")`,
            backgroundSize: '180px 180px',
          }}
        />

        {/* Ledger ruling — horizontal account lines */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.1, ease, delay: 0.05 }}
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 31px, rgba(20, 22, 20, 0.055) 31px, rgba(20, 22, 20, 0.055) 32px)',
            backgroundPosition: '0 4.5rem',
          }}
        />

        {/* Classic ledger margin line */}
        <motion.div
          className="absolute top-0 bottom-0 w-px bg-accent/25 origin-top"
          style={{ left: 'clamp(1.25rem, 8vw, 5.5rem)' }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease, delay: 0.2 }}
        />

        {/* Oversized copper wax seal — bleeds off the right edge */}
        <motion.div
          className="absolute -right-[18%] sm:-right-[12%] md:-right-[8%] lg:-right-[4%] top-[42%] -translate-y-1/2 w-[min(72vw,28rem)] sm:w-[min(58vw,32rem)] md:w-[36rem] aspect-square"
          initial={{ opacity: 0, scale: 1.08, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1.05, ease, delay: 0.12 }}
        >
          <CopperSeal />
        </motion.div>

        {/* Soft fog vignette — stronger on the left so brand/type stay sharp */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(105deg, #F3F4F2 0%, #F3F4F2 38%, rgba(243,244,242,0.88) 52%, rgba(243,244,242,0.35) 72%, rgba(243,244,242,0.5) 100%)',
          }}
        />
        {/* Extra left wash on small screens */}
        <div
          className="absolute inset-y-0 left-0 w-full max-w-xl md:hidden"
          style={{
            background:
              'linear-gradient(to right, #F3F4F2 0%, #F3F4F2 55%, rgba(243,244,242,0) 100%)',
          }}
        />
      </div>

      {/* Hero budget: brand + headline + sentence + CTA — no cards, no stats */}
      <div className="relative z-10 w-full max-w-content mx-auto px-6 pt-28 pb-16 md:pt-32 md:pb-24">
        <div className="max-w-xl lg:max-w-[34rem]">
          <motion.p
            className="font-display text-[clamp(2.75rem,8vw,4.75rem)] font-semibold text-text-primary tracking-tight leading-[0.95] mb-6"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease, delay: 0.18 }}
          >
            KhataLens
          </motion.p>

          <motion.h1
            id="hero-heading"
            className="font-display text-[clamp(1.35rem,3.2vw,2rem)] font-medium text-text-primary tracking-tight leading-snug mb-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.28 }}
          >
            Invoice scan to GST reconciliation — for Indian CA desks.
          </motion.h1>

          <motion.p
            className="text-base sm:text-lg text-text-secondary mb-9 leading-relaxed max-w-md"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease, delay: 0.36 }}
          >
            Extract bill data, match GSTR-2B and bank lines, export to Tally. Pay with prepaid credits — only when you run AI work.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row gap-3 mb-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease, delay: 0.44 }}
          >
            <Link
              to="/auth"
              id="hero-cta-primary"
              className="btn-primary !h-12 !px-7 !text-base !rounded-lg"
            >
              Start free <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <a
              href="#workflow"
              className="btn-secondary !h-12 !px-7 !text-base !rounded-lg"
            >
              See the workflow
            </a>
          </motion.div>

          <motion.p
            className="font-mono text-[11px] sm:text-xs tracking-wide text-text-disabled uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.55 }}
          >
            Starter credits on signup · No card · Credits never expire
          </motion.p>
        </div>
      </div>
    </section>
  );
}

/** Oversized wax-seal SVG — archival hardware metaphor */
function CopperSeal() {
  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full drop-shadow-[0_18px_40px_rgba(20,22,20,0.12)]"
      aria-hidden="true"
    >
      {/* Irregular wax outer — scalloped rim */}
      <path
        d="M200 28c22 0 38 14 52 14 16 0 28-12 46-8 18 4 28 22 42 28 14 6 32 2 42 16 10 14 4 32 8 48 4 16 20 26 20 44s-16 28-20 44c-4 16 2 34-8 48-10 14-28 10-42 16-14 6-24 24-42 28-18 4-30-8-46-8-14 0-30 14-52 14s-38-14-52-14c-16 0-28 12-46 8-18-4-28-22-42-28-14-6-32-2-42-16-10-14-4-32-8-48-4-16-20-26-20-44s16-28 20-44c4-16-2-34 8-48 10-14 28-10 42-16 14-6 24-24 42-28 18-4 30 8 46 8 14 0 30-14 52-14z"
        fill="#B56A3A"
        opacity="0.92"
      />
      {/* Inner recess */}
      <circle cx="200" cy="200" r="118" fill="#964F2A" opacity="0.55" />
      <circle cx="200" cy="200" r="108" fill="#F3F4F2" opacity="0.97" />
      <circle cx="200" cy="200" r="100" stroke="#B56A3A" strokeWidth="2.5" opacity="0.85" />
      <circle cx="200" cy="200" r="88" stroke="#B56A3A" strokeWidth="1" opacity="0.35" strokeDasharray="3 5" />

      {/* Lens / document mark — precision instrument */}
      <circle cx="200" cy="188" r="36" stroke="#141614" strokeWidth="2.2" />
      <circle cx="200" cy="188" r="28" stroke="#B56A3A" strokeWidth="1.4" opacity="0.7" />
      <line x1="228" y1="216" x2="248" y2="236" stroke="#B56A3A" strokeWidth="3" strokeLinecap="round" />
      <line x1="176" y1="176" x2="212" y2="176" stroke="#141614" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="176" y1="184" x2="204" y2="184" stroke="#141614" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="176" y1="192" x2="194" y2="192" stroke="#B56A3A" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="198" y1="192" x2="220" y2="192" stroke="#A65D12" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="176" y1="200" x2="208" y2="200" stroke="#141614" strokeWidth="1.6" strokeLinecap="round" />

      <text
        x="200"
        y="268"
        textAnchor="middle"
        fill="#5A615C"
        style={{
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          fontSize: '11px',
          letterSpacing: '0.22em',
        }}
      >
        GST DESK
      </text>
    </svg>
  );
}
