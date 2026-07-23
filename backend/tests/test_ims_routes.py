"""Route smoke tests for IMS upload/list/bulk-action."""
from __future__ import annotations

import io
import json
import os
import sys
from contextlib import asynccontextmanager
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("TESTING", "1")

from main import app
from utils import get_current_user

client = TestClient(app)


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _mock_http():
    class FakeResp:
        def __init__(self, status_code, data=None, text=""):
            self.status_code = status_code
            self._data = data if data is not None else {}
            self.text = text or json.dumps(self._data)

        def json(self):
            return self._data

    class FakeHTTP:
        def __init__(self):
            self.posts = []
            self.patches = []
            self.deletes = []
            self.rows = []

        async def get(self, url, **kw):
            if "ims_records" in url:
                return FakeResp(200, self.rows)
            if "invoices" in url:
                return FakeResp(200, [])
            if "gstin_cache" in url:
                return FakeResp(200, [])
            return FakeResp(200, [])

        async def delete(self, url, **kw):
            self.deletes.append(url)
            return FakeResp(204)

        async def post(self, url, **kw):
            body = kw.get("json")
            self.posts.append((url, body))
            if "ims_records" in url and isinstance(body, list):
                self.rows = [{**r, "id": f"id-{i}"} for i, r in enumerate(body)]
                return FakeResp(201, self.rows)
            return FakeResp(200, {})

        async def patch(self, url, **kw):
            self.patches.append((url, kw.get("json")))
            # simulate Prefer return=representation with updated rows
            action = (kw.get("json") or {}).get("ims_action")
            if action and self.rows:
                for r in self.rows:
                    if r.get("id") and f"id=" in url or "id=in" in url:
                        r["ims_action"] = action
                return FakeResp(200, self.rows)
            return FakeResp(204)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    return FakeHTTP()


def _auth(monkeypatch, mock_http):
    async def fake_user():
        return {
            "user_id": "user-1",
            "token": "tok",
            "supabase_client": MagicMock(),
        }

    app.dependency_overrides[get_current_user] = fake_user

    async def ok_access(*a, **k):
        return True

    monkeypatch.setattr("ims_routes.verify_client_access", ok_access)

    @asynccontextmanager
    async def fake_client():
        yield mock_http

    monkeypatch.setattr("ims_routes.get_shared_client", fake_client)


def test_ims_upload_and_list(monkeypatch):
    mock = _mock_http()
    _auth(monkeypatch, mock)
    payload = {
        "invoices": [
            {
                "ctin": "27AASPK8773A1ZB",
                "inum": "INV-1",
                "txval": 100,
                "action": "P",
            }
        ]
    }
    buf = io.BytesIO(json.dumps(payload).encode())
    resp = client.post(
        "/api/ims/upload",
        files={"file": ("ims.json", buf, "application/json")},
        data={"client_id": "c1", "period": "03-2026"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["counts"]["pending"] == 1

    mock.rows = [
        {
            "id": "id-0",
            "ims_action": "pending",
            "supplier_gstin": "27AASPK8773A1ZB",
            "invoice_number": "INV-1",
            "deemed_accept_by": "2026-04-30",
        }
    ]
    list_resp = client.get("/api/ims", params={"client_id": "c1", "period": "03-2026"})
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1


def test_ims_bulk_action(monkeypatch):
    mock = _mock_http()
    mock.rows = [
        {
            "id": "id-0",
            "ims_action": "pending",
            "supplier_gstin": "27AASPK8773A1ZB",
            "invoice_number": "INV-1",
        }
    ]
    _auth(monkeypatch, mock)
    resp = client.post(
        "/api/ims/bulk-action",
        json={
            "client_id": "c1",
            "period": "03-2026",
            "ids": ["id-0"],
            "action": "accepted",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["action"] == "accepted"
    assert any(p[1].get("ims_action") == "accepted" for p in mock.patches)
