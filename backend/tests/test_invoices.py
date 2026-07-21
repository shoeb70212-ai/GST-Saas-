"""
Tests for POST /api/scan-invoice.

Strategy:
  - Auth uses Depends(get_current_user); tests override the dependency.
  - Profile / org credits / credit deduction still use get_shared_client (httpx).
  - We patch scan_routes.run_ai_extraction to avoid real LLM calls.
  - We patch gstin_service.verify_gstin to avoid external GSTIN API.
"""
import io
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from contextlib import asynccontextmanager
from fastapi.testclient import TestClient
import sys, os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app
from utils import get_current_user

# ── Helpers ───────────────────────────────────────────────────────────────────

MINIMAL_JPEG = (
    b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00'
    b'\xff\xdb\x00C\x00' + b'\x08' * 64 +
    b'\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00'
    b'\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    b'\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    b'\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9'
)

GOOD_EXTRACTED = {
    "Supplier_Name": "ACME Pvt Ltd",
    "Supplier_GSTIN": "27AADCB2230M1Z2",
    "Buyer_GSTIN": "27AADCB1234M1Z1",
    "Invoice_Number": "INV-001",
    "Invoice_Date": "01-01-2024",
    "Total_Amount": 1180.0,
    "Taxable_Amount": 1000.0,
    "CGST_Amount": 90.0,
    "SGST_Amount": 90.0,
    "IGST_Amount": 0.0,
    "Cess_Amount": None,
    "Round_Off": None,
    "Confidence_Score": 96.0,
    "Extraction_State": "auto_accepted",
    "Line_Items": [],
}


def _make_resp(status: int, body):
    """Build a mock httpx Response."""
    r = MagicMock()
    r.status_code = status
    r.json = MagicMock(return_value=body)
    r.text = json.dumps(body)
    return r


# ── Core fixture ─────────────────────────────────────────────────────────────

@pytest.fixture()
def test_client():
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


class _FakeHTTPClient:
    """
    Fake httpx async client. Routes GET/POST to URL-keyed responses.
    All fields are mutable so tests can override per-call.
    """
    def __init__(self, overrides: dict | None = None):
        self._overrides = overrides or {}

    def _defaults(self, url: str):
        if "/auth/v1/user" in url:
            return _make_resp(200, {"id": "user-abc-123"})
        if "profiles?" in url:
            return _make_resp(200, [{"active_org_id": "org-xyz", "tally_ledgers": None}])
        if "organizations?" in url:
            return _make_resp(200, [{"credits": 50}])
        if "decrement_credits" in url:
            return _make_resp(200, 49)
        if "refund_credits" in url:
            return _make_resp(200, 1)
        if "clients?" in url:
            return _make_resp(200, [{"id": "client-abc"}])
        return _make_resp(200, {})

    async def get(self, url, **kw):
        for pattern, resp in self._overrides.items():
            if pattern in url:
                return resp
        return self._defaults(url)

    async def post(self, url, **kw):
        for pattern, resp in self._overrides.items():
            if pattern in url:
                return resp
        return self._defaults(url)

    async def __aenter__(self): return self
    async def __aexit__(self, *a): pass


def _auth_override(user_id: str = "user-abc-123", token: str = "valid.token"):
    async def _fake():
        return {
            "user_id": user_id,
            "supabase_client": AsyncMock(),
            "token": token,
        }
    return _fake


def _make_patched_scan(
    overrides: dict | None = None,
    ai_result=None,
    gstin_status: str = "Active",
):
    """
    Returns a context manager that patches all external dependencies
    of scan_invoice with controlled fakes.
    """
    import http_client as hc_mod
    import scan_routes as scan_mod

    if ai_result is None:
        ai_result = (GOOD_EXTRACTED.copy(), 350)

    fake_http = _FakeHTTPClient(overrides)

    @asynccontextmanager
    async def fake_shared(*a, **kw):
        yield fake_http

    class _Ctx:
        def __enter__(self_inner):
            app.dependency_overrides[get_current_user] = _auth_override()
            self_inner._p1 = patch.object(hc_mod, "get_shared_client", fake_shared)
            self_inner._p2 = patch.object(scan_mod, "get_shared_client", fake_shared)
            self_inner._p3 = patch.object(scan_mod, "run_ai_extraction", new_callable=AsyncMock)
            self_inner._p4 = patch("gstin_service.verify_gstin", new_callable=AsyncMock)

            self_inner._p1.start()
            self_inner._p2.start()
            mock_ai = self_inner._p3.start()
            mock_gstin = self_inner._p4.start()

            mock_ai.return_value = ai_result
            mock_gstin.return_value = gstin_status

            self_inner.mock_ai = mock_ai
            return self_inner

        def __exit__(self_inner, *a):
            self_inner._p4.stop()
            self_inner._p3.stop()
            self_inner._p2.stop()
            self_inner._p1.stop()
            app.dependency_overrides.pop(get_current_user, None)

    return _Ctx()


# ═══════════════════════════════════════════════════════════════
# Authentication
# ═══════════════════════════════════════════════════════════════

