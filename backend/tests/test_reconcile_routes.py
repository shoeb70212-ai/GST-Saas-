"""
Tests for reconciliation endpoints:
  POST /api/reconcile          → reconcile_gstr2b
  POST /api/reconcile/deep-match → deep_match_reconcile

Also tests the clean_str + period_to_date_range helpers in context.
"""
import io
import pandas as pd
from unittest.mock import MagicMock
from fastapi import HTTPException
from fastapi.testclient import TestClient
import sys, os
from contextlib import asynccontextmanager

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")

from main import app
from utils import get_current_user
import pytest

client = TestClient(app)


@pytest.fixture(autouse=True)
def _cleanup_auth_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_gstr2b_excel(records: list[dict] | None = None) -> bytes:
    """
    Build a minimal valid GSTR-2B Excel file with the B2B sheet.
    Header row must contain 'GSTIN of supplier' for the parser to find it.
    """
    if records is None:
        records = [{
            "GSTIN of supplier": "27AADCB2230M1Z2",
            "Invoice number": "INV-001",
            "Invoice date": "01-03-2024",
            "Taxable Value": 1000.0,
            "Integrated Tax": 0.0,
            "Central Tax": 90.0,
            "State/UT Tax": 90.0,
            "ITC Availability": "Yes",
        }]

    df = pd.DataFrame(records)
    buf = io.BytesIO()
    df.to_excel(buf, sheet_name="B2B", index=False, engine="openpyxl")
    buf.seek(0)
    return buf.read()


def _make_http_mock(
    user_id: str = "user-123",
    invoices: list = None,
    gstr2b_records: list = None,
    rpc_result: int = 10,
):
    """Mock for the httpx shared client used in reconcile_routes."""
    invoices = invoices or []
    gstr2b_records = gstr2b_records or []

    class FakeResp:
        def __init__(self, status_code, data):
            self.status_code = status_code
            self._data = data

        def json(self):
            return self._data

    class FakeHTTPClient:
        def __init__(self):
            self.posts = []

        async def get(self, url, **kw):
            if "/auth/v1/user" in url:
                return FakeResp(200, {"id": user_id})
            if "invoices?" in url:
                return FakeResp(200, invoices)
            if "gstr2b_records?" in url:
                return FakeResp(200, gstr2b_records)
            return FakeResp(200, [])

        async def delete(self, url, **kw):
            return FakeResp(200, {})

        async def post(self, url, **kw):
            self.posts.append((url, kw.get("json")))
            if "decrement_credits" in url:
                return FakeResp(200, rpc_result)
            if "refund_credits" in url:
                return FakeResp(200, True)
            if "gstr2b_records" in url:
                return FakeResp(201, [])
            if "bulk_update_invoices_recon" in url:
                return FakeResp(200, {})
            return FakeResp(200, {})

        async def patch(self, url, **kw):
            return FakeResp(204, {})

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    return FakeHTTPClient()


def _patch_reconcile_access(monkeypatch, *, allowed: bool = True, mock_http=None, user_id: str = "user-123"):
    """Patch httpx + has_client_access gate used by reconcile routes."""
    import http_client as hc_module
    import reconcile_routes

    if mock_http is None:
        mock_http = _make_http_mock(user_id=user_id)

    @asynccontextmanager
    async def fake_shared(*a, **kw):
        yield mock_http

    async def fake_verify(_sc, _client_id):
        if not allowed:
            raise HTTPException(status_code=403, detail="Access denied: client not found")

    async def fake_auth():
        return {
            "user_id": user_id,
            "supabase_client": MagicMock(),
            "token": "valid.token.here",
        }

    monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
    monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)
    monkeypatch.setattr(reconcile_routes, "verify_client_access", fake_verify)
    app.dependency_overrides[get_current_user] = fake_auth
    return mock_http


# ═══════════════════════════════════════════════════════════════
# POST /api/reconcile  — Authentication
# ═══════════════════════════════════════════════════════════════

