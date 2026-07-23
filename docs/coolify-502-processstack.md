# Coolify: processstack.online 502 Bad Gateway

## Three different “port 8000”s (do not mix them)

| What | Port | Meaning |
|------|------|---------|
| **Azure NSG `Allow-Coolify-Temp`** | Host **8000** | Coolify **dashboard** only |
| **Backend container** | Container **8000** | FastAPI / uvicorn listen address |
| **Coolify domain field** `https://back.processstack.online:8000` | Suffix **:8000** | Tells Traefik which *container* port to use — **not** “open API on public 8000” |

Public app traffic is **443 (HTTPS)** → Traefik → containers on the Docker network.  
NSG only needs **22 / 80 / 443** for the site. Host 8000 staying open for Coolify UI is fine; the API must **not** bind host `:8000` (that fights Coolify).

## What we measured

| URL | Result |
|-----|--------|
| `https://processstack.online/` | 200 (frontend) |
| `https://processstack.online/api/` | **502** (nginx → backend unreachable) |
| `https://back.processstack.online/` | **502** |
| Coolify status | **Running (Unknown)** |

Not a Tally Converter bug — proxy cannot reach the API container.

## Fix in Coolify UI

1. **Domains** (port suffix = container port for Traefik):

| Service | Domain field |
|---------|----------------|
| **frontend** | `https://processstack.online:80` |
| **backend** | `https://back.processstack.online:8000` |

Browsers still use `https://processstack.online` / `https://back.processstack.online` (no port typed).

2. Env: keep `PUBLIC_UPLOAD_TOKEN_SECRET`, Supabase keys, etc.  
3. **Redeploy** after latest `docker-compose.yml` (`expose` only — no host `ports: 8000`).

## Verify

```bash
curl -sS https://back.processstack.online/
# {"status":"InvoiceScanner Backend is running."}

curl -sS https://processstack.online/api/
# same JSON
```

Status should become **Running (healthy)**.

## Compose intent

- `expose: "8000"` / `"80"` → visible to Traefik + sibling containers only  
- No `ports: "8000"` on the host → no clash with Coolify UI on NSG 8000  
- Healthcheck hits `127.0.0.1:8000` *inside* the backend container  

## khatalens.com (Render)

Separate stack; this Coolify/NSG note does not apply there.
