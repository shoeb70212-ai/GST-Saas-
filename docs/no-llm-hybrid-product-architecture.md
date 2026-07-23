# KhataLens — No-LLM Core + Hybrid Product Architecture

> **Saved:** 2026-07-22  
> **Status:** Locked product direction (planning)  
> **Companion docs:**  
> - [cross-platform-apps-strategy.md](./cross-platform-apps-strategy.md) — Capacitor / Tauri shells  
> - [superpowers/plans/2026-07-22-scan-extraction-export-overhaul.md](./superpowers/plans/2026-07-22-scan-extraction-export-overhaul.md) — LLM scan accuracy overhaul  
> - Desktop invoice samples brief: `~/OneDrive/Desktop/Invoice/khatalens-extraction-architecture-brief.md`

---

## 1. Decision (locked)

**Do not choose “LLM-only” vs “no-LLM fork.” Evolve the current product:**

| Layer | Role |
|-------|------|
| **Deterministic core (default)** | Excel/text-PDF/JSON parse, multi-pass reconcile, Tally export, IMS workflow, ITC-at-risk, audit trail, local DB |
| **LLM Smart Scan (optional, paid)** | Photographed / handwritten invoices when rules+OCR are not enough |
| **Internet OK** | GSTIN APIs, GSP/GSTN pulls, sync, WhatsApp/email follow-ups — **no LLM required** |
| **“Offline” means** | No LLM dependency — not “no internet” |

One React codebase; feature-flag LLM. Later package the deterministic core as a **desktop one-time edition** without a rewrite.

---

## 2. Why this direction

### 2.1 CA / accountant pain points (2026 research)

IMS + zero-mismatch ITC (from ~Apr 2026) shifted work from month-end filing to **continuous ITC protection**:

1. IMS Accept / Reject / Pending (deemed acceptance risk)  
2. ITC-at-risk before GSTR-3B  
3. Fuzzy invoice mismatches (INV/123 vs 123, rounding, GSTIN typos)  
4. Vendor non-compliance holds ITC hostage  
5. Audit-grade proof (structured codes + PDF/Excel)  
6. Multi-client / multi-GSTIN firm dashboards  
7. Notices + sequential blocking calendars  
8. CSV ping-pong with Tally / portal  
9. HSN / RCM errors  
10. Messy photo invoices (only item that truly needs vision LLM)

**9 of 10 need zero LLM.** Competitors often brand rule-based fuzzy match as “AI”; we can ship the same as **deterministic + auditable**.

### 2.2 Cost / ops evidence (this product)

- OpenRouter logs for ZIP batches: GPT-4o-mini (~27k–50k in) + escalate GPT-4o — often **2 LLM calls/file** for 1 KhataLens credit.  
- Wallet refunds after AI ran (duplicates / DB errors) made balance look “unchanged” while API cost was already spent.  
- Sample set (~50 WhatsApp photos + PDF): ~40% clean typed, ~60% handwritten / degraded — single-pass “>99%” is not a real target.

### 2.3 What already works without LLM (in-repo)

| Capability | Modules |
|------------|---------|
| Tally IR + balanced XML + masters | `tally_ir.py`, `tally_export.py`, `converter_service.py` |
| Excel / register → document | `converter_service.py` |
| GSTR-2B / purchase multi-pass match (Tier-1 + Smart Match rules) | `match_utils.py`, `reconcile_routes.py` |
| Bank AP Tier-1 + rules Tier-2 (GPT optional via `BANK_AI_MATCH`) | `reconcile_service.py`, `match_utils.py` |
| ITC-at-Risk tags + API | `itc_risk.py`, `itc_risk_routes.py` |
| IMS Accept/Reject/Pending (JSON upload) | `ims.py`, `ims_routes.py` |
| Audit claim-pack Excel | `audit_pack.py`, `audit_routes.py` |
| Tax liability / GSTR-1 Excel | `sales_routes.py` |
| GSTIN lookup / cache | `gstin_service.py` |

---

## 3. Extraction routing (no single-model bet)

Aligned with the desktop architecture brief. Gate on **text layer first**, then document type:

```
Ingest
  ├─ Native text PDF / Excel / CSV / GSTR JSON?
  │     → Free library parse (pdfplumber / pandas / JSON)
  │     → Optional cheap text-only normalize (or pure rules)
  ├─ E-invoice IRN / QR present?
  │     → Decode QR — near-zero cost, near-100% for those fields
  ├─ Known recurring vendor + enough volume?
  │     → Template / Custom Extraction / correction rules (vendor_gstin → rules)
  └─ Photographed / handwritten / novel layout
        → Vision LLM (Smart Scan) + deterministic validation
        → Confidence / math fail → human review queue
```

**After every path:**