class TestReconcileAuth:
    def test_no_auth_returns_401(self):
        buf = _make_gstr2b_excel()
        response = client.post(
            "/api/reconcile",
            files={"file": ("gstr2b.xlsx", io.BytesIO(buf), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "client-abc", "period": "03-2024"},
        )
        assert response.status_code == 401

    def test_missing_bearer_prefix_returns_401(self):
        buf = _make_gstr2b_excel()
        response = client.post(
            "/api/reconcile",
            files={"file": ("gstr2b.xlsx", io.BytesIO(buf), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Token abc123"},
        )
        assert response.status_code == 401


# ═══════════════════════════════════════════════════════════════
# POST /api/reconcile  — Client Access (has_client_access / IDOR)
# ═══════════════════════════════════════════════════════════════

class TestReconcileOwnership:
    def test_outsider_without_has_client_access_returns_403(self, monkeypatch):
        """Outsider denied by has_client_access → 403 (not clients.user_id)."""
        _patch_reconcile_access(monkeypatch, allowed=False)

        buf = _make_gstr2b_excel()
        response = client.post(
            "/api/reconcile",
            files={"file": ("gstr2b.xlsx", io.BytesIO(buf), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "other-users-client", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 403

    def test_org_teammate_with_has_client_access_can_reconcile(self, monkeypatch):
        """Org teammate (not clients.user_id) may reconcile when RPC allows."""
        invoices = [
            {
                "id": "inv-1",
                "supplier_gstin": "27AADCB2230M1Z2",
                "invoice_number": "INV-001",
                "taxable_amount": 1000.0,
                "total_amount": 1180.0,
                "recon_status": "unreconciled",
                "recon_period": None,
            }
        ]
        mock_http = _make_http_mock(user_id="teammate-456", invoices=invoices)
        _patch_reconcile_access(monkeypatch, allowed=True, mock_http=mock_http, user_id="teammate-456")

        buf = _make_gstr2b_excel()
        response = client.post(
            "/api/reconcile",
            files={"file": ("gstr2b.xlsx", io.BytesIO(buf), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "client-abc", "period": "03-2024", "tolerance": "1.0"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"


# ═══════════════════════════════════════════════════════════════
# POST /api/reconcile  — File validation
# ═══════════════════════════════════════════════════════════════

class TestReconcileFileValidation:
    def test_corrupt_excel_returns_400(self, monkeypatch):
        """A non-Excel file submitted as GSTR-2B should return 400."""
        _patch_reconcile_access(monkeypatch, allowed=True)

        garbage = b"THIS IS NOT AN EXCEL FILE AT ALL"
        response = client.post(
            "/api/reconcile",
            files={"file": ("bad.xlsx", io.BytesIO(garbage), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 400

    def test_empty_file_returns_400(self, monkeypatch):
        """Empty file with no sheets should not crash the server."""
        _patch_reconcile_access(monkeypatch, allowed=True)

        response = client.post(
            "/api/reconcile",
            files={"file": ("empty.xlsx", io.BytesIO(b""), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 400


# ═══════════════════════════════════════════════════════════════
# POST /api/reconcile  — Tolerance validation
# ═══════════════════════════════════════════════════════════════

class TestReconcileTolerance:
    def test_nan_tolerance_does_not_crash(self, monkeypatch):
        """
        tolerance=NaN should be rejected or handled gracefully.
        Must NOT return 500 (unhandled exception).
        """
        _patch_reconcile_access(monkeypatch, allowed=True)

        buf = _make_gstr2b_excel()
        response = client.post(
            "/api/reconcile",
            files={"file": ("g.xlsx", io.BytesIO(buf), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "client-abc", "period": "03-2024", "tolerance": "NaN"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        # Should be 400 (validation) or 200 (if NaN silently accepted)
        # Must NOT be 500
        assert response.status_code != 500

    def test_negative_tolerance_handled(self, monkeypatch):
        """tolerance=-1 should be validated or handled without crashing."""
        _patch_reconcile_access(monkeypatch, allowed=True)

        buf = _make_gstr2b_excel()
        response = client.post(
            "/api/reconcile",
            files={"file": ("g.xlsx", io.BytesIO(buf), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "client-abc", "period": "03-2024", "tolerance": "-1"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code != 500


# ═══════════════════════════════════════════════════════════════
# POST /api/reconcile  — Successful reconciliation
# ═══════════════════════════════════════════════════════════════

class TestReconcileSuccess:
    def test_successful_reconcile_returns_200(self, monkeypatch):
        invoices = [
            {
                "id": "inv-1",
                "supplier_gstin": "27AADCB2230M1Z2",
                "invoice_number": "INV-001",
                "taxable_amount": 1000.0,
                "total_amount": 1180.0,
                "recon_status": "unreconciled",
                "recon_period": None,
            }
        ]
        mock_http = _make_http_mock(invoices=invoices)
        _patch_reconcile_access(monkeypatch, allowed=True, mock_http=mock_http)

        buf = _make_gstr2b_excel()
        response = client.post(
            "/api/reconcile",
            files={"file": ("gstr2b.xlsx", io.BytesIO(buf), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "client-abc", "period": "03-2024", "tolerance": "1.0"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "message" in data

    def test_reconcile_response_includes_record_count(self, monkeypatch):
        _patch_reconcile_access(monkeypatch, allowed=True)

        buf = _make_gstr2b_excel()
        response = client.post(
            "/api/reconcile",
            files={"file": ("gstr2b.xlsx", io.BytesIO(buf), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        if response.status_code == 200:
            msg = response.json()["message"]
            # Message should mention number of records reconciled
            assert any(char.isdigit() for char in msg)


# ═══════════════════════════════════════════════════════════════
# POST /api/reconcile/deep-match — Auth & credit deduction
# ═══════════════════════════════════════════════════════════════

class TestDeepMatchAuth:
    def test_no_auth_returns_401(self):
        response = client.post(
            "/api/reconcile/deep-match",
            data={"client_id": "client-abc", "period": "03-2024"},
        )
        assert response.status_code == 401

    def test_outsider_without_has_client_access_returns_403(self, monkeypatch):
        _patch_reconcile_access(monkeypatch, allowed=False)

        response = client.post(
            "/api/reconcile/deep-match",
            data={"client_id": "other-users-client", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 403

    def test_org_teammate_with_has_client_access_can_deep_match(self, monkeypatch):
        """Teammate allowed by has_client_access; no unmatched → early success."""
        invoices = [
            {
                "id": "inv-1",
                "supplier_name": "Test Supplier",
                "supplier_gstin": "27TEST1234M1Z2",
                "invoice_number": "INV-001",
                "invoice_date": "2024-03-01",
                "taxable_amount": 1000.0,
                "total_amount": 1180.0,
                "recon_status": "matched",
            }
        ]
        mock_http = _make_http_mock(user_id="teammate-456", invoices=invoices)
        _patch_reconcile_access(monkeypatch, allowed=True, mock_http=mock_http)

        response = client.post(
            "/api/reconcile/deep-match",
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 200
        assert "No unmatched" in response.json()["message"]

    def test_rules_engine_does_not_require_credits(self, monkeypatch):
        """Smart Match is free (rules) — unmatched PR+2B still returns 200 without 402."""
        invoices = [
            {
                "id": "inv-1",
                "supplier_name": "Test Supplier",
                "supplier_gstin": "27TEST1234M1Z2",
                "invoice_number": "INV-001",
                "invoice_date": "2024-03-01",
                "taxable_amount": 1000.0,
                "total_amount": 1180.0,
                "recon_status": "missing_in_2b",
            }
        ]
        gstr2b = [
            {
                "id": "b2b-1",
                "supplier_gstin": "27TEST1234M1Z2",
                "invoice_number": "INV001",
                "invoice_date": "2024-03-01",
                "taxable_value": 1000.0,
            }
        ]
        mock_http = _make_http_mock(
            invoices=invoices,
            gstr2b_records=gstr2b,
            rpc_result=-1,
        )
        _patch_reconcile_access(monkeypatch, allowed=True, mock_http=mock_http)

        response = client.post(
            "/api/reconcile/deep-match",
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body.get("engine") == "rules"
        deduct_posts = [
            (url, body) for url, body in mock_http.posts if "decrement_credits" in url
        ]
        assert deduct_posts == []

    def test_no_unmatched_invoices_returns_success_no_ai_call(self, monkeypatch):
        """
        If all invoices are already matched, deep-match returns success immediately
        without calling the AI or deducting credits.
        """
        invoices = [
            {
                "id": "inv-1",
                "supplier_name": "Test Supplier",
                "supplier_gstin": "27TEST1234M1Z2",
                "invoice_number": "INV-001",
                "invoice_date": "2024-03-01",
                "taxable_amount": 1000.0,
                "total_amount": 1180.0,
                "recon_status": "matched",
            }
        ]
        mock_http = _make_http_mock(invoices=invoices)
        _patch_reconcile_access(monkeypatch, allowed=True, mock_http=mock_http)

        response = client.post(
            "/api/reconcile/deep-match",
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 200
        assert "No unmatched" in response.json()["message"]
        assert response.json().get("engine") == "rules"


# ═══════════════════════════════════════════════════════════════
# Deep Match rules engine (replaces Gemini credit path)
# ═══════════════════════════════════════════════════════════════

def _deep_match_unmatched_fixtures():
    invoices = [
        {
            "id": "inv-1",
            "supplier_name": "Test Supplier",
            "supplier_gstin": "27TEST1234M1Z2",
            "invoice_number": "INV-001",
            "invoice_date": "2024-03-01",
            "taxable_amount": 1000.0,
            "total_amount": 1180.0,
            "recon_status": "missing_in_2b",
        }
    ]
    gstr2b = [
        {
            "id": "b2b-1",
            "supplier_gstin": "27TEST1234M1Z2",
            "invoice_number": "INV001",
            "invoice_date": "2024-03-01",
            "taxable_value": 1000.0,
        }
    ]
    return invoices, gstr2b


class TestDeepMatchRules:
    def test_rules_match_without_gemini_or_credits(self, monkeypatch):
        """Deterministic Smart Match finds pairs; no Gemini, no credit RPCs."""
        invoices, gstr2b = _deep_match_unmatched_fixtures()
        mock_http = _make_http_mock(
            invoices=invoices,
            gstr2b_records=gstr2b,
            rpc_result=10,
        )
        _patch_reconcile_access(monkeypatch, allowed=True, mock_http=mock_http)

        response = client.post(
            "/api/reconcile/deep-match",
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["engine"] == "rules"
        assert len(body.get("matches") or []) >= 1
        assert not any("decrement_credits" in url for url, _ in mock_http.posts)
        assert not any("refund_credits" in url for url, _ in mock_http.posts)
        assert any("bulk_update_invoices_recon" in url for url, _ in mock_http.posts)

    def test_no_unmatched_2b_returns_success(self, monkeypatch):
        invoices = [
            {
                "id": "inv-1",
                "supplier_name": "Test Supplier",
                "supplier_gstin": "27TEST1234M1Z2",
                "invoice_number": "INV-001",
                "invoice_date": "2024-03-01",
                "taxable_amount": 1000.0,
                "total_amount": 1180.0,
                "recon_status": "missing_in_2b",
            }
        ]
        # Only already-matched 2B key present → unmatched_2b empty after filter
        # (matched invoice list empty so all 2B considered unmatched — use empty 2B)
        mock_http = _make_http_mock(invoices=invoices, gstr2b_records=[])
        _patch_reconcile_access(monkeypatch, allowed=True, mock_http=mock_http)

        response = client.post(
            "/api/reconcile/deep-match",
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 200
        assert "No GSTR-2B" in response.json()["message"]
        assert response.json()["engine"] == "rules"
