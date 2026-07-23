# Coolify recovery — processstack.online

## Two bugs that caused 8–10x restarts + 503

### 1. Domain typo in Coolify (screenshot)

You had:

```text
https://processtask.online:80
```

Must be:

```text
https://processstack.online:80
```

(`stack` not `task`)

| Field | Value |
|-------|--------|
| Domains for **backend** | *(empty)* |
| Domains for **frontend** | `https://processstack.online:80` |

### 2. Backend crash on boot (Razorpay)

With `ENVIRONMENT=production` and a real `RAZORPAY_KEY_ID`, missing/mismatched  
`RAZORPAY_WEBHOOK_SECRET` used to **raise at import** → uvicorn dies → Coolify restart loop.

Fixed on `main`: log error instead of crash; site/API still start.

Optional: set a real `RAZORPAY_WEBHOOK_SECRET` in Coolify Environment (different from KEY_SECRET).

---

## After pull + Redeploy

1. Fix domain spelling → `processstack.online:80`
2. Clear backend domain
3. **Redeploy** latest `main`
4. Wait until **Running** (not Restarting)

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://processstack.online/
# 200

curl -sS https://processstack.online/api/
# {"status":"InvoiceScanner Backend is running."}
```

If still restarting → **Logs** → paste backend traceback.
