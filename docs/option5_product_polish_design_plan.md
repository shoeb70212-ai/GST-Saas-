# Option 5 — Product polish design plan

**Status:** Research + plan only (no UI redesign in this sprint)  
**Date:** 2026-07-21

## Open beside chat

- **IDE canvas:** `C:\Users\Junaid\.cursor\projects\d-GST-SAAS\canvases\option5-product-polish-design-plan.canvas.tsx`
- **Repo copy:** [`docs/canvases/option5-product-polish-design-plan.canvas.tsx`](./canvases/option5-product-polish-design-plan.canvas.tsx)
- **Audit stub:** §11 in [`architecture_optimization_audit_2026-07-21.md`](./architecture_optimization_audit_2026-07-21.md)

## Proceed sequence (recommended)

1. **Phase A — Trust & tokens** (2–4 days, low risk): Fix landing false claims (`/month`, ₹999 FAQ, fake JSON-LD ratings); swap cream/Playfair theme to proposed cool-teal tokens; sync `BRAND_ACCENT_HEX`.
2. **Phase B — Dashboard IA** (1–2 weeks): Grouped sidebar, Today KPI strip, Continue-work CTAs, empty states, optional Cmd+K.
3. **Phase C — Landing redesign** (1–2 weeks): New hero + honest sections after palette and copy are locked.

## Recommended colour tokens (proposed)

| CSS var | Hex | Role |
|---------|-----|------|
| `--bg-base` | `#F4F6F8` | Cool paper |
| `--bg-surface` | `#FFFFFF` | Cards |
| `--text-primary` | `#0F172A` | Ink |
| `--accent` | `#0B5F6B` | Deep teal CTA |
| `--accent-hover` | `#084852` | Hover |
| `--success` | `#15803D` | Match / credit |
| `--error` | `#B91C1C` | Mismatch |
| `font-display` | Source Serif 4 | Marketing H1 |
| `font-body` | IBM Plex Sans | App UI |

Keep Razorpay theme in sync via `BRAND_ACCENT_HEX` in `frontend/src/lib/pricing.ts`.
