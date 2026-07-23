# Coolify recovery — processstack.online

## Your screenshot (wrong)

| Field | What you have | What it must be |
|-------|----------------|-----------------|
| **Domains for backend** | `https://back.processstack.online:80` | **EMPTY** (clear it) |
| **Domains for frontend** | *(empty)* | `https://processstack.online:80` |

### Why it crash-loops (10x restarts)

Coolify health-checks the port in the **domain suffix**.

- Domain says `:80` → Traefik/healthcheck hits container port **80**
- Backend listens on **8000** only → connection refused → unhealthy → restart → **10/10 stop**

Also: with frontend domain empty, `processstack.online` has **no server** → “no available server” / 503.

---

## Fix in Coolify UI (2 minutes)

1. **Configuration → Domains**
   - **Domains for backend:** delete everything (leave blank)
   - **Domains for frontend:** paste exactly:
     ```
     https://processstack.online:80
     ```
2. Click **Save** (if shown)
3. Click **Deploy** / **Redeploy**
4. Wait until status is **Running** (not Failed / Exited)

API URL (no separate backend domain):

- Site: `https://processstack.online`
- API: `https://processstack.online/api/`

---

## If you still want a public API subdomain

Only then set backend domain to:

```
https://back.processstack.online:8000
```

(`:8000` = container port, required). Prefer the blank-backend setup above.

---

## After deploy — check Logs

Open **Logs** (yellow warning icon):

- Frontend should stay up (nginx)
- Backend should show uvicorn listening on `0.0.0.0:8000`

If backend still exits, look for missing Coolify **Environment** vars:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_UPLOAD_TOKEN_SECRET`

Paste the backend traceback if it still restarts.

---

## Verify

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://processstack.online/
# 200

curl -sS https://processstack.online/api/
# {"status":"InvoiceScanner Backend is running."}
```

## Compose note

`Docker Compose Location: /docker-compose.yml` is fine.  
Backend uses `expose: "8000"` (internal). Frontend uses `ports: "80"` (public via Traefik).
