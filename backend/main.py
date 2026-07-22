import os
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

app = FastAPI(title="InvoiceScanner AI Backend")

# 1. Strict Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"
    return response

# 2. Env-driven CORS (comma-separated CORS_ORIGINS). Never allow "*" with credentials.
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://gst-saas.vercel.app",
    "https://www.khatalens.com",
    "https://khatalens.com",
]


def _parse_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return list(_DEFAULT_CORS_ORIGINS)
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if not origins or "*" in origins:
        logger.warning(
            "CORS_ORIGINS empty or contains '*'; using defaults "
            "(wildcard is incompatible with allow_credentials=True)"
        )
        return list(_DEFAULT_CORS_ORIGINS)
    return origins


ALLOWED_ORIGINS = _parse_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

# Thin re-exports for backward-compatible imports (tests + legacy callers).
# Prefer `from extraction import …` for new code.
from extraction import (  # noqa: E402
    compute_confidence,
    apply_tax_calculations,
    run_ai_extraction,
    InvoiceData,
    LineItem,
    preprocess_invoice_file,
)
from scan_routes import router as scan_router  # noqa: E402

@app.get("/")
def read_root():
    return {"status": "InvoiceScanner Backend is running."}

# from auth_routes import router as auth_router
from admin_routes import router as admin_router
from batch_routes import router as batch_router
from reconcile_routes import router as reconcile_router
from payment_routes import router as payment_router
from public_routes import router as public_router, limiter as public_limiter
from whatsapp_routes import router as whatsapp_router
from bank_routes import router as bank_router
from bank_reconcile_routes import router as bank_reconcile_router
from sales_routes import router as sales_router
from tally_routes import router as tally_router

app.state.limiter = public_limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(scan_router, prefix="/api", tags=["scan"])
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(batch_router, prefix="/api", tags=["batch"])
app.include_router(reconcile_router, prefix="/api/reconcile", tags=["reconcile"])
app.include_router(payment_router, prefix="/api", tags=["payments"])
app.include_router(public_router, prefix="/api/public", tags=["public"])
app.include_router(whatsapp_router, prefix="/api/whatsapp", tags=["whatsapp"])
app.include_router(bank_router, prefix="/api/bank-statements", tags=["bank-statements"])
app.include_router(bank_reconcile_router, prefix="/api/bank-reconcile", tags=["bank-reconcile"])
app.include_router(sales_router, prefix="/api/sales", tags=["sales"])
app.include_router(tally_router, prefix="/api", tags=["tally"])
