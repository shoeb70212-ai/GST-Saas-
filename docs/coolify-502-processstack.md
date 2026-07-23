# Coolify: processstack.online 502 Bad Gateway

## Ports (only these)

| Where | Port | Purpose |
|-------|------|---------|
| Azure NSG | **80**, **443** | Public site (Traefik) |
| Azure NSG | **8000** | Coolify **dashboard** only |
| Frontend container | **80** | nginx |
| Backend container | **80** | FastAPI (was 8000; changed to avoid clashing with Coolify UI mentally/ops) |

No other app ports. Local `uvicorn` on a laptop can still use 8000; production Docker uses **80**.

## Coolify domain fields (both `:80`)

| Service | Domain field |
|---------|----------------|
| **frontend** | `https://processstack.online:80` |
| **backend** | `https://back.processstack.online:80` |

Browsers use `https://…` with no port. The `:80` suffix only tells Traefik the container port.

## Verify after Redeploy

```bash
curl -sS https://back.processstack.online/
# {"status":"InvoiceScanner Backend is running."}

curl -sS https://processstack.online/api/
# same JSON
```

## What 502 meant

Frontend nginx could not reach the API container (wrong Traefik port / unhealthy backend) — not a Tally Converter code bug.

## khatalens.com (Render)

Separate stack; this Coolify port layout does not apply there.
