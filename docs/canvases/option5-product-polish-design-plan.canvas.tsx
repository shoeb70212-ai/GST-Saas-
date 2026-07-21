import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useHostTheme,
} from "cursor/canvas";

/**
 * Option 5 — Product polish design plan (research only).
 * Truth sources: pricing.ts, credits.py, App.tsx routes, Layout.tsx,
 * LandingPage.tsx, index.css, CREDITS_DOCUMENTATION.md.
 */

const CURRENT_TOKENS = [
  { token: "--bg-base", hex: "#F5F1EA", note: "Warm cream — AI cliché" },
  { token: "--accent", hex: "#990000", note: "Maroon (Razorpay sync)" },
  { token: "--accent-hover", hex: "#CC0000", note: "Bright red hover" },
  { token: "--text-primary", hex: "#292524", note: "Stone-800" },
  { token: "--warning", hex: "#C97B63", note: "Terracotta twin" },
  { token: "font-display", hex: "Playfair Display", note: "Serif + cream cliché" },
  { token: "font-body", hex: "Inter", note: "Generic SaaS default" },
];

const PROPOSED_TOKENS = [
  { token: "--bg-base", hex: "#F4F6F8", note: "Cool paper, not cream" },
  { token: "--bg-surface", hex: "#FFFFFF", note: "Solid white cards" },
  { token: "--bg-sunken", hex: "#E8EDF2", note: "Cool gray inset" },
  { token: "--text-primary", hex: "#0F172A", note: "Ink / slate-900" },
  { token: "--text-secondary", hex: "#475569", note: "Slate-600" },
  { token: "--border", hex: "#CBD5E1", note: "Slate-300" },
  { token: "--accent", hex: "#0B5F6B", note: "Deep teal — CA/fintech trust" },
  { token: "--accent-hover", hex: "#084852", note: "Darker teal" },
  { token: "--accent-subtle", hex: "rgba(11,95,107,0.10)", note: "Tint fill" },
  { token: "--success", hex: "#15803D", note: "Ledger green (ITC match)" },
  { token: "--warning", hex: "#B45309", note: "Amber caution" },
  { token: "--error", hex: "#B91C1C", note: "Mismatch / debit" },
  { token: "--gst-cgst", hex: "#0369A1", note: "Sky — CGST" },
  { token: "--gst-sgst", hex: "#0B5F6B", note: "Teal — SGST" },
  { token: "--gst-igst", hex: "#4338CA", note: "Indigo — IGST (sparingly)" },
  { token: "font-display", hex: "Source Serif 4", note: "Editorial, not Playfair" },
  { token: "font-body", hex: "IBM Plex Sans", note: "Finance-native UI" },
  { token: "font-mono", hex: "IBM Plex Mono", note: "GSTIN / amounts" },
];

const TRUTH_FEATURES = [
  { feature: "AI invoice scan (PDF/image)", status: "Live", claim: "Safe to claim" },
  { feature: "Batch ZIP upload", status: "Live", claim: "Safe — verify 200-file cap copy" },
  { feature: "GSTR-2B reconciliation + Deep Match", status: "Live", claim: "Safe; Deep Match spends credits" },
  { feature: "Bank statement parse + bank match", status: "Live", claim: "Safe to claim" },
  { feature: "Multi-client orgs + RLS isolation", status: "Live", claim: "Safe to claim" },
  { feature: "Credits wallet + Razorpay packs", status: "Live", claim: "₹2,499 / 1,000 · ₹7,999 / 5,000 prepaid" },
  { feature: "WhatsApp receipt intake", status: "Live (backend)", claim: "Claim as available if number configured" },
  { feature: "Client collaboration portal (/portal)", status: "Live", claim: "Upload link — not white-label" },
  { feature: "Virtual CFO", status: "Live (org admin)", claim: "Available; not Pro-locked" },
  { feature: "Tax Liability", status: "Live", claim: "Available; credits-only gating" },
  { feature: "Audit logs", status: "Live", claim: "Internal tool — optional on landing" },
  { feature: "Tally / Zoho export", status: "Live (verify formats)", claim: "Verify before strong claims" },
];

