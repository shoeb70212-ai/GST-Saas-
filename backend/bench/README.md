# Extraction benchmark harness

Real invoice images/PDFs live under **`data/raw/`** (gitignored — PII).

```
backend/bench/
  data/raw/          # gold-set files (never commit)
  data/labels/       # human-reviewed JSON labels
  results/           # run outputs
  labels.schema.json
  run_bench.py       # score extraction vs labels
  build_labels.py    # draft labels via model consensus (optional)
  inventory.py       # list raw files + mime
```

## Security

Do not commit `data/`. Only synthetic fixtures under `backend/tests/fixtures/` go in git.

## Quick start

```bash
cd backend
python -m bench.inventory
python -m pytest tests/test_validators.py tests/test_bench_synthetic_gate.py -q
# After human-reviewed labels exist:
# python -m bench.run_bench --labels data/labels --predictions results/pred.jsonl --fail-under 0.98
```

## Phase E — OCR vs LLM compare (Azure credit)

Classical OCR (Azure Read) does **not** replace GST schema extraction. It answers:
*can we read the characters?* vs *does the vision-LLM win on critical fields?*

```bash
cd backend
# Offline: score existing LLM predictions only
python -m bench.run_ocr_compare --skip-ocr

# Live Azure Read (uses Startups credit — start small)
# set OCR_ENABLED=1
# set AZURE_DI_ENDPOINT=https://<resource>.cognitiveservices.azure.com/
# set AZURE_DI_KEY=...
# optional: set AZURE_DI_MODEL=prebuilt-read   # or prebuilt-layout
python -m bench.run_ocr_compare --limit 5

# Full gold set (auto-loads bench/results/pred.jsonl when present)
python -m bench.run_ocr_compare
# Report → bench/results/ocr_compare.json ; OCR dumps → bench/results/ocr_dumps/
```

Prefer **India region** endpoints for client invoice residency. Do not enable
`OCR_ENABLED=1` in production until Phase B review + consent.

## Phase B — production OCR grounding

When `OCR_ENABLED=1`, scan extraction calls Azure Read on **image/hybrid**
payloads (skips rich native markdown). OCR text feeds field grounding /
confidence; compact word boxes are returned as `Ocr_Words` on the API payload
(for Phase C review UI). Failures are logged and ignored — the LLM path still runs.

```env
OCR_ENABLED=0
OCR_PROVIDER=azure
AZURE_DI_ENDPOINT=https://<resource>.cognitiveservices.azure.com/
AZURE_DI_KEY=...
AZURE_DI_MODEL=prebuilt-read
# OCR_SKIP_IF_TEXT_RICH=1
# OCR_MAX_WORDS=400
```

## Concurrency note

Bench and extraction share process-local caches/semaphores. Production Docker runs multiple uvicorn workers (`WEB_CONCURRENCY`); cache is not shared across workers.
