# Coolify recovery — processstack.online broken (503 / no available server)

## What “no available server” means

Traefik (Coolify proxy) has **no running container** on the route for `processstack.online`.  
The app code is fine — routing / deploy config is wrong or containers crashed.

## Fix in Coolify (do exactly this)

### 1. Domains — ONE public domain only

| Service | Domain field |
|---------|----------------|
| **frontend** | `https://processstack.online:80` |
| **backend** | **leave empty** (no public domain) |

Remove `back.processstack.online` from backend if set.  
API is served at `https://processstack.online/api/` via nginx → internal `backend:8000`.

The `:80` suffix is **required** in Coolify (tells Traefik the container port).

### 2. Compose path

- Base directory: `/`
- Docker Compose location: `./docker-compose.yml`

### 3. Environment (Coolify → Environment)

Minimum required:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_UPLOAD_TOKEN_SECRET`
- `OPENROUTER_API_KEY` (or your AI keys)

### 4. Redeploy

1. Pull latest `main` (commit with full non-empty `docker-compose.yml`)
2. **Redeploy**
3. Open **Logs** tab → both containers must show **Running**
4. If backend logs show Python traceback → paste it (env missing)

### 5. Verify

```bash
curl -sS https://processstack.online/
# HTML (200)

curl -sS https://processstack.online/api/
# {"status":"InvoiceScanner Backend is running."}
```

## Ports reference

| Port | Use |
|------|-----|
| NSG 443 | HTTPS (Traefik) — keep open |
| NSG 80 | HTTP redirect — keep open |
| NSG 8000 | Coolify UI only — not the app |
| Container 80 | Frontend nginx (public) |
| Container 8000 | FastAPI (internal Docker network only) |

## If deploy still fails

SSH to VM (or Coolify terminal):

```bash
docker ps -a | grep ij1wky   # or your resource id
docker logs <backend-container-name> --tail 100
docker logs <frontend-container-name> --tail 50
```

Common backend crash: missing `PUBLIC_UPLOAD_TOKEN_SECRET` or Supabase keys in Coolify env (not just local `.env`).

## khatalens.com (Render)

Separate deploy — fix Coolify first; Render needs its own `VITE_API_URL` or nginx proxy setup.