const FALSE_OR_RISKY = [
  {
    claim: "Starter/Pro shown as /month",
    reality: "Prepaid wallet passes (not subscriptions)",
    action: "Fix immediately",
  },
  {
    claim: "FAQ: Pro ₹999/mo launching soon",
    reality: "Catalog is ₹2,499 / ₹7,999 prepaid",
    action: "Delete / rewrite FAQ",
  },
  {
    claim: 'JSON-LD aggregateRating 4.9 / 120 reviews',
    reality: "No verified review corpus in repo",
    action: "Remove schema or use real data only",
  },
  {
    claim: "97% extraction accuracy",
    reality: "No eval harness evidence in product truth files",
    action: "Verify before publishing",
  },
  {
    claim: "We are SOC-2 (via Supabase FAQ wording)",
    reality: "Vendor infra ≠ KhataLens certification",
    action: "Say 'hosted on SOC-2 provider' only",
  },
  {
    claim: "Enterprise: white-label, API, on-prem",
    reality: "Portal exists; white-label/API/on-prem unverified",
    action: "Downgrade or remove until shipped",
  },
  {
    claim: '"CAs who switched" testimonials',
    reality: "Labeled Example Scenario — headline implies real users",
    action: "Rename to workflow scenarios or get real quotes",
  },
];

const DASHBOARD_SECTIONS = [
  {
    priority: "P0",
    section: "Context bar",
    contents: "Active client · firm switcher · credit badge · Cmd+K hint",
  },
  {
    priority: "P0",
    section: "Today strip (4 KPIs)",
    contents: "Wallet credits · invoices this period · 2B unmatched · bank unmatched",
  },
  {
    priority: "P0",
    section: "Continue work",
    contents: "Scan · Open invoices · Run GSTR-2B · Upload bank — one primary CTA each",
  },
  {
    priority: "P1",
    section: "Needs attention",
    contents: "Low-confidence scans · mismatches · failed jobs · low credits",
  },
  {
    priority: "P1",
    section: "Recent activity",
    contents: "Last 5 invoices with recon status (already partially built)",
  },
  {
    priority: "P2",
    section: "Analytics charts",
    contents: "Keep below fold; optional widgets (current Dashboard pattern)",
  },
];

const NAV_GROUPS = [
  { group: "Daily work", items: "Dashboard · Scan · Invoices" },
  { group: "Reconcile", items: "GSTR-2B · Bank statements · Bank match" },
  { group: "Clients & insight", items: "Clients · Tax liability · Virtual CFO" },
  { group: "Firm", items: "Wallet · Audit logs · Settings" },
];

const LANDING_SECTIONS = [
  {
    section: "1. Hero",
    copy: "KhataLens — Invoice to GSTR-2B, without the spreadsheet grind.",
    support:
      "Scan GST invoices, match GSTR-2B, parse bank statements. Pay only for AI work with prepaid credits.",
  },
  {
    section: "2. Workflow strip",
    copy: "Scan → Invoices → Reconcile → Bank → Wallet",
    support: "Five steps matching the real sidebar — no invented modules.",
  },
  {
    section: "3. Product proof",
    copy: "What the product actually does",
    support:
      "AI extraction · multi-client isolation · GSTR-2B deep match · bank parse · client upload portal · WhatsApp intake.",
  },
  {
    section: "4. Honest pricing",
    copy: "Prepaid AI credits. Tools stay unlocked.",
    support:
      "Starter Pass ₹2,499 → 1,000 credits · Pro Pass ₹7,999 → 5,000 credits. Scan 1 · Bank from 2 · Deep Match from 5.",
  },
  {
    section: "5. Trust (truthful)",
    copy: "Built for Indian CA firms",
    support:
      "Org wallets · RLS client isolation · Razorpay checkout · no fake ratings or SOC2-of-us claims.",
  },
  {
    section: "6. FAQ + CTA",
    copy: "Start with signup credits (verify live seed) · top up when you need AI volume",
    support: "Link /pricing as source of truth; kill monthly-subscription FAQ.",
  },
];

