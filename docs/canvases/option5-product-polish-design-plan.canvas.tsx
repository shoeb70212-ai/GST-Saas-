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
 * Locked brand: Fog & Copper Seal (supersedes deep-teal Cool ledger).
 * Companion: docs/option5_brand_direction.md
 * Truth sources: pricing.ts, credits.py, App.tsx, Layout.tsx,
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

const LOCKED_TOKENS = [
  { token: "--bg-base", hex: "#F3F4F2", note: "Fog paper — not cream" },
  { token: "--bg-surface", hex: "#FFFFFF", note: "Solid white — no glass" },
  { token: "--bg-sunken", hex: "#E6E8E4", note: "Mineral inset" },
  { token: "--text-primary", hex: "#141614", note: "Graphite ink" },
  { token: "--text-secondary", hex: "#5A615C", note: "Sage-gray" },
  { token: "--border", hex: "#CDD2CD", note: "Soft mineral" },
  { token: "--accent", hex: "#B56A3A", note: "Copper seal — CTAs/KPIs only" },
  { token: "--accent-hover", hex: "#964F2A", note: "Deeper copper" },
  { token: "--accent-subtle", hex: "rgba(181,106,58,0.10)", note: "Tint fill" },
  { token: "--success", hex: "#1B6B45", note: "ITC / matched" },
  { token: "--warning", hex: "#A65D12", note: "Amber caution" },
  { token: "--error", hex: "#B42318", note: "Mismatch / debit" },
  { token: "--gst-cgst", hex: "#2F6F8F", note: "CGST chip" },
  { token: "--gst-sgst", hex: "#3D6B55", note: "SGST chip" },
  { token: "--gst-igst", hex: "#5C5A8A", note: "IGST chip (muted)" },
  { token: "font-display", hex: "Newsreader", note: "Editorial ledger — not Playfair" },
  { token: "font-body", hex: "Public Sans", note: "Dense CA tables — not Inter" },
  { token: "font-mono", hex: "IBM Plex Mono", note: "GSTIN / amounts" },
];

