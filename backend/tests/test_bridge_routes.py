"""Route tests for Tally Bridge device + job APIs (mocked Supabase)."""
from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("TESTING", "1")
os.environ.setdefault("BRIDGE_JWT_SECRET", "test-bridge-jwt-secret")
os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("PUBLIC_UPLOAD_TOKEN_SECRET", "test-public-secret")

from main import app
from utils import get_current_user
from bridge_auth import create_device_token, hash_device_secret

client = TestClient(app)


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _auth_user(user_id="user-1"):
    sc = MagicMock()

    async def resolve(*a, **k):
        return "org-1"

    async def access(*a, **k):
        return True

    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": user_id,
        "token": "tok",
        "supabase_client": sc,
    }
    return sc


def test_register_device(monkeypatch):
    sc = _auth_user()
    monkeypatch.setattr("bridge_routes.resolve_active_org_id", AsyncMock(return_value="org-1"))
    monkeypatch.setattr("bridge_routes.verify_client_access", AsyncMock())

    insert_chain = MagicMock()
    insert_chain.execute = AsyncMock(
        return_value=MagicMock(data=[{"id": "dev-1", "label": "Office PC"}])
    )
    sc.table.return_value.insert.return_value = insert_chain

    resp = client.post(
        "/api/bridge/devices/register",
        json={"label": "Office PC"},
        headers={"Authorization": "Bearer x"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["device_id"] == "dev-1"
    assert "device_secret" in body
    assert len(body["device_secret"]) > 10


def test_device_token_and_revoked(monkeypatch):
    secret = "my-secret"
    device = {
        "id": "dev-1",
        "user_id": "user-1",
        "org_id": "org-1",
        "device_secret_hash": hash_device_secret(secret),
        "revoked_at": None,
    }

    mock_sc = MagicMock()
    sel = MagicMock()
    sel.eq.return_value = sel
    sel.limit.return_value = sel
    sel.execute = AsyncMock(return_value=MagicMock(data=[device]))
    upd = MagicMock()
    upd.eq.return_value = upd
    upd.execute = AsyncMock(return_value=MagicMock(data=[]))
    mock_sc.table.return_value.select.return_value = sel
    mock_sc.table.return_value.update.return_value = upd

    monkeypatch.setattr("bridge_routes._service_client", AsyncMock(return_value=mock_sc))

    resp = client.post(
        "/api/bridge/devices/token",
        json={"device_id": "dev-1", "device_secret": secret},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()

    # Wrong secret
    bad = client.post(
        "/api/bridge/devices/token",
        json={"device_id": "dev-1", "device_secret": "nope"},
    )
    assert bad.status_code == 401


def test_create_job_idempotent_fingerprint(monkeypatch):
    sc = _auth_user()
    monkeypatch.setattr("bridge_routes.resolve_active_org_id", AsyncMock(return_value="org-1"))
    monkeypatch.setattr("bridge_routes.verify_client_access", AsyncMock())

    fake_xml = "<ENVELOPE><BODY>ok</BODY></ENVELOPE>"
    monkeypatch.setattr(
        "bridge_routes._build_xml",
        lambda body: (fake_xml, {"voucher_count": 1}),
    )

    # First call: no existing → insert
    select_chain = MagicMock()
    select_chain.eq.return_value = select_chain
    select_chain.in_.return_value = select_chain
    select_chain.limit.return_value = select_chain
    select_chain.execute = AsyncMock(return_value=MagicMock(data=[]))

    insert_chain = MagicMock()
    insert_chain.execute = AsyncMock(
        return_value=MagicMock(
            data=[{"id": "job-1", "status": "queued", "fingerprint": "abc"}]
        )
    )

    table = MagicMock()
    table.select.return_value = select_chain
    table.insert.return_value = insert_chain
    sc.table.return_value = table

    r1 = client.post(
        "/api/tally/jobs",
        json={
            "client_id": "c1",
            "source": "invoices",
            "invoices": [{"invoice_number": "1", "total_amount": 100}],
        },
        headers={"Authorization": "Bearer x"},
    )
    assert r1.status_code == 200
    assert r1.json()["job_id"] == "job-1"
    assert r1.json()["idempotent"] is False

    # Second: existing queued
    select_chain.execute = AsyncMock(
        return_value=MagicMock(
            data=[{"id": "job-1", "status": "queued", "fingerprint": "fp", "created_at": None}]
        )
    )
    r2 = client.post(
        "/api/tally/jobs",
        json={
            "client_id": "c1",
            "source": "invoices",
            "invoices": [{"invoice_number": "1", "total_amount": 100}],
        },
        headers={"Authorization": "Bearer x"},
    )
    assert r2.status_code == 200
    assert r2.json()["idempotent"] is True
    assert r2.json()["job_id"] == "job-1"


def test_claim_next_requires_device_token():
    resp = client.get("/api/bridge/jobs/next")
    assert resp.status_code == 401


def test_claim_next_with_device_token(monkeypatch):
    token, _ = create_device_token(device_id="dev-1", user_id="u1", org_id="org-1")
    device = {
        "id": "dev-1",
        "user_id": "u1",
        "org_id": "org-1",
        "revoked_at": None,
        "client_id_allowlist": None,
    }
    mock_sc = MagicMock()
    sel = MagicMock()
    sel.eq.return_value = sel
    sel.limit.return_value = sel
    sel.execute = AsyncMock(return_value=MagicMock(data=[device]))
    upd = MagicMock()
    upd.eq.return_value = upd
    upd.execute = AsyncMock()
    mock_sc.table.return_value.select.return_value = sel
    mock_sc.table.return_value.update.return_value = upd
    mock_sc.rpc.return_value.execute = AsyncMock(
        return_value=MagicMock(
            data=[
                {
                    "id": "job-9",
                    "client_id": "c1",
                    "source": "invoices",
                    "xml": "<E/>",
                    "payload_meta": {},
                    "fingerprint": "f",
                }
            ]
        )
    )
    monkeypatch.setattr("bridge_routes._service_client", AsyncMock(return_value=mock_sc))

    resp = client.get(
        "/api/bridge/jobs/next",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["job"]["id"] == "job-9"
