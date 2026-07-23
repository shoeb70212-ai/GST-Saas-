# Coolify: processstack.online 502 / unhealthy deploy

## Ports

| Where | Port | Purpose |
|-------|------|---------|
| Azure NSG | **80**, **443** | Public site (Traefik) |
| Azure NSG | **8000** | Coolify **dashboard** only |
| Frontend container | **80** | nginx |
| Backend container | **8000** | FastAPI on Docker network only (`expose`, not host bind) |

Container **8000** ≠ host Coolify **8000**. They do not conflict.

Do **not** run the API on container port 80 — Coolify often lacks bind permission → **unhealthy** → deploy fails (`dependency failed to start`).

## Coolify domain fields

| Service | Domain field |
|---------|----------------|
| **frontend** | `https://processstack.online:80` |
| **backend** | `https://back.processstack.online:8000` |

Public URLs (no port in the browser):

- https://processstack.online  
- https://back.processstack.online  
- API via nginx: https://processstack.online/api/

## If deploy says `backend is unhealthy`

1. Coolify → backend container **Logs** (startup traceback).  
2. Confirm env has `PUBLIC_UPLOAD_TOKEN_SECRET` and Supabase keys.  
3. Redeploy commit that uses container **8000** + soft `depends_on` (no `service_healthy` gate).

## Verify

```bash
curl -sS https://back.processstack.online/
curl -sS https://processstack.online/api/
# both → {"status":"InvoiceScanner Backend is running."}
```
