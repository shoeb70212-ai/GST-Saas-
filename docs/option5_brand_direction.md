# Option 5 — Locked brand direction (KhataLens)

**Status:** Research / plan only — not implemented in React yet.  
**Locked system:** **Fog & Copper Seal**  
**Supersedes:** prior “Cool ledger” deep-teal proposal (`#0B5F6B` + Source Serif 4 + IBM Plex Sans).  
**Canvas:** [`docs/canvases/option5-product-polish-design-plan.canvas.tsx`](./canvases/option5-product-polish-design-plan.canvas.tsx) (also mirrored under Cursor canvases).

---

## Why this direction (one system)

KhataLens is an **Indian CA GST desk tool**, not an “AI product” landing page. The brand should feel like **archival paper + sealing wax on a ledger clasp** — calm, precise, physical — while staying **light-first and minimal**.

| Avoided cluster | Why |
|-----------------|-----|
| Current cream `#F5F1EA` + Playfair + maroon/terracotta | Exact user-rule AI-slop combo |
| Purple / indigo mesh gradients | Default AI SaaS look 2023–2026 |
| Deep teal + cool slate (prior Option 5) | Too close to Stripe / Linear / generic fintech |
| Dark-mode-first AI glow | Wrong for CA month-end desks; signals “AI toy” |

**Copper** (`#B56A3A`) is rare in B2B SaaS, reads as seal/hardware not fashion gold, and highlights **only** CTAs and critical KPIs. Surfaces stay near-white fog — no glass, no mesh.

---

## Colour story → CSS vars (light-first)

| CSS variable | Hex / value | Role |
|--------------|-------------|------|
| `--bg-base` | `#F3F4F2` | Fog paper (cool mineral white — **not** cream) |
| `--bg-surface` | `#FFFFFF` | Solid white panels (no `backdrop-blur` glass) |
| `--bg-sunken` | `#E6E8E4` | Inset wells, table zebra optional |
| `--bg-overlay` | `rgba(18, 20, 18, 0.45)` | Modals |
| `--text-primary` | `#141614` | Graphite ink |
| `--text-secondary` | `#5A615C` | Muted sage-gray |
| `--text-disabled` | `#9AA19B` | Disabled |
| `--text-inverse` | `#F3F4F2` | On accent / dark chrome |
| `--border` | `#CDD2CD` | Hairline structure |
| `--border-focus` | `#B56A3A` | Focus ring = accent |
| `--accent` | `#B56A3A` | **Copper seal** — primary buttons, key KPIs, links on marketing |
| `--accent-hover` | `#964F2A` | Hover |
| `--accent-subtle` | `rgba(181, 106, 58, 0.10)` | Soft chip / selected row tint |
| `--success` | `#1B6B45` | ITC / matched |
| `--warning` | `#A65D12` | Caution (amber — not terracotta twin of cream) |
| `--error` | `#B42318` | Mismatch / debit |
| `--gst-cgst` | `#2F6F8F` | CGST chip only |
| `--gst-sgst` | `#3D6B55` | SGST chip only |
| `--gst-igst` | `#5C5A8A` | IGST chip only (muted; not neon indigo) |

**Accent discipline:** copper appears on primary CTA, active nav indicator, and “needs attention” KPI numbers — nowhere else as decoration.

**Razorpay:** sync `BRAND_ACCENT_HEX` in `frontend/src/lib/pricing.ts` to `#B56A3A` when Phase A lands.

**Dark mode:** optional toggle later; tokens derived from the same graphite/copper logic. Do **not** ship dark-first landing.

---

## Typography (locked)

| Role | Face | Why |
|------|------|-----|
| Display / landing H1–H2 | **Newsreader** (Google Fonts, variable `opsz`) | Editorial ledger voice; not Playfair didone; optical sizes for hero |
| UI / body / dense tables | **Public Sans** (Google Fonts) | Built for dense professional UIs; high clarity at 12–14px; **not** Inter |
| Mono (GSTIN, amounts, codes) | **IBM Plex Mono** | Finance-native tabular feel; replace JetBrains if we want one foundry family for mono |

**Do not use:** Inter, Roboto, Arial, system-ui as brand faces, Playfair Display, Space Grotesk (overused “distinctive” AI pick), Instrument Serif+Inter (2026 template combo).

**CSS map:**

```css
--font-display: "Newsreader", "Source Serif 4", Georgia, serif;
--font-body: "Public Sans", "Source Sans 3", ui-sans-serif, sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, monospace;
--font-sans: var(--font-body);
```

Load only needed weights (e.g. Newsreader 500/600; Public Sans 400/500/600; Plex Mono 400/500) with `display=swap`.

