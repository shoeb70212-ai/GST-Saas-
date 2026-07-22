# Plan — OCR-first / multi-approach routing before the LLM

*Created 2026-07-23. Source of truth: `backend/bench/data/raw/khatalens-extraction-architecture-brief.md` (Sections 5–8). Status: proposed, awaiting approval.*

---

## Goal

Add a deterministic **"route before the LLM"** layer so that each document takes the
cheapest path that hits the required accuracy, and only genuinely-novel
handwritten/scanned docs reach the vision-LLM. Introduce a **pluggable classical-OCR
provider** (Azure Read first; Google Document AI / AWS Textract behind the same
interface) for grounding + bounding boxes, plus a **validation-gated human review**
queue and a **vendor correction memory**.

### Success criteria
1. Digital-native PDFs (real text layer) extract **without any vision tokens**.
2. GST e-invoices with a QR get 8 fields (GSTINs, DocNo, DocDt, InvVal, ItemCnt, MainHSN, IRN) at ~100% via QR decode, used as seeds + cross-checks.
3. A bench harness A/B-compares **classical OCR (Azure) vs vision-LLM** on the 19 real handwritten samples — decision is data-driven, not spec-sheet.
4. Every path funnels through the same validation gate; failures route to a review queue with source-image bbox highlighting.
5. All new branches are **env-flagged, default-off**, mirroring `ROUTING_USE_GEMINI_FOR_HARD`.

---

## Vendor research summary (2026)

| Capability | Azure Doc Intelligence | Google Document AI | AWS Textract |
|---|---|---|---|
| Basic OCR / Read | **$1.50 / 1k** | $1.50 / 1k (Vision) | $1.50 / 1k |
| Tables/Layout | $10 / 1k | ~$10–25 / 1k | $15 / 1k |
| Forms / key-value | $10 / 1k (prebuilt) | — | $50 / 1k |
| Custom (5 samples) | $30–50 / 1k, **free training** | ✅ Workbench | ❌ none |
| Handwriting | good clear / weak messy | multi-lang improving | strongest EN, weak non-EN |
| Bounding boxes | excellent | excellent | excellent |
| On-prem container | ✅ | ❌ | ❌ |
| Invoice field acc. (benchmarks) | ~93% | ~82% | ~78% |

**Recommendation — Azure-first, pluggable:**
- Azure **Read API ($1.50/1k)** = cheapest, strongest printed-text, and there's an existing **~$1,000 Azure Startups credit** (≈33k–100k pages) to evaluate for free.
- **Do NOT** use Azure's prebuilt **Invoice** model — its schema is Western (VendorName/InvoiceTotal), **no GSTIN/HSN/CGST/SGST/IGST**. Custom Extraction is template-fit → doesn't scale to KhataLens's open small-trader vendor universe.
- Azure prebuilt **Bank Statement** fits *scanned* statements only; native-PDF statements go through the free text path.
- Keep Google/AWS as drop-in adapters behind one interface so we can re-benchmark later.

**GST e-invoice QR:** signed JWT (`Header.Payload.Signature`). We only read the middle payload for internal seeding — decode with `PyJWT` `verify_signature=False`; do **not** re-sign or mutate. Use OpenCV `QRCodeDetector` (no `zbar` system dependency → clean on Windows/Docker) with a `pyzbar` fallback.

---

## Target routing (adapts brief Section 5 to current code)

```
Ingest (bytes, declared mime)
  │
  ├─ 1. Native text layer? (fitz/pdfplumber, free, deterministic)
  │        YES → structured text + tables → text-only LLM normalize (cheap)  [skip vision]
  │
  ├─ 2. QR / IRN present? (OpenCV QRCodeDetector → PyJWT payload)
  │        YES → seed 8 signed fields; treat as high-confidence, cross-check others
  │
  ├─ 3. Known recurring vendor w/ stable layout?  (future / optional)
  │        → Azure Custom Extraction (deferred — only if a CA repeats a vendor)
  │
  └─ 4. Everything else (novel handwritten/scanned) → vision-LLM path
           + optional classical OCR (Azure Read) as grounding text_layer
  ▼
Validation gate (deterministic): GSTIN checksum + qty·rate, Σlines=taxable, taxable+tax=total
  ▼
Confidence-gated review queue → CA, with bbox highlight (OCR word boxes)
  ▼
Vendor correction memory: deterministic rules (critical fields) / prompt hints (fuzzy)
```

This layer sits **in front of** today's `run_ai_extraction`; the existing easy/hard
router and targeted re-extraction stay as the vision-path implementation.

---

## Phased work