const PHASES = [
  {
    phase: "A — Trust & tokens",
    effort: "2–4 days",
    risk: "Low",
    work: "Fix landing false claims; align pricing to prepaid packs; swap cream/Playfair tokens to proposed palette; sync BRAND_ACCENT_HEX / Razorpay.",
  },
  {
    phase: "B — Dashboard IA",
    effort: "1–2 weeks",
    risk: "Medium",
    work: "Group sidebar; Today KPI strip; Continue-work CTAs; empty states; optional Cmd+K; keep grid memoization rules.",
  },
  {
    phase: "C — Landing redesign",
    effort: "1–2 weeks",
    risk: "Medium",
    work: "New hero composition; honest sections; remove fake social proof; product screenshots over abstract demos; motion polish.",
  },
];

const OPEN_QUESTIONS = [
  {
    q: "Logo lockup",
    detail: "Keep current mark, redraw for teal, or wordmark-only?",
  },
  {
    q: "Domain tone",
    detail: "Peer-to-peer CA voice vs. product-led SaaS (recommended: precise, calm, peer)?",
  },
  {
    q: "Signup credits",
    detail: "Confirm live org seed still 100 — docs say yes; verify before landing CTA.",
  },
  {
    q: "Accuracy claim",
    detail: "Run eval set before any % claim, or use qualitative confidence-flag copy only.",
  },
  {
    q: "WhatsApp public number",
    detail: "Market as live only if production number + onboarding docs exist.",
  },
  {
    q: "Enterprise tier",
    detail: "Keep Contact Sales card without white-label/API/on-prem until true.",
  },
  {
    q: "Dark mode default",
    detail: "Recommend light-first for CA desks; dark as optional toggle only.",
  },
];

