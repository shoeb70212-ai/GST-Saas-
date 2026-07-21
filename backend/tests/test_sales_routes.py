"""
Tests for sales / tax-liability endpoints:
  POST /api/sales/upload
  GET  /api/sales/prediction

Focus: has_client_access alignment (teammate allow / outsider deny).
"""
import io
import sys
import os
from contextlib import asynccontextmanager
from unittest.mock import MagicMock

import pandas as pd
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")

from main import app

client = TestClient(app)


def _make_gstr1_excel() -> bytes:
    """Minimal GSTR-1 B2B sheet for upload parsing."""
    df = pd.DataFrame(
        [
            {
                "GSTIN/UIN of Recipient": "27AADCB2230M1Z2",
                "Invoice number": "S-001",
                "Invoice date": "01-03-2024",
                "Taxable Value": 5000.0,
                "Integrated Tax": 0.0,
                "Central Tax": 450.0,
                "State/UT Tax": 450.0,
            }
        ]
    )
    buf = io.BytesIO()
    df.to_excel(buf, sheet_name="b2b", index=False, engine="openpyxl")
    buf.seek(0)
    return buf.read()


def _make_http_mock(user_id: str = "user-123", prediction: dict | None = None):
    class FakeResp:
        def __init__(self, status_code, data):
            self.status_code = status_code
            self._data = data

        def json(self):
            return self._data

    class FakeHTTPClient:
        def __init__(self):
            self.posts = []
            self.deletes = []

        async def get(self, url, **kw):
            if "/auth/v1/user" in url:
                return FakeResp(200, {"id": user_id})
            return FakeResp(200, [])

        async def delete(self, url, **kw):
            self.deletes.append(url)
            return FakeResp(200, {})

        async def post(self, url, **kw):
            self.posts.append((url, kw.get("json")))
            if "get_tax_liability_prediction" in url:
                return FakeResp(200, prediction or {"final_liability": 0})
            if "sales_records" in url:
                return FakeResp(201, [])
            return FakeResp(200, {})

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    return FakeHTTPClient()


def _patch_sales_access(monkeypatch, *, allowed: bool = True, mock_http=None):
    import http_client as hc_module
    import sales_routes

    if mock_http is None:
        mock_http = _make_http_mock()

    @asynccontextmanager
    async def fake_shared(*a, **kw):
        yield mock_http

    async def fake_get_sc(_authorization):
        return MagicMock()

    async def fake_verify(_sc, _client_id):
        if not allowed:
            raise HTTPException(status_code=403, detail="Access denied: client not found")

    monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
    monkeypatch.setattr(sales_routes, "get_shared_client", fake_shared)
    monkeypatch.setattr(sales_routes, "get_user_supabase_client", fake_get_sc)
    monkeypatch.setattr(sales_routes, "verify_client_access", fake_verify)
    return mock_http


class TestSalesUploadAuth:
    def test_no_auth_returns_401(self):
        buf = _make_gstr1_excel()
        response = client.post(
            "/api/sales/upload",
            files={
                "file": (
                    "gstr1.xlsx",
                    io.BytesIO(buf),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"client_id": "client-abc", "period": "03-2024"},
        )
        assert response.status_code == 401


class TestSalesUploadAccess:
    def test_outsider_without_has_client_access_returns_403(self, monkeypatch):
        _patch_sales_access(monkeypatch, allowed=False)
        buf = _make_gstr1_excel()
        response = client.post(
            "/api/sales/upload",
            files={
                "file": (
                    "gstr1.xlsx",
                    io.BytesIO(buf),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"client_id": "other-users-client", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 403

    def test_org_teammate_with_has_client_access_can_upload(self, monkeypatch):
        mock_http = _make_http_mock(user_id="teammate-456")
        verify_calls = []

        import http_client as hc_module
        import sales_routes

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield mock_http

        async def fake_get_sc(_authorization):
            return MagicMock()

        async def fake_verify(_sc, client_id):
            verify_calls.append(client_id)

        monkeypatch.setattr(hc_module, "get_shared_client", fake_shared)
        monkeypatch.setattr(sales_routes, "get_shared_client", fake_shared)
        monkeypatch.setattr(sales_routes, "get_user_supabase_client", fake_get_sc)
        monkeypatch.setattr(sales_routes, "verify_client_access", fake_verify)

        buf = _make_gstr1_excel()
        response = client.post(
            "/api/sales/upload",
            files={
                "file": (
                    "gstr1.xlsx",
                    io.BytesIO(buf),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        assert verify_calls == ["client-abc"]
        assert any("sales_records" in url for url, _ in mock_http.posts)


class TestSalesPredictionAccess:
    def test_outsider_denied_on_prediction(self, monkeypatch):
        _patch_sales_access(monkeypatch, allowed=False)
        response = client.get(
            "/api/sales/prediction",
            params={"client_id": "other-client", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 403

    def test_teammate_allowed_on_prediction(self, monkeypatch):
        mock_http = _make_http_mock(
            user_id="teammate-456",
            prediction={"final_liability": 1000, "current_sales_tax": 1000},
        )
        _patch_sales_access(monkeypatch, allowed=True, mock_http=mock_http)
        response = client.get(
            "/api/sales/prediction",
            params={"client_id": "client-abc", "period": "03-2024"},
            headers={"Authorization": "Bearer valid.token.here"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        assert response.json()["data"]["final_liability"] == 1000
