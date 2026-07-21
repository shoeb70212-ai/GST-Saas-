# Option 5 — Product polish design plan

**Status:** Phase A shipped (2026-07-21) — Fog & Copper Seal  
**Date:** 2026-07-21  
**Canonical brand lock:** [`option5_brand_direction.md`](./option5_brand_direction.md)

## Open beside chat

- **IDE canvas:** `C:\Users\Junaid\.cursor\projects\d-GST-SAAS\canvases\option5-product-polish-design-plan.canvas.tsx`
- **Repo copy:** [`docs/canvases/option5-product-polish-design-plan.canvas.tsx`](./canvases/option5-product-polish-design-plan.canvas.tsx)
- **Audit stub:** §11 in [`architecture_optimization_audit_2026-07-21.md`](./architecture_optimization_audit_2026-07-21.md)

## Proceed sequence

1. **Phase A — Trust & tokens + layout** ✅ Shipped: landing truth; Fog `#F3F4F2` + Copper `#B56A3A`; Newsreader / Public Sans / IBM Plex Mono; brand-first landing; dashboard Today strip; grouped sidebar; `BRAND_ACCENT_HEX` synced.
2. **Phase B — Dashboard IA (remaining):** Live unmatched 2B/bank KPI RPCs; optional Cmd+K; richer empty states.
3. **Phase C — Landing polish (optional):** More product shots / motion refinement.

## Locked colour tokens (Fog & Copper Seal)

| CSS var | Hex | Role |
|---------|-----|------|
| `--bg-base` | `#F3F4F2` | Fog paper |
| `--bg-surface` | `#FFFFFF` | Solid panels |
| `--text-primary` | `#141614` | Graphite ink |
| `--accent` | `#B56A3A` | Copper seal CTA |
| `--accent-hover` | `#964F2A` | Hover |
| `--success` | `#1B6B45` | Match / credit |
| `--error` | `#B42318` | Mismatch |
| `font-display` | Newsreader | Marketing H1 |
| `font-body` | Public Sans | App UI |
| `font-mono` | IBM Plex Mono | GSTIN / amounts |

Keep Razorpay theme in sync via `BRAND_ACCENT_HEX` in `frontend/src/lib/pricing.ts` (`#B56A3A`).

**Supersedes:** prior cool-teal proposal (`#0B5F6B` + Source Serif 4).