export default function Option5ProductPolishDesignPlan() {
  const theme = useHostTheme();

  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 1100 }}>
      <Stack gap={8}>
        <Row gap={8} style={{ alignItems: "center" }}>
          <Pill tone="info">Option 5</Pill>
          <Pill tone="neutral">Research + plan only</Pill>
          <Pill tone="warning">No UI implementation</Pill>
        </Row>
        <H1>KhataLens product polish — design plan</H1>
        <Text tone="secondary">
          Dashboard IA, truthful landing, and a non-cliché brand system for busy
          Indian CAs. Verified against routes, credits catalog, and current
          theme tokens (2026-07-21).
        </Text>
      </Stack>

      <Callout tone="warning" title="Landing truth debt (ship Phase A first)">
        Current LandingPage shows packs as /month, FAQ still mentions ₹999/mo,
        JSON-LD invents 4.9★ / 120 reviews, and testimonials headline implies
        real switchers while bodies say Example Scenario. Fix copy before visual
        redesign.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="₹2,499" label="Starter Pass · 1,000 credits" />
        <Stat value="₹7,999" label="Pro Pass · 5,000 credits" />
        <Stat value="1 / 2 / 5" label="Scan · Bank base · Deep Match" />
        <Stat value="Credits-only" label="No ProGate feature locks" />
      </Grid>

      <Divider />

      <H2>1. Brand direction</H2>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Voice & positioning</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text>
                <Text weight="semibold">Name voice:</Text> Khata (ledger) + Lens
                (scrutiny). Sound like a senior articled assistant: precise,
                calm, India-native — not Silicon Valley hype.
              </Text>
              <Text tone="secondary">
                Avoid: “AI-powered revolution”, fake social proof, purple glow,
                cream + terracotta serif, broadsheet density, dark-by-default.
              </Text>
              <Text tone="secondary">
                Prefer: workflow clarity, GST vocabulary (2B, ITC, GSTIN),
                prepaid honesty, desk-ready light UI.
              </Text>
              <H3>Visual concept — “Cool ledger”</H3>
              <Text tone="secondary">
                Cool paper surfaces, deep teal accent (trust + India fintech),
                IBM Plex for UI, Source Serif 4 for marketing headlines only.
                Semantic GST colours separate from brand accent so mismatch red
                never fights the CTA.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Why leave current theme</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text>
                Current <Text weight="semibold">#F5F1EA + #990000 + Playfair</Text>{" "}
                is the exact cream/terracotta/serif cluster flagged as AI-slop.
                Maroon can remain a heritage secondary (Razorpay theme) but
                should not drive the whole product surface.
              </Text>
              <Text tone="secondary">
                Indian CA / fintech peers lean navy–teal–white for trust; keep
                green/red for ledger semantics only.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Colour tokens — current vs proposed</H3>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader trailing={<Pill tone="neutral">Current</Pill>}>
            index.css today
          </CardHeader>
          <CardBody>
            <Table
              headers={["Token", "Value", "Issue"]}
              rows={CURRENT_TOKENS.map((r) => [r.token, r.hex, r.note])}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill tone="success">Proposed</Pill>}>
            Cool ledger system
          </CardHeader>
          <CardBody>
            <Table
              headers={["CSS var", "Hex / face", "Role"]}
              rows={PROPOSED_TOKENS.map((r) => [r.token, r.hex, r.note])}
            />
          </CardBody>
        </Card>
      </Grid>
      <Text tone="tertiary" size="small">
        Implementation note: update :root in frontend/src/index.css and
        BRAND_ACCENT_HEX in pricing.ts together (#0B5F6B) so Razorpay chrome
        matches buttons.
      </Text>

      <Divider />

      <H2>2. Dashboard IA (CA workflow)</H2>
      <Callout tone="info" title="Principle">
        Task-grouped side nav + 3–5 actionable KPIs + empty states with one CTA.
        Command palette for power users (Cmd/Ctrl+K). Adapted from 2024–2026 B2B
        SaaS patterns (Linear/Notion-style palette; F-pattern KPI strip).
      </Callout>

      <H3>Sidebar groups (from live routes)</H3>
      <Table
        headers={["Group", "Items"]}
        rows={NAV_GROUPS.map((g) => [g.group, g.items])}
      />

      <H3>Home wireframe priority</H3>
      <Table
        headers={["Priority", "Section", "Contents"]}
        rows={DASHBOARD_SECTIONS.map((s) => [
          s.priority,
          s.section,
          s.contents,
        ])}
      />

      <Card>
        <CardHeader>ASCII wireframe (desktop)</CardHeader>
        <CardBody>
          <Text
            style={{
              fontFamily: "ui-monospace, monospace",
              whiteSpace: "pre",
              fontSize: 12,
              color: theme.text.secondary,
              lineHeight: 1.45,
            }}
          >{`
┌──────────┬──────────────────────────────────────────────┐
│ KhataLens│  [Client ▾]     credits: 842    [⌘K]  Avatar │
│──────────│──────────────────────────────────────────────│
│ Daily    │  TODAY                                       │
│ • Dash   │  [Credits] [Invoices] [2B gaps] [Bank gaps]  │
│ • Scan   │──────────────────────────────────────────────│
│ • Invoices│ CONTINUE                                    │
│──────────│  [Scan invoice] [Review queue] [Run 2B]      │
│ Reconcile│──────────────────────────────────────────────│
│ • GSTR-2B│  NEEDS ATTENTION          RECENT INVOICES    │
│ • Bank   │  · low confidence         · list…            │
│ • Match  │  · unmatched 2B rows                         │
│──────────│──────────────────────────────────────────────│
│ Clients  │  Analytics (below fold / optional widgets)   │
│ Firm…    │                                              │
└──────────┴──────────────────────────────────────────────┘
`}</Text>
        </CardBody>
      </Card>

      <Grid columns={3} gap={12}>
        <Card>
          <CardHeader>Empty states</CardHeader>
          <CardBody>
            <Text tone="secondary">
              No client → Create client. No invoices → Scan first bill. No 2B
              upload → Upload GSTR-2B. One sentence + one button.
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Mobile</CardHeader>
          <CardBody>
            <Text tone="secondary">
              Keep bottom nav: Dashboard · Scan · Invoices · More. Collapse
              Reconcile + Firm into More sheet (already present).
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Perf constraint</CardHeader>
          <CardBody>
            <Text tone="secondary">
              Recon grids stay memoized (CLAUDE.md). Dashboard KPIs via RPC —
              never pull full invoice tables client-side.
            </Text>
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <H2>3. Landing structure + honest copy</H2>
      <Table
        headers={["Section", "Headline draft", "Support"]}
        rows={LANDING_SECTIONS.map((s) => [s.section, s.copy, s.support])}
      />

      <H3>Claim ledger</H3>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader trailing={<Pill tone="success">OK to claim</Pill>}>
            Verified product surface
          </CardHeader>
          <CardBody>
            <Table
              headers={["Feature", "Status", "Guidance"]}
              rows={TRUTH_FEATURES.map((r) => [
                r.feature,
                r.status,
                r.claim,
              ])}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill tone="deleted">Fix / verify</Pill>}>
            Current landing risks
          </CardHeader>
          <CardBody>
            <Table
              headers={["Claim", "Reality", "Action"]}
              rows={FALSE_OR_RISKY.map((r) => [
                r.claim,
                r.reality,
                r.action,
              ])}
            />
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <H2>4. Competitive / UX principles (CA SaaS)</H2>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Do</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text>• Optimize for month-end crunch: fewer clicks to Scan / 2B</Text>
              <Text>• Show credit cost before AI actions (402 prevention UX)</Text>
              <Text>• Client context always visible — never lose the active GSTIN</Text>
              <Text>• Prefer tables + filters over decorative charts above the fold</Text>
              <Text>• Empty states that teach the CA workflow once</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Don&apos;t</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text>• Fake ratings, user counts, or SOC2-of-ourselves</Text>
              <Text>• Sell monthly subscription when product is prepaid packs</Text>
              <Text>• Lock core tools behind Pro (credits-only is policy)</Text>
              <Text>• Dashboard paralysis (20 equal-weight metrics)</Text>
              <Text>• Icon-only sidebar for primary nav</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <H2>5. Phased rollout</H2>
      <Table
        headers={["Phase", "Effort", "Risk", "Scope"]}
        rows={PHASES.map((p) => [p.phase, p.effort, p.risk, p.work])}
      />
      <Callout tone="success" title="Recommended proceed sequence">
        Start with Phase A (truth + tokens) — highest trust ROI, lowest risk.
        Then Phase B dashboard IA for daily CA retention. Phase C landing
        redesign last, once pricing/FAQ/schema are honest and the palette is
        locked.
      </Callout>

      <Divider />

      <H2>6. Open questions (need your decisions)</H2>
      <Table
        headers={["Decision", "Detail"]}
        rows={OPEN_QUESTIONS.map((o) => [o.q, o.detail])}
      />

      <Text tone="tertiary" size="small">
        Sources: frontend/src/lib/pricing.ts · backend/credits.py ·
        frontend/src/App.tsx · Layout.tsx · LandingPage.tsx · index.css ·
        CREDITS_DOCUMENTATION.md · docs/13_Monetization_Architecture.md · B2B
        SaaS IA research (side nav, Cmd+K, KPI strip, empty states, 2024–2026).
      </Text>
    </Stack>
  );
}