const AI_SLOP_AVOID = [
  { tell: "Purple / indigo mesh gradients", why: "Default AI SaaS 2023–26" },
  { tell: "Cream + terracotta + Playfair", why: "Current look; user-rule forbid" },
  { tell: "Deep teal primary (prior plan)", why: "Stripe / Linear fintech clone" },
  { tell: "Inter / Roboto / system brand faces", why: "Statistical AI default" },
  { tell: "Glassmorphism + neon glow", why: "Template Midjourney admin" },
  { tell: "Hero + 3 equal icon cards", why: "Identical AI landing layout" },
  { tell: "rounded-full pill spam", why: "Startup kit residue" },
  { tell: "Fake stars / user counts / awards", why: "Truth debt; kills CA trust" },
  { tell: "Dark-mode-first marketing", why: "Wrong for CA desks; AI-product signal" },
  { tell: "Per-block fade-up everywhere", why: "Motion noise, not presence" },
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
    claim: "JSON-LD aggregateRating 4.9 / 120 reviews",
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
    contents: "Wallet · invoices · 2B unmatched · bank unmatched — copper only if action needed",
  },
  {
    priority: "P0",
    section: "Continue work",
    contents: "Scan · Open invoices · Run GSTR-2B · Upload bank — text+button rows, not icon cards",
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
    contents: "Below fold only — not Midjourney bento glass mosaic",
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
    section: "1. Hero (full-bleed)",
    copy: "KhataLens — Invoice to GSTR-2B, without the spreadsheet grind.",
    support:
      "Brand-first. One headline, one sentence, one CTA group, one real product visual. No cards, badges, or fake stats in the first viewport.",
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
      "AI extraction · multi-client isolation · GSTR-2B deep match · bank parse · client upload portal · WhatsApp intake (if configured).",
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

const MOTION_BUDGET = [
  { n: "1", moment: "Hero product reveal", detail: "Single fade/slide of real UI — once on load" },
  { n: "2", moment: "Workflow strip", detail: "Light stagger on scroll into view" },
  { n: "3", moment: "Primary CTA", detail: "Copper hover / press only — no bounce arrows" },
];

const PHASES = [
  {
    phase: "A — Trust & tokens + layout ✅",
    effort: "Shipped 2026-07-21",
    risk: "Low",
    work: "False claims fixed; Fog & Copper tokens; fonts; BRAND_ACCENT_HEX; brand-first landing; Today strip; grouped sidebar.",
  },
  {
    phase: "B — Dashboard IA ✅",
    effort: "Shipped 2026-07-21",
    risk: "Low",
    work: "Live unmatched 2B/bank KPIs (get_today_strip_counts); Cmd+K; chart empty CTAs.",
  },
  {
    phase: "C — Landing polish",
    effort: "Optional",
    risk: "Low",
    work: "More product shots / motion refinement if needed (core layout in A).",
  },
];

const OPEN_QUESTIONS = [
  {
    q: "Lock Fog & Copper?",
    detail: "Accent #B56A3A — or cooler copper / lacquer oxblood variant?",
  },
  {
    q: "Lock type stack?",
    detail: "Newsreader + Public Sans + IBM Plex Mono — or Literata for display?",
  },
  {
    q: "Logo lockup",
    detail: "Keep mark retinted to copper, redraw clasp, or wordmark-only?",
  },
  {
    q: "Signup credits + WhatsApp",
    detail: "Confirm live seed + production number before CTA / feature claims.",
  },
  {
    q: "Accuracy claim",
    detail: "Run eval before any % — or qualitative confidence-flag copy only.",
  },
  {
    q: "Enterprise tier",
    detail: "Contact Sales only — no white-label/API/on-prem until true.",
  },
];

export default function Option5ProductPolishDesignPlan() {
  const theme = useHostTheme();

  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 1100 }}>
      <Stack gap={8}>
        <Row gap={8} style={{ alignItems: "center" }}>
          <Pill tone="info">Option 5</Pill>
          <Pill tone="success">Fog & Copper Seal</Pill>
          <Pill tone="success">Phase A shipped</Pill>
          <Pill tone="success">Phase B shipped</Pill>
          <Pill tone="neutral">Phase C optional</Pill>
        </Row>
        <H1>KhataLens — locked brand & polish plan</H1>
        <Text tone="secondary">
          One primary system (not five vague options): mineral fog surfaces,
          copper seal accent for CTAs/KPIs only, Newsreader + Public Sans.
          Truthful CA GST product — anti generic-AI aesthetic. Companion doc:
          docs/option5_brand_direction.md
        </Text>
      </Stack>

      <Callout tone="success" title="Phase A shipped (2026-07-21)">
        Landing truth fixed (prepaid packs, no fake ratings/JSON-LD stars).
        Fog & Copper tokens + fonts live. Brand-first hero, Today strip, and
        grouped sidebar landed. Phase B also shipped: live unmatched 2B/bank
        KPIs, Cmd+K, richer empty states. Phase C optional.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="#B56A3A" label="Locked accent · copper seal" />
        <Stat value="Newsreader" label="Display · not Playfair" />
        <Stat value="Public Sans" label="UI / tables · not Inter" />
        <Stat value="Light-first" label="No dark-by-default landing" />
      </Grid>

      <Divider />

      <H2>1. Locked brand — Fog & Copper Seal</H2>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Colour story</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text>
                Evokes archival fog paper and a copper sealing clasp on a physical
                khata — not Stripe teal, not purple AI mesh, not cream boutique.
              </Text>
              <Text tone="secondary">
                Surfaces stay minimal and near-white. Copper (#B56A3A) appears
                only on primary CTAs, focus rings, and KPIs that need action.
                Semantic greens/reds stay for ledger match/mismatch — never fight
                the accent.
              </Text>
              <H3>Why not deep teal</H3>
              <Text tone="secondary">
                Prior Cool ledger (#0B5F6B) was safer but still fintech-default.
                Copper is rarer in B2B SaaS and still professional for CA desks.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Typography + voice</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text>
                <Text weight="semibold">Display:</Text> Newsreader (optical size)
                for marketing H1–H2 only.
              </Text>
              <Text>
                <Text weight="semibold">UI / body:</Text> Public Sans for dense
                recon tables and app chrome.
              </Text>
              <Text>
                <Text weight="semibold">Mono:</Text> IBM Plex Mono for GSTIN /
                amounts.
              </Text>
              <Text tone="secondary">
                Voice: senior articled assistant — precise, calm, India-native
                GST vocabulary. No “AI-powered revolution” copy.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Tokens — current vs locked</H3>
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
          <CardHeader trailing={<Pill tone="success">Locked</Pill>}>
            Fog & Copper Seal
          </CardHeader>
          <CardBody>
            <Table
              headers={["CSS var", "Hex / face", "Role"]}
              rows={LOCKED_TOKENS.map((r) => [r.token, r.hex, r.note])}
            />
          </CardBody>
        </Card>
      </Grid>
      <Text tone="tertiary" size="small">
        Phase A: update :root in frontend/src/index.css and BRAND_ACCENT_HEX in
        pricing.ts together (#B56A3A) so Razorpay chrome matches buttons.
      </Text>

      <Divider />

      <H2>2. AI-slop tells to avoid</H2>
      <Text tone="secondary">
        Cross-checked against user design rules, avoid-ai-design pattern lists,
        and 2025–26 critiques of vibe-coded landings. Current KhataLens hits
        cream/Playfair/Inter; prior Option 5 teal risked fintech clone.
      </Text>
      <Table
        headers={["Tell", "Why it reads as AI / generic"]}
        rows={AI_SLOP_AVOID.map((r) => [r.tell, r.why])}
      />

      <Divider />

      <H2>3. Landing composition (Awwwards-restraint)</H2>
      <Callout tone="info" title="Hero budget (non-negotiable)">
        Full-bleed plane. Brand KhataLens at hero signal strength. First
        viewport: brand + one headline + one short sentence + one CTA group +
        one dominant real product visual. No cards, floating badges, or fake
        metrics overlays on the hero.
      </Callout>
      <Table
        headers={["Section", "Headline draft", "Support"]}
        rows={LANDING_SECTIONS.map((s) => [s.section, s.copy, s.support])}
      />
      <H3>Motion budget (exactly 2–3)</H3>
      <Table
        headers={["#", "Moment", "Detail"]}
        rows={MOTION_BUDGET.map((m) => [m.n, m.moment, m.detail])}
      />

      <Divider />

      <H2>4. Dashboard IA (today’s work, not Midjourney admin)</H2>
      <Callout tone="info" title="Principle">
        Solid fog/white surfaces. Task-grouped side nav. 4 actionable KPIs max.
        Continue-work as text+button rows — never pastel icon-card grids. Copper
        only when a KPI needs action.
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
│ • Dash   │  [Credits] [Invoices] [2B gaps*] [Bank gaps] │
│ • Scan   │  * copper number only if unmatched > 0       │
│ • Invoices│──────────────────────────────────────────────│
│──────────│  CONTINUE                                    │
│ Reconcile│  [Scan invoice] [Review queue] [Run 2B]      │
│ • GSTR-2B│──────────────────────────────────────────────│
│ • Bank   │  NEEDS ATTENTION          RECENT INVOICES    │
│ • Match  │  · low confidence         · list…            │
│──────────│  · unmatched 2B rows                         │
│ Clients  │──────────────────────────────────────────────│
│ Firm…    │  Analytics (below fold only)                 │
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
              upload → Upload GSTR-2B. One sentence + one copper CTA.
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

      <H2>5. Claim ledger (truthful product)</H2>
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

      <H2>6. Phased rollout (revised)</H2>
      <Table
        headers={["Phase", "Effort", "Risk", "Scope"]}
        rows={PHASES.map((p) => [p.phase, p.effort, p.risk, p.work])}
      />
      <Callout tone="success" title="Recommended sequence">
        Phase A + B shipped. Phase C landing polish optional — pricing/FAQ
        and Fog & Copper are already locked.
      </Callout>

      <Divider />

      <H2>7. Decisions needing your OK</H2>
      <Table
        headers={["Decision", "Detail"]}
        rows={OPEN_QUESTIONS.map((o) => [o.q, o.detail])}
      />

      <Text tone="tertiary" size="small">
        Sources: index.css · LandingPage.tsx · pricing.ts · credits.py ·
        docs/option5_brand_direction.md · B2B/Awwwards restraint research
        2025–26 · AI-slop pattern lists · user anti-generic design rules.
      </Text>
    </Stack>
  );
}
