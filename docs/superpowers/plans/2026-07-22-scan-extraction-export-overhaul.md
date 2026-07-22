# Scan → Extraction → Export Overhaul

> **Status:** Phase 0–5 code done; gold-set labeling + Gemini hard-route still pending (2026-07-23).  
> **Saved:** 2026-07-22  
> **Product spine:** Deterministic core + optional LLM Smart Scan — see [no-llm-hybrid-product-architecture.md](../../no-llm-hybrid-product-architecture.md).  
> **Samples:** `C:\Users\Junaid\OneDrive\Desktop\Invoice` → copied to gitignored `backend/bench/data/raw/`.  
> **Cursor plan:** `.cursor/plans/scan_extraction_export_overhaul_5d8d3180.plan.md` (if present in local Cursor plans)

## Locked decisions

| # | Decision | Detail |
|---|----------|--------|
| 1b | Gold set | ~50 real invoices from accountants; semi-auto label via consensus (`build_labels.py`) then human review |
| 2b | Priority | Accuracy first, cost second |

## Targets (definition of done)

- Field accuracy ≥ 98% on 7 critical fields (GSTIN, invoice no., date, taxable, CGST, SGST/IGST, total)
- Money-math reconcile ≥ 99%
- Average ≤ ₹0.50/scan; escalation rate ≤ 25%; both logged per scan
- No unmeasured model/prompt change ships (benchmark is the gate)

## Security constraint

Real invoices are sensitive financial PII. The gold set lives in a git-ignored `backend/bench/data/` folder (local + encrypted backup only), never committed. Only anonymized/synthetic fixtures go in git.

## Current-state anchors

- Core: `backend/extraction.py` — preprocess, `run_ai_extraction`, confidence, tax math, Pydantic `InvoiceData`
- Entry: `backend/scan_routes.py` — 1 credit deduct then extract; refund on failure
- GSTIN: `backend/gstin_service.py` — AppyFlow + 30d cache (add checksum)
- Export: `frontend/src/lib/exportService.ts` — main-thread SheetJS
- Line-item bug: `frontend/src/pages/scan/InvoiceRow.tsx` — uncontrolled inputs, edits not saved
- Scan orchestration: `frontend/src/pages/scan/useScanWorkflow.ts` — no cancellation
- Runtime: Azure Standard D4as v5 (4 vCPU / 16 GiB); Docker `WEB_CONCURRENCY=2`; env `AI_SEMAPHORE_LIMIT` / `FILE_SEMAPHORE_LIMIT` (Docker defaults 3/2)

## Phases

### Phase 0 — Benchmark harness + deterministic validators

- [x] `backend/bench/`: `run_bench.py`, `labels.schema.json`, gitignored `data/`, synthetic fixtures
- [x] `build_labels.py`: scaffold (consensus wiring optional next)
- [x] `backend/validators.py`: GSTIN checksum, PAN-in-GSTIN, tax arithmetic
- [x] Wire validators into `compute_confidence`

### Phase 1 — Extraction hardening

- [x] Pin `temperature=0`, `max_tokens`, explicit LLM timeout
- [x] SHA-256 + model-version result idempotency cache
- [x] Per-field confidence + text-layer grounding
- [x] Per-scan token/INR cost in `ops_events` (`scan_cost`) + scan API response

### Phase 2 — Ingestion / preprocess

- [x] Adaptive DPI (150→220 on hard pages), blank-page skip, best-page scorer
- [x] Hybrid markdown + compact image on hard docs (`application/x-invoice-hybrid`)
- [x] Client WebP quality floor (0.92 / max edge 2048); `AbortController` cancel UI

### Phase 3 — Intelligent routing (needs gold set for acceptance)

- [x] Difficulty router (text-rich → mini; hard → stronger vision first)
- [x] Targeted disputed-field re-extraction
- [x] Gemini as first-class hard-route option (`ROUTING_USE_GEMINI_FOR_HARD`, default off until bench)

### Phase 4 — Export correctness + performance

- [x] Fix line-item controlled inputs → `updateExtractedData`
- [x] Pre-export validation gate (totals + mandatory GST fields)
- [x] Web Worker export; export-all-matching; CSV + JSON

### Phase 5 — Production readiness

- [x] `uvicorn --workers 2`; env-configurable semaphores
- [x] Benchmark CI gate on synthetic fixtures
- [x] Admin metrics: escalation %, avg cost/scan, sampled accuracy
- [ ] Label 50 invoices, full bench, record baseline vs improved

## Sequencing

- Phases 0–1 and Phase 4 can start without the gold set (user chose to wait for samples before any implementation).
- Phases 3 and final Phase 5 tuning consume the 50 invoices.

## Gold-set follow-up (before Gemini hard-route)

Human review of real invoices (PII — local only under `backend/bench/data/`):

```bash
cd backend
python -m bench.inventory
python -m bench.build_labels          # optional draft via consensus
# Review/edit JSON under data/labels/
python -m bench.run_bench --labels data/labels --predictions results/pred.jsonl --fail-under 0.98
# Only then consider: ROUTING_USE_GEMINI_FOR_HARD=1
```

## Resume checklist

1. [x] ~50 invoice PDFs/images received from accountants
2. [x] Stored locally under `backend/bench/data/raw/` (gitignored)
3. [x] User asks to proceed / execute this plan
4. [x] Phase 0–5 code complete (gold labeling still open)
5. [ ] Label samples + `run_bench` before enabling `ROUTING_USE_GEMINI_FOR_HARD=1`
6. [x] Phase 5 production readiness code (workers, CI gate, admin metrics)
