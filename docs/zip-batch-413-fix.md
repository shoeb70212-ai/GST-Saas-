# ZIP Batch Upload — 413 Payload Too Large

## Symptom
Console: `POST …/api/upload-batch 413`  
UI toast: "Failed to upload ZIP"

Seen on both:
- **khatalens.com** / `gst-saas.onrender.com` (Render)
- **processstack.online** (self-hosted / Coolify, 16 GB RAM)

RAM is **not** the issue. **413 = request body rejected by a reverse proxy** (or backend zip-bomb guard) before/during processing.

## Root cause

| Layer | Limit | Notes |
|-------|-------|--------|
| **Nginx** (frontend container proxies `/api/`) | **Default 1 MB** if unset | Classic cause on `processstack.online` via [docker-compose](../docker-compose.yml) + [frontend/nginx.conf](../frontend/nginx.conf) |
| Backend `upload-batch` | **50 MB uncompressed** of images/PDFs inside ZIP | Returns JSON `detail` about zip bomb |
| Per-file validate | **10 MB** per image/PDF | `utils.validate_file_content` |

UI previously said "Unlimited" — that was wrong.

## Fix shipped in repo

1. `client_max_body_size 100m;` in `frontend/nginx.conf` (server + `/api/`)
2. Clearer toast on 413 / 404
3. Client soft-check ~80 MB compressed ZIP
4. Upload panel copy: max ~50 MB uncompressed

## Deploy steps

### processstack.online (Docker / Coolify)
Rebuild and redeploy the **frontend** image so the new nginx.conf is baked in:

```bash
docker compose build frontend --no-cache
docker compose up -d frontend
```

If Coolify/Traefik sits **in front of** the stack, also raise the proxy body size there (e.g. Coolify: set proxy `client_max_body_size` / Traefik buffering to ≥100MB). Nginx alone is not enough if an outer proxy still uses 1MB.

### khatalens.com (Render)
1. Redeploy **frontend** if it serves via nginx/proxy to the API.
2. If the browser calls `https://gst-saas.onrender.com` **directly**, nginx in this repo does not apply — check:
   - Cloudflare (if orange-clouded): free plan allows large uploads; page rules / WAF rarely cause empty 413
   - Any custom Render reverse proxy
3. Workaround until proxy is fixed: split ZIP into smaller archives (e.g. 20–40 images each).

## Workaround for users (immediate)

1. Unzip locally.
2. Make smaller ZIPs (e.g. 20–30 invoices each, or keep compressed ZIP under ~30–40 MB).
3. Upload each ZIP on **Scan → ZIP Batch**.
4. Prefer **Images / PDFs** tab for a few files.

## Verify after deploy

```bash
# Should NOT return 413 for a ~5MB zip (use a real auth token + client_id)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample.zip" -F "client_id=$CLIENT_ID" \
  https://processstack.online/api/upload-batch
# Expect 200 (or 400/402 for business rules) — not 413
```