---

## Landing composition principles

Aligned with user design prefs + 2025–26 high-craft B2B patterns (purposeful minimalism, type as trust, real product visuals — not kinetic typography spam).

1. **Full-bleed hero** — brand **KhataLens** is hero-level (not a nav-only wordmark).
2. **One hero job** — brand + one headline + one short sentence + one CTA group + one dominant **real product** visual (scan/recon UI). No inset media cards, no floating badges on the hero image.
3. **No card spam in hero** — cards only where interaction requires a container (pricing packs, FAQ).
4. **Motion budget: 2–3 intentional** — e.g. (1) hero product fade/slide once, (2) workflow strip stagger on scroll, (3) primary CTA hover. Kill per-element fade-up on every section.
5. **Truth only** — no fake ratings, user counts, awards, or invented testimonials. Pricing = prepaid packs from `pricing.ts` / `credits.py`.
6. **Atmosphere without mesh** — subtle paper grain or soft fog wash OK; no purple gradients, no glassmorphism navbar.

---

## Dashboard: highlight “today’s work” (anti Midjourney-admin)

- Solid white surfaces on fog base; **no** glass cards, neon glow, or equal-weight bento mosaic.
- **Today strip (4 KPIs max):** wallet credits · invoices this period · 2B unmatched · bank unmatched — copper number only when that KPI needs action.
- **Continue work:** 3–4 primary text+button rows (Scan, Review invoices, Run 2B, Upload bank) — not icon-in-pastel-circle grids.
- Charts below the fold; tables and filters win above the fold.
- Keep recon grid `useMemo` / `useCallback` rules; KPI counts via RPC — never load full invoice tables for the strip.

---

## Phases (revised for Fog & Copper)

| Phase | Scope |
|-------|--------|
| **A — Trust & tokens** | Fix false landing claims; prepaid pricing copy; swap tokens to Fog & Copper + Newsreader/Public Sans/Plex Mono; sync Razorpay accent hex. |
| **B — Dashboard IA** | Grouped sidebar; Today strip; Continue-work; empty states; optional Cmd+K; copper only on action KPIs/CTAs. |
| **C — Landing redesign** | Full-bleed brand-first hero; honest sections; real product shots; 2–3 motions; remove fake social proof/schema. |

---

## Anti-patterns checklist (AI-slop tells)

Do **not** ship any of these:

- [ ] Purple / indigo / violet gradients or `bg-clip-text` gradient headlines  
- [ ] Warm cream `#F4F1EA`–class base + terracotta + display serif (current look)  
- [ ] Inter / Roboto / system-default as primary brand fonts  
- [ ] Playfair Display (or “luxury didone + cream”)  
- [ ] Deep teal / cyan as primary brand (Stripe/Linear clone risk)  
- [ ] Glassmorphism everywhere (`backdrop-blur` cards, frosted nav)  
- [ ] Neon glow / `shadow-glow` as decoration  
- [ ] `rounded-full` pill spam; icon-in-pastel-rounded-square feature rows  
- [ ] Hero = centered headline + three equal feature cards  
- [ ] Fake social proof (stars, “X CAs switched”, invent ratings JSON-LD)  
- [ ] Dark-mode-first marketing for this product  
- [ ] Broadsheet density (hairline rules, zero radius, newspaper columns)  
- [ ] Uniform fade-in-up on every block  
- [ ] Copy: “AI-powered / seamless / elevate / revolutionize”

---

## Research notes (short)

- **AI-slop** converges on purple gradients, Inter, centered hero + 3 cards, glass, timid slate — documented widely (e.g. avoid-ai-design pattern lists, 2025–26 critiques of vibe-coded landings).
- **High-craft B2B 2025–26** rewards purposeful minimalism, typography as trust, authentic product visuals, singular accent used surgically — not kinetic type for its own sake.
- **KhataLens today:** cream base, Playfair + Inter, maroon accent, heavy Framer fade-ups, marketing claims that exceed product truth — fix truth in Phase A before visual redesign.

---

## Decisions still needing user OK (before Phase A code)

1. **Approve Fog & Copper Seal** (accent `#B56A3A`) vs prefer a cooler copper or near-oxblood lacquer.  
2. **Approve Newsreader + Public Sans + IBM Plex Mono** (or swap display to Literata if Newsreader feels too “publishing”).  
3. **Logo:** keep current mark retinted to copper, redraw clasp/mark, or wordmark-only.  
4. **Accuracy / signup credits / WhatsApp:** no % accuracy or “live WhatsApp” until verified; confirm signup credit seed for CTA.  
5. **Enterprise card:** Contact Sales only — no white-label / API / on-prem claims until shipped.
