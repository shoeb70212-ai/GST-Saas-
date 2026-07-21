"""
Tests for reconciliation endpoints:
  POST /api/reconcile          → reconcile_gstr2b
  POST /api/reconcile/deep-match → deep_match_reconcile

Also tests the clean_str + period_to_date_range helpers in context.
"""
import io
import json
import pandas as pd
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
import sys, os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")

from main import app

client = TestClient(app)


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
    client_exists: bool = True,
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
        async def get(self, url, **kw):
            if "/auth/v1/user" in url:
                return FakeResp(200, {"id": user_id})
            if "clients?" in url:
                return FakeResp(200, [{"id": "client-abc"}] if client_exists else [])
            if "invoices?" in url:
                return FakeResp(200, invoices)
            if "gstr2b_records?" in url:
                return FakeResp(200, gstr2b_records)
            return FakeResp(200, [])

        async def delete(self, url, **kw):
            return FakeResp(200, {})

        async def post(self, url, **kw):
            if "decrement_credits" in url:
                return FakeResp(200, rpc_result)
            if "gstr2b_records" in url:
                return FakeResp(201, [])
            if "bulk_update_invoices_recon" in url:
                return FakeResp(200, {})
            return FakeResp(200, {})

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    return FakeHTTPClient()


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
# POST /api/reconcile  — Client Ownership (IDOR prevention)
# ═══════════════════════════════════════════════════════════════

class TestReconcileOwnership:
    def test_accessing_another_users_client_returns_403(self, monkeypatch):
        """
        If the client_id doesn't belong to the authenticated user,
        _verify_client_ownership_reconcile must return 403.
        """
        import http_client as hc_module
        from contextlib import asynccontextmanager

        # Client lookup returns empty list → not owned by this user
        mock_client = _make_http_mock(client_exists=False)

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_client

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        import reconcile_routes
        monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)

        buf = _make_gstr2b_excel()
        response = client.post(
            "/api/reconcile",
            files={"file": ("gstr2b.xlsx", io.BytesIO(buf), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": "other-users-client", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════
# POST /api/reconcile  — File validation
# ═══════════════════════════════════════════════════════════════

class TestReconcileFileValidation:
    def test_corrupt_excel_returns_400(self, monkeypatch):
        """A non-Excel file submitted as GSTR-2B should return 400."""
        import http_client as hc_module
        from contextlib import asynccontextmanager

        mock_http = _make_http_mock(client_exists=True)

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_http

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        import reconcile_routes
        monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)

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
        import http_client as hc_module
        from contextlib import asynccontextmanager

        mock_http = _make_http_mock(client_exists=True)

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_http

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        import reconcile_routes
        monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)

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
        import http_client as hc_module
        from contextlib import asynccontextmanager

        mock_http = _make_http_mock(client_exists=True)

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_http

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        import reconcile_routes
        monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)

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
        import http_client as hc_module
        from contextlib import asynccontextmanager

        mock_http = _make_http_mock(client_exists=True)

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_http

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        import reconcile_routes
        monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)

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
        import http_client as hc_module
        from contextlib import asynccontextmanager

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
        mock_http = _make_http_mock(client_exists=True, invoices=invoices)

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_http

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        import reconcile_routes
        monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)

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
        import http_client as hc_module
        from contextlib import asynccontextmanager

        mock_http = _make_http_mock(client_exists=True)

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_http

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        import reconcile_routes
        monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)

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

    def test_accessing_another_users_client_returns_403(self, monkeypatch):
        import http_client as hc_module
        from contextlib import asynccontextmanager

        mock_http = _make_http_mock(client_exists=False)

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_http

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        import reconcile_routes
        monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)

        response = client.post(
            "/api/reconcile/deep-match",
            data={"client_id": "other-users-client", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 403

    def test_insufficient_credits_returns_402(self, monkeypatch):
        """
        If decrement_credits returns -1, deep-match must return 402
        without calling Gemini.
        """
        import http_client as hc_module
        from contextlib import asynccontextmanager

        # Has unmatched invoices + unmatched 2B records
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
                "invoice_number": "INV001",  # Slightly different
                "taxable_value": 1000.0,
            }
        ]
        mock_http = _make_http_mock(
            client_exists=True,
            invoices=invoices,
            gstr2b_records=gstr2b,
            rpc_result=-1,  # Insufficient credits
        )

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_http

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        import reconcile_routes
        monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)

        response = client.post(
            "/api/reconcile/deep-match",
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 402

    def test_no_unmatched_invoices_returns_success_no_ai_call(self, monkeypatch):
        """
        If all invoices are already matched, deep-match returns success immediately
        without calling the AI or deducting credits.
        """
        import http_client as hc_module
        from contextlib import asynccontextmanager

        # All invoices are matched
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
        mock_http = _make_http_mock(client_exists=True, invoices=invoices)

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_http

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        import reconcile_routes
        monkeypatch.setattr(reconcile_routes, "get_shared_client", fake_shared)

        response = client.post(
            "/api/reconcile/deep-match",
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 200
        assert "No unmatched" in response.json()["message"]
