import { useRef, type ReactNode } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import {
  FileCheck,
  Layers,
  Banknote,
  Network,
  Wallet,
  LineChart,
  Users,
} from 'lucide-react';
import HeroAnimation from './HeroAnimation';
import { BankStatementDemo, ReconciliationDemo } from './LandingFeatures';
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  creditLabel,
  formatInr,
} from '../lib/pricing';

const ease = [0.22, 1, 0.36, 1] as const;

const starterPack = CREDIT_PACKS.find((p) => p.type === 'starter')!;
const proPack = CREDIT_PACKS.find((p) => p.type === 'pro')!;

type Chapter = {
  id: string;
  folio: string;
  title: string;
  lead: string;
  body: string;
};

const chapters: Chapter[] = [
  {
    id: 'problem',
    folio: '01',
    title: 'Month-end arrives as a pile',
    lead: 'Phone photos in a chat thread. A GSTR-2B JSON. A bank PDF. A half-built Excel.',
    body: 'The work is not “enter invoices.” It is proving that every rupee of ITC and every payment line still holds before you file. That proof usually lives in three different windows.',
  },
  {
    id: 'lens',
    folio: '02',
    title: 'A lens on the ledger',
    lead: 'KhataLens is the seal on a CA desk — not another AI chat window.',
    body: 'Scan what clients send. Match it to GSTR-2B and the bank. Keep each GSTIN in its own workspace. Spend prepaid credits only when AI does the heavy lift.',
  },
];

/**
 * Narrative arc below the sealed-ledger hero.
 * Motion budget: copper progress rail (scroll) + chapter impress (once each).
 */
