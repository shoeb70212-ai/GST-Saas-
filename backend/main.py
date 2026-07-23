import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    yield
    try:
        from http_client import close_shared_client

        await close_shared_client()
    except Exception as e:
        logger.warning("Failed to close shared HTTP client on shutdown: %s", e)


app = FastAPI(title="InvoiceScanner AI Backend", lifespan=_lifespan)

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
from public_routes import router as public_router
from rate_limit import limiter as public_limiter
from whatsapp_routes import router as whatsapp_router
from bank_routes import router as bank_router
from bank_reconcile_routes import router as bank_reconcile_router
from sales_routes import router as sales_router
from tally_routes import router as tally_router
from vendor_memory_routes import router as vendor_memory_router
from support_routes import router as support_router
from itc_risk_routes import router as itc_risk_router
from ims_routes import router as ims_router
from audit_routes import router as audit_router
from bridge_routes import router as bridge_router

app.state.limiter = public_limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Fail fast if public upload HMAC secret is missing (never fall back to service role key).
_testing = bool(os.getenv("PYTEST_CURRENT_TEST")) or os.getenv("TESTING", "").lower() in (
    "1",
    "true",
    "yes",
)
if not _testing:
    from public_upload_tokens import assert_public_upload_token_secret_configured

    try:
        assert_public_upload_token_secret_configured()
    except RuntimeError:
        logger.error(
            "PUBLIC_UPLOAD_TOKEN_SECRET is required. "
            "Generate a dedicated random secret; do not reuse SUPABASE_SERVICE_ROLE_KEY."
        )
        raise

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
app.include_router(vendor_memory_router, prefix="/api", tags=["vendor-memory"])
app.include_router(support_router, prefix="/api", tags=["support"])
app.include_router(itc_risk_router, prefix="/api", tags=["itc-risk"])
app.include_router(ims_router, prefix="/api", tags=["ims"])
app.include_router(audit_router, prefix="/api", tags=["audit"])
app.include_router(bridge_router, prefix="/api", tags=["bridge"])
