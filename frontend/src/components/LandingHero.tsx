import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Full-bleed sealed-ledger hero — one composition, edge-to-edge.
 * Ruled fog plane + oversized copper wax seal + masthead brand.
 * Not a two-column “copy left / icon right” SaaS template.
 */
export default function LandingHero() {
  return (
    <section
      className="relative min-h-[100svh] flex flex-col justify-end sm:justify-center overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* ── Dominant visual plane (full bleed) ── */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {/* Paper grain */}
        <div
          className="absolute inset-0 opacity-[0.4] mix-blend-multiply"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: '220px 220px',
          }}
        />

        {/* Ledger ruling — hairlines across the full plane */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease, delay: 0.05 }}
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 35px, rgba(20, 22, 20, 0.07) 35px, rgba(20, 22, 20, 0.07) 36px)',
            backgroundPosition: '0 5.5rem',
          }}
        />

        {/* Vertical margin (classic ledger red-copper + graphite pair) */}
        <motion.div
          className="absolute top-0 bottom-0 origin-top"
          style={{ left: 'clamp(1.5rem, 9vw, 6.25rem)' }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 0.95, ease, delay: 0.18 }}
        >
          <div className="absolute inset-y-0 left-0 w-px bg-[rgba(20,22,20,0.18)]" />
          <div className="absolute inset-y-0 left-[3px] w-px bg-accent/40" />
        </motion.div>

        {/* Top ledger rule */}
        <motion.div
          className="absolute left-0 right-0 h-px bg-[rgba(20,22,20,0.1)] origin-left"
          style={{ top: '4.75rem' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, ease, delay: 0.25 }}
        />

        {/* Register / crop marks — precision, not decoration spam */}
        <RegisterMarks />

        {/* Folio mark */}
        <motion.p
          className="absolute top-[5.15rem] right-[clamp(1rem,4vw,2.5rem)] font-mono text-[10px] tracking-[0.28em] uppercase text-text-disabled"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          GST · LEDGER
        </motion.p>

        {/* Oversized copper wax seal — bleeds off lower-right, fully visible */}
        <motion.div
          className="absolute -right-[12%] sm:-right-[6%] md:-right-[2%] bottom-[-8%] sm:bottom-[-4%] md:top-[38%] md:bottom-auto md:-translate-y-1/2 w-[min(88vw,26rem)] sm:w-[min(70vw,32rem)] md:w-[min(48vw,38rem)] lg:w-[40rem] aspect-square"
          initial={{ opacity: 0, scale: 1.14, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: -3 }}
          transition={{ duration: 1.15, ease, delay: 0.1 }}
        >
          <CopperSeal />
        </motion.div>

        {/* Soft left readability wash — does NOT erase the seal */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(95deg, rgba(243,244,242,0.97) 0%, rgba(243,244,242,0.88) 28%, rgba(243,244,242,0.45) 48%, rgba(243,244,242,0.12) 68%, transparent 82%)',
          }}
        />
        {/* Mobile: stronger bottom fog so copy stays readable over seal */}
        <div
          className="absolute inset-x-0 bottom-0 h-[55%] md:hidden"
          style={{
            background:
              'linear-gradient(to top, #F3F4F2 0%, rgba(243,244,242,0.92) 35%, rgba(243,244,242,0) 100%)',
          }}
        />
      </div>

      {/* ── Hero budget: brand + headline + sentence + CTA ── */}
      <div className="relative z-10 w-full max-w-content mx-auto px-6 pt-28 pb-14 sm:pb-20 md:pt-32 md:pb-24">
        <div
          className="pl-[clamp(0.75rem,calc(9vw-1.25rem),4.5rem)] max-w-[40rem] lg:max-w-[44rem]"
        >
          {/* Brand — masthead scale, not nav-sized */}
          <motion.p
            className="font-display font-semibold text-text-primary leading-[0.88] tracking-[-0.035em] mb-7 sm:mb-8"
            style={{ fontSize: 'clamp(3.75rem, 13.5vw, 8.25rem)' }}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease, delay: 0.22 }}
          >
            KhataLens
          </motion.p>

          <motion.h1
            id="hero-heading"
            className="font-display text-[clamp(1.25rem,2.8vw,1.85rem)] font-medium text-text-primary tracking-[-0.02em] leading-[1.25] mb-4 max-w-lg"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.34 }}
          >
            Invoice scan to GST reconciliation — for Indian CA desks.
          </motion.h1>

          <motion.p
            className="text-[0.95rem] sm:text-lg text-text-secondary mb-8 leading-relaxed max-w-md"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease, delay: 0.42 }}
          >
            Extract bill data, match GSTR-2B and bank lines, export to Tally. Pay with prepaid credits — only when you run AI work.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row gap-3 mb-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease, delay: 0.5 }}
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
            className="font-mono text-[10px] sm:text-[11px] tracking-[0.18em] text-text-disabled uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.62 }}
          >
            Starter credits on signup · No card · Credits never expire
          </motion.p>
        </div>
      </div>
    </section>
  );
}