class TestScanInvoiceAuth:
    def test_no_authorization_header_returns_401(self, test_client):
        r = test_client.post(
            "/api/scan-invoice",
            files={"file": ("t.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert r.status_code == 401
        assert "unauthorized" in r.json()["detail"].lower()

    def test_malformed_bearer_returns_401(self, test_client):
        r = test_client.post(
            "/api/scan-invoice",
            files={"file": ("t.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
            headers={"Authorization": "notbearer token"},
        )
        assert r.status_code == 401

    def test_bearer_prefix_without_token_is_rejected(self, test_client):
        """'Bearer ' with only whitespace after must be rejected."""
        r = test_client.post(
            "/api/scan-invoice",
            files={"file": ("t.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
            headers={"Authorization": "Bearer "},
        )
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════
# File Validation
# ═══════════════════════════════════════════════════════════════

class TestScanInvoiceFileValidation:
    def test_text_file_returns_400(self, test_client):
        """A .txt file fails magic-byte validation after auth."""
        with _make_patched_scan():
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.txt", io.BytesIO(b"plain text"), "text/plain")},
                headers={"Authorization": "Bearer valid.token"},
            )
        assert r.status_code == 400

    def test_file_exceeding_10mb_returns_413(self, test_client):
        big = b'\xff\xd8\xff' + b'\x00' * (10 * 1024 * 1024 + 1)
        with _make_patched_scan():
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("big.jpg", io.BytesIO(big), "image/jpeg")},
                headers={"Authorization": "Bearer valid.token"},
            )
        assert r.status_code == 413

    def test_png_file_passes_validation(self, test_client):
        png = b'\x89PNG\r\n\x1a\n' + b'\x00' * 50
        with _make_patched_scan():
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.png", io.BytesIO(png), "image/png")},
                headers={"Authorization": "Bearer valid.token"},
            )
        assert r.status_code not in (400, 413)

    def test_pdf_magic_bytes_pass_validation(self, test_client):
        pdf = b'%PDF-1.4\nfake content'
        with _make_patched_scan():
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.pdf", io.BytesIO(pdf), "application/pdf")},
                headers={"Authorization": "Bearer valid.token"},
            )
        assert r.status_code not in (400, 413)


# ═══════════════════════════════════════════════════════════════
# Credit Enforcement
# ═══════════════════════════════════════════════════════════════

class TestScanInvoiceCredits:
    def test_zero_credits_returns_402(self, test_client):
        zero_org = _make_resp(200, [{"credits": 0}])
        with _make_patched_scan(overrides={"organizations?": zero_org}) as ctx:
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
                headers={"Authorization": "Bearer valid.token"},
            )
            assert r.status_code == 402
            assert "insufficient" in r.json()["detail"].lower()
            ctx.mock_ai.assert_not_called()

    def test_negative_credits_returns_402(self, test_client):
        neg_org = _make_resp(200, [{"credits": -3}])
        with _make_patched_scan(overrides={"organizations?": neg_org}):
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
                headers={"Authorization": "Bearer valid.token"},
            )
        assert r.status_code == 402

    def test_rpc_returns_minus1_returns_402(self, test_client):
        minus1_rpc = _make_resp(200, -1)
        with _make_patched_scan(overrides={"decrement_credits": minus1_rpc}):
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
                headers={"Authorization": "Bearer valid.token"},
            )
        assert r.status_code == 402

    def test_invalid_session_returns_401(self, test_client):
        from fastapi import HTTPException

        async def reject():
            raise HTTPException(status_code=401, detail="Unauthorized: Invalid session token")

        app.dependency_overrides[get_current_user] = reject
        try:
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
                headers={"Authorization": "Bearer expired.token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════
# Successful Extraction
# ═══════════════════════════════════════════════════════════════

class TestScanInvoiceSuccess:
    def test_returns_200_with_data(self, test_client):
        with _make_patched_scan():
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
                headers={"Authorization": "Bearer valid.token"},
            )
        assert r.status_code == 200
        assert r.json()["status"] == "success"
        assert "data" in r.json()

    def test_supplier_name_in_response(self, test_client):
        with _make_patched_scan():
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
                headers={"Authorization": "Bearer valid.token"},
            )
        assert r.json()["data"]["Supplier_Name"] == "ACME Pvt Ltd"

    def test_confidence_score_is_numeric(self, test_client):
        with _make_patched_scan():
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
                headers={"Authorization": "Bearer valid.token"},
            )
        score = r.json()["data"]["Confidence_Score"]
        assert isinstance(score, (int, float))

    def test_extraction_state_is_valid(self, test_client):
        with _make_patched_scan():
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
                headers={"Authorization": "Bearer valid.token"},
            )
        state = r.json()["data"]["Extraction_State"]
        assert state in ("auto_accepted", "needs_review", "needs_retry", "duplicate_warning")

    def test_ai_failure_returns_500(self, test_client):
        with _make_patched_scan(ai_result=Exception("timeout")) as ctx:
            ctx.mock_ai.side_effect = Exception("timeout")
            r = test_client.post(
                "/api/scan-invoice",
                files={"file": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
                headers={"Authorization": "Bearer valid.token"},
            )
        assert r.status_code == 500