### Phase A — Deterministic pre-LLM gate (no cloud vendor; cheapest wins first)
- `backend/qr_decode.py`: `detect_and_decode_qr(image_bytes) -> QrPayload | None` (OpenCV + PyJWT). Map `SellerGstin→Supplier_GSTIN`, `BuyerGstin→Buyer_GSTIN`, `DocNo`, `DocDt`, `TotInvVal`, `ItemCnt`, `MainHsnCode`, `Irn`.
- Strengthen native-text gate in `preprocess.py` / `extraction_router.py`: when a PDF has a rich text layer, produce structured text+tables and route to text-only normalization, **skipping vision entirely** (not just "cheaper mini").
- New top-level `backend/ingest_router.py`: `classify_source(content, mime) -> SourcePlan {native_text | qr_seeded | vision}` called before `run_ai_extraction`; QR seeds merged as high-confidence and used to cross-check LLM output.
- Tests: hermetic QR-decode fixtures; native-text gate skips vision; QR seeds win on the 8 signed fields.

### Phase B — Pluggable OCR provider + Azure Read
- Status: **implemented**. Adapters in `backend/ocr/*`; production wiring via
  `ocr.grounding` + `extraction._apply_ocr_grounding`.
- Env: `OCR_ENABLED=0` (default off), `OCR_PROVIDER=azure`, `AZURE_DI_*`,
  optional `OCR_SKIP_IF_TEXT_RICH=1`, `OCR_FORCE_BBOX=0`, `OCR_MAX_WORDS=400`.
- When enabled on image/hybrid: OCR text merges into `text_layer` for field
  grounding; compact `Ocr_Words` attached on the extraction response (not DB).
- OCR failures never fail the scan.

### Phase C — Validation gate + confidence-gated review queue
- Status: **implemented**.
- Backend: `review_reasons.build_review_reasons` → `Review_Reasons` / `Review_Fields` on
  extraction response (GSTIN, tax math, missing/ungrounded/low-score fields, QR overrides).
- Threshold: `REVIEW_FIELD_SCORE_MIN` (default `0.7`); overall state still uses 95/85 gates.
- Frontend: `InvoiceRow` lists reasons, amber-flags fields, `OcrPreviewOverlay` draws OCR
  boxes on the source preview for the selected flagged field.

### Phase D — Vendor correction / memory layer
- Status: **implemented**.
- Migration: `migration_phase73_vendor_correction_rules.sql` (org + vendor_gstin keyed).
- Backend: `vendor_memory.py` (exact overlay + soft prompt hints), wired in
  `run_ai_extraction`; learn API `POST /api/vendor-memory/learn`.
- Frontend: on cloud save, diffs `Extraction_Snapshot` vs edited fields and teaches memory.
- Env: `VENDOR_MEMORY_ENABLED` (default `1`). Apply migration before relying on learn/fetch.

### Phase E — Bench: classical-OCR vs vision-LLM on real samples
- Status: **implemented** (`backend/ocr/*`, `backend/bench/run_ocr_compare.py`).
- Run with Azure Startups credit when `AZURE_DI_ENDPOINT` + `AZURE_DI_KEY` are set; see `backend/bench/README.md`.
- Offline: `python -m bench.run_ocr_compare --predictions results/pred.jsonl --skip-ocr`
- Output: `results/ocr_compare.json` + `results/ocr_dumps/{id}.txt` for replay.

---

## Files touched (new unless noted)
- `backend/qr_decode.py`, `backend/ingest_router.py`
- `backend/ocr/{base,azure_read,google_docai,aws_textract}.py`
- `backend/vendor_memory.py` + Supabase migration `vendor_correction_rules`
- `backend/bench/run_ocr_compare.py`
- Edits: `backend/extraction.py` (call `classify_source` + merge QR seeds + OCR grounding), `backend/extraction_router.py` / `backend/preprocess.py` (native-text skip-vision gate), `frontend` scan review (bbox highlight)
- Deps: `opencv-python-headless`, `PyJWT`, `azure-ai-documentintelligence`, `pdfplumber`

## Risks / open questions
- **Data residency**: Indian client invoices to Azure — confirm region + consent before enabling `OCR_ENABLED`.
- **Latency/cost**: OCR only when no text layer, or only to produce review bboxes — not on every doc.
- **Docker/Windows deps**: prefer OpenCV QR (no `zbar`); verify wheels in the backend image.
- **Thresholds** (brief §9): confidence + reconciliation-mismatch cutoffs are a **product decision** and gate Phases C/D.
- All branches default-off; ship behind flags and prove each with bench before flipping defaults.

## Suggested order
A (deterministic, high ROI, no vendor) → E (free Azure eval to justify B) → B → C → D.
