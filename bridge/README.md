# KhataLens Tally Bridge (Windows)

Local companion that polls KhataLens for Tally export jobs and POSTs XML to
TallyPrime XML Request Server (`http://127.0.0.1:9000` by default).

## Prerequisites

1. TallyPrime open with the correct company
2. Enable **XML Server** (Gateway → F1 / Configure → Connectivity) — port **9000**
3. KhataLens account with a registered bridge device (Settings → Bridge)

## Build (Tauri 2)

```bash
cd bridge/ui
npm install
npm run build

cd ../src-tauri
# Requires Rust + Tauri CLI: cargo install tauri-cli
cargo tauri build
```

Dev:

```bash
cd bridge/ui && npm run dev
# other terminal
cd bridge/src-tauri && cargo tauri dev
```

Installer artifacts land in `src-tauri/target/release/bundle/`.

## Config (stored after setup wizard)

- `api_base` — e.g. `https://api.khatalens.com`
- `device_id` / `device_secret` — OS keychain / local encrypted store
- `tally_host` / `tally_port` — default `127.0.0.1:9000`

## Security

- Never embeds Supabase service role key
- Uses short-lived device tokens (`aud=khatalens-bridge`)
- Revoke devices anytime from web Settings