export default function LandingStory() {
  const reduceMotion = useReducedMotion();
  const storyRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ['start 0.85', 'end 0.35'],
  });
  const railScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section
      ref={storyRef}
      id="story"
      className="relative py-14 md:py-20 px-6"
      aria-labelledby="story-heading"
    >
      {/* Scroll-linked copper rail — motion moment 3 */}
      <div
        className="pointer-events-none absolute left-[clamp(1.25rem,6vw,4rem)] top-14 bottom-14 w-px bg-border hidden sm:block"
        aria-hidden="true"
      >
        <motion.div
          className="absolute inset-x-0 top-0 origin-top w-px bg-accent"
          style={
            reduceMotion
              ? { scaleY: 1 }
              : { scaleY: railScale }
          }
        />
      </div>

      <div className="max-w-content mx-auto relative">
        <header className="mb-12 md:mb-16 max-w-2xl sm:pl-8">
          <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-text-disabled mb-3">
            From the desk · A month-end story
          </p>
          <h2
            id="story-heading"
            className="text-2xl md:text-3xl font-display font-semibold text-text-primary tracking-tight mb-3"
          >
            How a filing month actually runs
          </h2>
          <p className="text-text-secondary text-base md:text-lg leading-relaxed">
            Problem → lens → scan → match 2B → bank → practice wallet. One path through the whole product — not a feature grid pretending to be a workflow.
          </p>
        </header>

        {/* Opening chapters — editorial, no demos yet */}
        <div className="space-y-14 md:space-y-20 mb-16 md:mb-24 sm:pl-8">
          {chapters.map((ch) => (
            <ChapterBlock key={ch.id} chapter={ch} reduceMotion={!!reduceMotion} />
          ))}
        </div>

        {/* ── Scan ── */}
        <StoryPanel
          folio="03"
          icon={FileCheck}
          title="Scan the bill. Verify before you trust it."
          lead="PDFs, phone JPEGs, multi-page packs — GSTIN, HSN, line items, and tax totals extracted with flags when the model is unsure."
          reduceMotion={!!reduceMotion}
        >
          <div className="border border-border bg-bg-base overflow-hidden max-w-3xl">
            <HeroAnimation />
          </div>
          <p className="mt-4 text-sm text-text-secondary max-w-xl">
            Critical fields stay reviewable. Low confidence does not silently become a filing figure.
            Scan costs {creditLabel(CREDIT_COSTS.invoiceScan)} from the org wallet.
          </p>
        </StoryPanel>

        {/* ── GSTR-2B ── */}
        <StoryPanel
          folio="04"
          icon={Network}
          title="Match books to GSTR-2B before you claim ITC."
          lead="Upload the portal 2B. See matched, mismatch, and missing — the rows that will bite you at filing time."
          reduceMotion={!!reduceMotion}
        >
          <Gstr2bDemo />
          <p className="mt-4 text-sm text-text-secondary max-w-xl">
            Reconciliation lives in the same client workspace as the invoices — no export-import round trip just to find gaps.
          </p>
        </StoryPanel>

        {/* ── Bank ── */}
        <StoryPanel
          folio="05"
          icon={Banknote}
          title="Bank lines meet invoice amounts."
          lead="Parse statement PDFs or sheets, then match payments to purchase invoices — including AI Deep Match when the narration is messy."
          reduceMotion={!!reduceMotion}
        >
          <div className="grid lg:grid-cols-2 gap-6 md:gap-8">
            <div>
              <h4 className="font-display text-base font-semibold text-text-primary mb-3">
                Statement extract
              </h4>
              <div className="border border-border bg-bg-base p-4 overflow-hidden">
                <BankStatementDemo />
              </div>
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-text-primary mb-3">
                Invoice ↔ bank
              </h4>
              <div className="border border-border bg-bg-base p-4 overflow-hidden">
                <ReconciliationDemo />
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-text-secondary max-w-xl">
            Bank parse from {creditLabel(CREDIT_COSTS.bankStatementBase)}; Deep Match from{' '}
            {creditLabel(CREDIT_COSTS.deepMatchBase)}. Core grids stay open — credits only when AI runs.
          </p>
        </StoryPanel>

        {/* ── Practice / wallet / clients ── */}
        <StoryPanel
          folio="06"
          icon={Wallet}
          title="One practice desk. Many GSTINs. Prepaid credits."
          lead="Switch clients without mixing books. Top up Starter or Pro when the firm needs more AI work — not a monthly seat tax."
          reduceMotion={!!reduceMotion}
        >
          <div className="grid sm:grid-cols-2 gap-6 border-t border-border pt-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-text-secondary" aria-hidden="true" />
                <h4 className="font-display text-base font-semibold text-text-primary">
                  Multi-client orgs
                </h4>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                Isolated workspaces per client GSTIN, with RLS so one firm’s books do not bleed into another.
                Clients can also upload via the collaboration portal when you share a link.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-text-secondary" aria-hidden="true" />
                <h4 className="font-display text-base font-semibold text-text-primary">
                  Org wallet
                </h4>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                Starter {formatInr(starterPack.priceInr)} / {starterPack.credits.toLocaleString('en-IN')} credits ·
                Pro {formatInr(proPack.priceInr)} / {proPack.credits.toLocaleString('en-IN')} credits.
                Credits do not expire. New accounts get starter credits on signup.
              </p>
            </div>
          </div>

          <div className="mt-8 grid sm:grid-cols-3 gap-5 border-t border-border pt-6">
            <AsideTool
              icon={Users}
              title="Client portal"
              body="Share a portal link so clients drop bills without joining your WhatsApp chaos."
            />
            <AsideTool
              icon={LineChart}
              title="Tax liability"
              body="Period liability view from the same desk — useful when reconciling outward and inward figures."
            />
            <AsideTool
              icon={FileCheck}
              title="Virtual CFO"
              body="Practice-level CFO workspace for org admins who want a wider read on the books."
            />
          </div>
        </StoryPanel>

        {/* ── Outcome ── */}
        <motion.div
          className="sm:pl-8 border-t border-border pt-12 md:pt-16 max-w-2xl"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55, ease }}
        >
          <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-accent mb-3">
            07 · Outcome
          </p>
          <h3 className="font-display text-2xl md:text-3xl font-semibold text-text-primary tracking-tight mb-3">
            Export when the seal holds.
          </h3>
          <p className="text-text-secondary text-base md:text-lg leading-relaxed mb-4">
            Tally-ready Excel or XML when you are ready — after scan, 2B, and bank have been checked in one place.
            Month-end stops being three tools taped together.
          </p>
          <a
            href="#pricing"
            className="inline-flex text-sm font-medium text-accent hover:underline"
          >
            See prepaid packs →
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function ChapterBlock({
  chapter,
  reduceMotion,
}: {
  chapter: Chapter;
  reduceMotion: boolean;
}) {
  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease }}
    >
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-mono text-xs text-accent tracking-wider">{chapter.folio}</span>
        <span className="h-px flex-1 max-w-[3rem] bg-accent/35" aria-hidden="true" />
      </div>
      <h3 className="font-display text-xl md:text-2xl font-semibold text-text-primary tracking-tight mb-2">
        {chapter.title}
      </h3>
      <p className="text-text-primary/90 text-base md:text-lg leading-relaxed mb-2 max-w-xl">
        {chapter.lead}
      </p>
      <p className="text-sm md:text-base text-text-secondary leading-relaxed max-w-xl">
        {chapter.body}
      </p>
    </motion.article>
  );
}

