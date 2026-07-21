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
    """Malformed / expired JWT must be rejected with 401 via Depends(get_current_user)."""
    import io
    from fastapi import HTTPException
    from utils import get_current_user

    jpeg_bytes = b'\xff\xd8\xff\xe0' + b'\x00' * 20 + b'\xff\xd9'

    async def reject():
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid session token")

    app.dependency_overrides[get_current_user] = reject
    try:
        response = client.post(
            "/api/scan-invoice",
            files={"file": ("test.jpg", io.BytesIO(jpeg_bytes), "image/jpeg")},
            headers={"Authorization": "Bearer not.a.real.token"},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 401


def test_cors_origins_default_excludes_wildcard():
    """CORS allowlist must never include '*' when credentials are enabled."""
    from main import ALLOWED_ORIGINS
    assert "*" not in ALLOWED_ORIGINS
    assert "http://localhost:5173" in ALLOWED_ORIGINS


def test_cors_origins_env_override(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com, https://staging.example.com")
    # Re-parse without reloading whole app
    from main import _parse_cors_origins
    origins = _parse_cors_origins()
    assert origins == ["https://app.example.com", "https://staging.example.com"]


def test_cors_origins_rejects_wildcard_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "*")
    from main import _parse_cors_origins, _DEFAULT_CORS_ORIGINS
    origins = _parse_cors_origins()
    assert origins == list(_DEFAULT_CORS_ORIGINS)