function RegisterMarks() {
  const arm = 'w-3 h-px bg-[rgba(20,22,20,0.35)]';
  const stem = 'h-3 w-px bg-[rgba(20,22,20,0.35)]';
  const corners = [
    { pos: 'top-5 left-5', rot: '' },
    { pos: 'top-5 right-5', rot: 'rotate-90' },
    { pos: 'bottom-5 left-5', rot: '-rotate-90' },
    { pos: 'bottom-5 right-5', rot: 'rotate-180' },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.55 }}
    >
      {corners.map(({ pos, rot }) => (
        <div key={pos} className={`absolute ${pos} ${rot}`}>
          <div className="relative w-3 h-3">
            <div className={`absolute top-0 left-0 ${arm}`} />
            <div className={`absolute top-0 left-0 ${stem}`} />
          </div>
        </div>
      ))}
    </motion.div>
  );
}

/**
 * Premium copper wax seal — scalloped rim, emboss, light falloff.
 * Craft SVG (no stock image).
 */
function CopperSeal() {
  return (
    <svg
      viewBox="0 0 420 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      aria-hidden="true"
      style={{
        filter:
          'drop-shadow(0 28px 48px rgba(20, 22, 20, 0.18)) drop-shadow(0 8px 16px rgba(150, 79, 42, 0.22))',
      }}
    >
      <defs>
        <radialGradient id="waxBody" cx="38%" cy="32%" r="68%" fx="32%" fy="28%">
          <stop offset="0%" stopColor="#D4895A" />
          <stop offset="42%" stopColor="#B56A3A" />
          <stop offset="78%" stopColor="#8F4A28" />
          <stop offset="100%" stopColor="#6E371C" />
        </radialGradient>
        <radialGradient id="waxRim" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#964F2A" stopOpacity="0" />
          <stop offset="92%" stopColor="#5C2E14" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3D1E0C" stopOpacity="0.55" />
        </radialGradient>
        <radialGradient id="faceDisk" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FAFAF8" />
          <stop offset="55%" stopColor="#F3F4F2" />
          <stop offset="100%" stopColor="#E4E6E2" />
        </radialGradient>
        <linearGradient id="embossArc" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
          <stop offset="40%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id="innerSoft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b" />
          <feOffset dy="2" result="o" />
          <feFlood floodColor="#5C2E14" floodOpacity="0.35" />
          <feComposite in2="o" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Soft ground shadow under seal */}
      <ellipse cx="210" cy="392" rx="128" ry="14" fill="rgba(20,22,20,0.12)" />

      {/* Scalloped wax outer — 24 lobes */}
      <path
        d={scallopPath(210, 210, 168, 18, 24)}
        fill="url(#waxBody)"
      />
      <path
        d={scallopPath(210, 210, 168, 18, 24)}
        fill="url(#waxRim)"
      />

      {/* Specular emboss on upper rim */}
      <path
        d={scallopPath(210, 210, 168, 18, 24)}
        fill="url(#embossArc)"
        style={{ mixBlendMode: 'soft-light' }}
      />

      {/* Recessed bezel */}
      <circle cx="210" cy="210" r="122" fill="#7A3F20" opacity="0.55" />
      <circle cx="210" cy="210" r="116" fill="#964F2A" opacity="0.4" />

      {/* Raised face */}
      <circle
        cx="210"
        cy="210"
        r="108"
        fill="url(#faceDisk)"
        filter="url(#innerSoft)"
      />
      <circle cx="210" cy="210" r="108" stroke="#B56A3A" strokeWidth="1.5" opacity="0.55" />
      <circle cx="210" cy="210" r="98" stroke="#B56A3A" strokeWidth="0.75" opacity="0.28" />
      <circle
        cx="210"
        cy="210"
        r="90"
        stroke="#B56A3A"
        strokeWidth="1"
        opacity="0.4"
        strokeDasharray="2.5 4.5"
      />

      {/* Lens medallion — instrument mark */}
      <g transform="translate(210 198)">
        <circle r="34" stroke="#141614" strokeWidth="2" fill="none" />
        <circle r="26" stroke="#B56A3A" strokeWidth="1.35" opacity="0.75" fill="none" />
        {/* Document lines inside lens */}
        <line x1="-18" y1="-8" x2="14" y2="-8" stroke="#141614" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="-18" y1="0" x2="8" y2="0" stroke="#141614" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="-18" y1="8" x2="18" y2="8" stroke="#B56A3A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="-18" y1="16" x2="4" y2="16" stroke="#141614" strokeWidth="1.5" strokeLinecap="round" />
        {/* Handle */}
        <line x1="24" y1="24" x2="42" y2="42" stroke="#B56A3A" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="44" cy="44" r="3.2" fill="#964F2A" />
      </g>

      <text
        x="210"
        y="292"
        textAnchor="middle"
        fill="#5A615C"
        style={{
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          fontSize: '10px',
          letterSpacing: '0.28em',
        }}
      >
        GST DESK
      </text>
    </svg>
  );
}

/** Generate a scalloped circle path (wax-seal silhouette). */
function scallopPath(
  cx: number,
  cy: number,
  baseR: number,
  scallopDepth: number,
  lobes: number,
): string {
  const steps = lobes * 12;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const wave = Math.cos(t * lobes);
    const r = baseR + scallopDepth * wave;
    const x = cx + r * Math.cos(t - Math.PI / 2);
    const y = cy + r * Math.sin(t - Math.PI / 2);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${pts.join(' ')} Z`;
}
