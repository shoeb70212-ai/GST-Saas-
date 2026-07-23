# Coolify: processstack.online 502 Bad Gateway

## What we measured

| URL | Result |
|-----|--------|
| `https://processstack.online/` | 200 (frontend nginx) |
| `https://processstack.online/api/` | **502** (frontend nginx → backend unreachable) |
| `https://back.processstack.online/` | **502** |
| Coolify status | **Running (Unknown)** |

So this is **not** a Tally Converter bug. The API container is not reachable on the proxy port Coolify expects.

## Fix in Coolify UI (required)

Coolify sets Traefik’s `loadbalancer.server.port` from the **port suffix on the domain**.

1. Open the compose app → **Configuration** → Domains  
2. Set exactly:

| Service | Domain field |
|---------|----------------|
| **frontend** | `https://processstack.online:80` |
| **backend** | `https://back.processstack.online:8000` |

The `:80` / `:8000` are **not** typed in the browser; they only tell Coolify which container port to route to. Public URLs stay `https://processstack.online` and `https://back.processstack.online`.

3. Confirm **Environment** still has `PUBLIC_UPLOAD_TOKEN_SECRET`, Supabase keys, etc.  
4. **Redeploy** (Rebuild) after pulling latest `docker-compose.yml` (ports + healthcheck).

## Verify

```bash
curl -sS https://back.processstack.online/
# {"status":"InvoiceScanner Backend is running."}

curl -sS https://processstack.online/api/
# same JSON (nginx proxies to backend:8000)
```

Coolify status should move from **Running (Unknown)** → **Running (healthy)**.

## Repo changes

`docker-compose.yml` now declares `ports`/`expose` for `80` and `8000` plus a backend healthcheck so frontend waits until uvicorn answers on `:8000`.

## khatalens.com (Render)

Separate stack. Same-origin `/api` on Coolify does not apply there; use Render’s backend URL via `VITE_API_URL` if the SPA is served without an nginx `/api` proxy.
