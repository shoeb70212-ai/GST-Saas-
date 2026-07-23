# KhataLens Tally Bridge

Local Windows companion that pushes TallyPrime XML from the cloud to `http://127.0.0.1:9000`. The cloud **never** dials Tally; Download XML remains the offline fallback.

## Architecture

1. Web **Push to Tally** → FastAPI builds XML (existing `tally_export`) → inserts `tally_export_jobs` (`queued`)
2. Bridge polls `GET /api/bridge/jobs/next` with a short-lived device JWT
3. Bridge `POST`s XML to Tally Request Server → reports `pushed` / `failed`

See also: [cross-platform-apps-strategy.md](./cross-platform-apps-strategy.md) (Bridge companion vs full app shell).

## Setup (CA or client PC)

### 1. TallyPrime

1. Open the target company
2. Enable **XML / Request Server** (Gateway of Tally → Configure → Connectivity) — default port **9000**
3. Leave Tally running while pushing

### 2. Register a bridge device (web)

1. Settings → **Tally Bridge**
2. Label the PC (e.g. “Office PC”) → **Register**
3. Copy `device_id` + `device_secret` **once** (secret is not shown again)
4. Download the Windows installer (releases link / `VITE_BRIDGE_DOWNLOAD_URL`)

### 3. Bridge app

1. Install and open **KhataLens Tally Bridge**
2. Paste API base URL, device id, secret; confirm Tally host/port
3. **Save & start polling** — tray / status should show Idle or Pushing

### 4. Push from web

- **Saved Invoices** → **Push to Tally** (primary); **Download XML** (fallback)
- **Tally Converter** → same pattern

Within ~10s (poll every 5s) the voucher should appear in Tally if XML Server is up.

## Security

| Rule | Detail |
|------|--------|
| Device secret | Shown once; hashed server-side; keep in OS credential store on the PC |
| Device JWT | `aud=khatalens-bridge`; user JWTs rejected on `/bridge/jobs/*` |
| Revoke | Settings → Bridge → revoke; org admin can revoke org devices |
| Allowlist | Optional `client_id_allowlist` for client-installed bridges |
| Loopback | Prefer `127.0.0.1`; warn if pointing at a LAN IP |
| Credits | Bridge push is rules/XML only — **no extra LLM credits** |

Env (API): `BRIDGE_JWT_SECRET` (or fallback `PUBLIC_UPLOAD_TOKEN_SECRET`).

## Idempotency

Jobs carry a `fingerprint` (normalized voucher nos + dates + amounts). Re-push of the same payload returns the existing job when already queued/pushed — no duplicate queue.

## Voucher-type E2E checklist

Reuse existing exporter coverage; verify each path with Bridge **and** Download XML:

| Type | Source in product | Bridge smoke |
|------|-------------------|--------------|
| Purchase invoices | Saved Invoices → Push | Company open; voucher in day book |
| Sales register | Tally Converter (`sales`) | Sales voucher created |
| Purchase register | Tally Converter (`purchase`) | Purchase voucher created |
| Bank statement | Tally Converter (`bank`) | Receipt/payment vouchers |
| Journal | Tally Converter (`journal`) | Journal vouchers |
| Masters (ledgers) | `include_masters: true` on job | New ledgers appear if missing |

Also verify:

- [ ] Revoked device cannot claim jobs
- [ ] Bridge offline → Download XML still works
- [ ] Same fingerprint does not create a second `queued` job
- [ ] Tally unreachable → job `failed` with response/error visible on job status

## Dev / build

```bash
cd bridge/ui && npm install && npm run build
cd ../src-tauri && cargo tauri build   # Windows MSI/NSIS under target/release/bundle
```

Backend: `migration_phase77_tally_bridge.sql`, `bridge_auth.py`, `bridge_routes.py`.
Tests: `backend/tests/test_bridge_auth.py`, `test_bridge_routes.py`.

## Out of scope

Two-way sync (Tally → KhataLens), cloud-hosted Tally, Capacitor mobile bridge, replacing TallyPartner APIs.