- GSTIN checksum + format  
- Arithmetic: qty×rate, line sum = taxable, taxable + tax = total  
- Failures → review queue (first-class, not an afterthought)

**Correction memory:** `vendor_gstin → deterministic rules` for critical fields; soft prompt hints only for free-text descriptions.

---

## 4. Product modules to add (priority)

### P0 — Highest leverage (deterministic)

1. **Multi-pass rule matcher** — ✅ Pass 1 (`backend/match_utils.py`); wired into GSTR Tier-1 + Smart Match (`reconcile_routes.py`) and bank Tier-2 (`reconcile_service.py`, `BANK_AI_MATCH=0` default).  
2. **ITC-at-Risk dashboard** — ✅ MVP Pass 1 (`migration_phase75_itc_risk.sql`, `itc_risk.py`, `GET /api/itc-risk`, `/app/itc-risk`). Full Section 17(5) HSN master still open.  
3. **Audit codes + multi-sheet Excel claim pack** — ✅ Pass 2 (`audit_pack.py`, `GET /api/audit/claim-pack`). Client PDF still open.  
4. **IMS action cockpit** — ✅ Pass 2 JSON upload MVP (`migration_phase76_ims.sql`, `ims_routes.py`, `/app/ims`); deemed-accept countdown + bulk Accept/Reject/Pending. GSP/GSTN live API still open.

### P1 — Firm workflow

5. Multi-client / multi-GSTIN compliance board (extends existing org + ClientContext).  
6. Vendor follow-up WhatsApp/email + filing-status vetting.  
7. Compliance calendar / notice tracker.  
8. HSN / rate / RCM validators on import.

### P2 — Capture without forcing LLM

9. On-device OCR (Tesseract desktop; ML Kit / Vision on mobile) + pattern extraction (GSTIN, dates, amounts).  
10. Vendor templates for recurring formats.  
11. Optional cloud OCR (Azure Read / Vision) — still not generative LLM.  
12. Keep **LLM Smart Scan** as credits / paid toggle for the hard handwritten tail.

### P3 — Packaging

13. Local-first SQLite + optional Supabase sync.  
14. Tauri Windows desktop edition (one-time license) = deterministic core only.  
15. Capacitor mobile capture → sync to firm account.

---

## 5. Cross-platform (internet OK, LLM optional)

```
React 19 + Vite UI
  ├─ Web SaaS (full: core + optional Smart Scan credits)
  ├─ Capacitor → Android / iOS (camera, ML Kit / Vision OCR, SQLite)
  └─ Tauri 2
       ├─ **Tally Bridge companion** (`bridge/`) — poll jobs → local Tally :9000 (no LLM)
       └─ Full Windows / macOS shell later (Tesseract, file dialogs, SQLite; LLM off by default)

Shared: deterministic Python/TS logic + optional sync to Supabase
```

See [cross-platform-apps-strategy.md](./cross-platform-apps-strategy.md) and [tally-bridge.md](./tally-bridge.md). Override: earlier note “don’t run FastAPI/LLM on-device” still holds for LLM; **deterministic FastAPI sidecar or ported pure modules** on desktop is allowed. Bridge packaging is a **thin companion**, not a second exporter — XML is still built in cloud via `tally_export`.

---

## 6. Monetization sketch

| Edition | Includes | Pricing idea |
|---------|----------|--------------|
| **Cloud Core** | Reconcile, Tally, IMS tools, Excel/PDF text import | Lower / firm seat or pack |
| **Smart Scan add-on** | Vision LLM + escalation | Credits (current wallet) |
| **Desktop Convert** | Offline-capable core, no LLM binary | One-time license |

---

## 7. Relationship to scan overhaul

The [scan extraction export overhaul](./superpowers/plans/2026-07-22-scan-extraction-export-overhaul.md) **improves Smart Scan quality and cost** (routing, validators, bench on real samples). It does **not** make LLM the product spine.

Order of work:

1. Document this architecture ✅ (this file)  
2. Run scan overhaul Phase 0+ (bench + validators + sample gold set)  
3. Multi-pass rule matcher + ITC MVP ✅ (Pass 1, 2026-07-23)  
4. IMS cockpit + audit claim packs ✅ (Pass 2, 2026-07-23) — PDF pack + GSP IMS still open  
5. Tally Bridge (device auth + job queue + Windows companion scaffold) ✅ — see [tally-bridge.md](./tally-bridge.md)

---

## 8. Explicit non-goals (near term)

- Full accounting ERP replacement (ledgers, payroll) in v1 of desktop  
- Claiming “>99% OCR with one model” on open-universe handwritten trade invoices  
- Separate long-lived fork of the repo for “no-LLM only”

---

## Resume

- Product direction questions → open this file.  
- Scan accuracy work → “proceed with the scan overhaul plan”.  
- Desktop scaffold → “Start Tauri Windows scaffold” (after core modules exist).
