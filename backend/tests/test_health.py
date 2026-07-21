"""
Tests for basic health/root endpoint.

The application exposes GET / (not /health) returning:
    {"status": "InvoiceScanner Backend is running."}
"""
from fastapi.testclient import TestClient
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app

client = TestClient(app)


def test_root_endpoint_returns_200():
    """GET / should always return 200 — it's the basic liveness probe."""
    response = client.get("/")
    assert response.status_code == 200


def test_root_endpoint_returns_status_field():
    """Response body must contain a 'status' field."""
    response = client.get("/")
    data = response.json()
    assert "status" in data


def test_root_endpoint_indicates_running():
    """Status string must communicate that the backend is up."""
    response = client.get("/")
    data = response.json()
    assert "running" in data["status"].lower()


def test_scan_invoice_without_auth_returns_401():
    """
    POST /api/scan-invoice without an Authorization header must return 401.
    This is a security baseline — no anonymous access to paid features.
    """
    import io
    # Minimal valid JPEG magic bytes
    jpeg_bytes = (
        b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00'
        b'\xff\xdb\x00C\x00' + b'\x01' * 64 +
        b'\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00'
        b'\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
        b'\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
        b'\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9'
    )
    response = client.post(
        "/api/scan-invoice",
        files={"file": ("test.jpg", io.BytesIO(jpeg_bytes), "image/jpeg")},
    )
    assert response.status_code == 401


def test_scan_invoice_with_invalid_bearer_returns_401():
    """Malformed / expired JWT must be rejected with 401."""
    from unittest.mock import MagicMock, patch
    from contextlib import asynccontextmanager
    import io

    class FakeHTTP:
        async def get(self, url, **kw):
            resp = MagicMock()
            resp.status_code = 401
            return resp
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass

    @asynccontextmanager
    async def fake_shared(*a, **kw):
        yield FakeHTTP()

    jpeg_bytes = b'\xff\xd8\xff\xe0' + b'\x00' * 20 + b'\xff\xd9'
    with patch("main.get_shared_client", fake_shared):
        response = client.post(
            "/api/scan-invoice",
            files={"file": ("test.jpg", io.BytesIO(jpeg_bytes), "image/jpeg")},
            headers={"Authorization": "Bearer not.a.real.token"},
        )
    assert response.status_code == 401