function StoryPanel({
  folio,
  icon: Icon,
  title,
  lead,
  children,
  reduceMotion,
}: {
  folio: string;
  icon: typeof FileCheck;
  title: string;
  lead: string;
  children: ReactNode;
  reduceMotion: boolean;
}) {
  return (
    <motion.article
      className="sm:pl-8 mb-16 md:mb-24"
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ duration: 0.55, ease }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span className="font-mono text-xs text-accent tracking-wider">{folio}</span>
        <Icon className="w-4 h-4 text-text-secondary" aria-hidden="true" />
      </div>
      <h3 className="font-display text-xl md:text-2xl font-semibold text-text-primary tracking-tight mb-2 max-w-2xl">
        {title}
      </h3>
      <p className="text-text-secondary text-base md:text-lg leading-relaxed mb-6 max-w-2xl">
        {lead}
      </p>
      {children}
    </motion.article>
  );
}

function AsideTool({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof FileCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="border-t border-border pt-4 sm:border-t-0 sm:pt-0 sm:border-l sm:border-border sm:pl-5 first:sm:border-l-0 first:sm:pl-0">
      <Icon className="w-4 h-4 text-text-secondary mb-2" aria-hidden="true" />
      <h5 className="font-display text-sm font-semibold text-text-primary mb-1">{title}</h5>
      <p className="text-xs text-text-secondary leading-relaxed">{body}</p>
    </div>
  );
}

/** Honest sample of 2B recon status rows — not a fake accuracy badge. */
function Gstr2bDemo() {
  const rows = [
    { vendor: 'Steel Corp Pvt Ltd', inv: 'INV-041', status: 'Matched', tone: 'success' as const },
    { vendor: 'Tech Supplies Co', inv: 'TS-1182', status: 'Amount mismatch', tone: 'warning' as const },
    { vendor: 'Office Mart', inv: 'OM-290', status: 'In books, not in 2B', tone: 'error' as const },
  ];

  const toneClass = {
    success: 'text-success bg-success-subtle border-success/20',
    warning: 'text-warning bg-warning-subtle border-warning/20',
    error: 'text-error bg-error-subtle border-error/20',
  };

  return (
    <div className="border border-border bg-bg-surface overflow-hidden max-w-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-base">
        <span className="font-display text-sm font-semibold text-text-primary">
          GSTR-2B · May 2026
        </span>
        <span className="font-mono text-[10px] tracking-wider uppercase text-text-disabled">
          Client workspace
        </span>
      </div>
      <ul className="divide-y divide-border list-none m-0 p-0">
        {rows.map((row) => (
          <li
            key={row.inv}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3"
          >
            <div>
              <div className="text-sm font-medium text-text-primary">{row.vendor}</div>
              <div className="text-xs font-mono text-text-disabled">{row.inv}</div>
            </div>
            <span
              className={`self-start sm:self-auto text-xs font-medium px-2 py-0.5 border ${toneClass[row.tone]}`}
            >
              {row.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
