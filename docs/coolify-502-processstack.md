# Coolify: "no available server" / 503

## Cause

Failed deploy left **no running containers**. Traefik then shows **no available server** (503) for `processstack.online`.

Often triggered by a Docker **healthcheck** marking backend unhealthy → compose aborts → frontend never starts.

## Fix (in repo)

- No compose healthcheck
- Frontend does not depend on backend health
- Backend container port **8000** (expose only)
- Frontend container port **80**

## Coolify domains

| Service | Domain field |
|---------|----------------|
| frontend | `https://processstack.online:80` |
| backend | `https://back.processstack.online:8000` |

## Recovery steps

1. Coolify → this app → **Redeploy** (latest `main`)
2. Wait until both **frontend** and **backend** containers show **Running**
3. Open https://processstack.online (hard refresh)
4. If still 503: open **backend Logs** — paste any Python traceback

## Verify

```bash
curl -sS https://processstack.online/
# HTML

curl -sS https://back.processstack.online/
# {"status":"InvoiceScanner Backend is running."}

curl -sS https://processstack.online/api/
# same JSON
```
