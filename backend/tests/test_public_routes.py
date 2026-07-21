"""
Tests for /api/public/* endpoints.

These routes are unauthenticated (used by client collaboration portal).
Key risks: rate limiting abuse, ZIP-bomb, file deduplication bypass,
free credit exploitation.
"""
import io
from unittest.mock import patch
from fastapi.testclient import TestClient
import sys, os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from main import app
from tests.helpers import make_async_factory, build_supabase_mock

client = TestClient(app)

MINIMAL_JPEG = (
    b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00'
    b'\xff\xdb\x00C\x00' + b'\x08' * 64 +
    b'\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00'
    b'\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    b'\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    b'\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9'
)


# ═══════════════════════════════════════════════════════════════
# GET /api/public/client/{client_id}
# ═══════════════════════════════════════════════════════════════

class TestGetClientInfo:
    @patch("public_routes.create_async_client")
    def test_valid_client_returns_name(self, mock_create):
        mock_sc = build_supabase_mock(
            table_data={"clients": [{"client_name": "ACME Corp", "user_id": "user-abc"}]},
        )
        mock_create.side_effect = make_async_factory(mock_sc)

        response = client.get("/api/public/client/client-abc-123")
        assert response.status_code == 200
        assert response.json()["client_name"] == "ACME Corp"

    @patch("public_routes.create_async_client")
    def test_nonexistent_client_returns_404(self, mock_create):
        mock_sc = build_supabase_mock(table_data={"clients": []})
        mock_create.side_effect = make_async_factory(mock_sc)

        response = client.get("/api/public/client/nonexistent-id")
        assert response.status_code == 404

    def test_no_client_id_returns_404_or_422(self):
        """Hitting the base endpoint without client_id → 404 or 422."""
        response = client.get("/api/public/client/")
        assert response.status_code in (404, 422)


# ═══════════════════════════════════════════════════════════════
# POST /api/public/upload
# ═══════════════════════════════════════════════════════════════

class TestPublicUpload:
    @patch("public_routes.create_async_client")
    def test_nonexistent_client_returns_404(self, mock_create):
        mock_sc = build_supabase_mock(table_data={"clients": []})
        mock_create.side_effect = make_async_factory(mock_sc)

        response = client.post(
            "/api/public/upload",
            data={"client_id": "ghost-client"},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 404

    @patch("public_routes.create_async_client")
    def test_rate_limit_at_200_returns_429(self, mock_create):
        """Daily upload limit of 200 must be enforced."""
        mock_sc = build_supabase_mock(
            table_data={
                "clients": [{"user_id": "user-abc"}],
                "profiles": [{"tally_ledgers": None}],
            },
            table_counts={"invoices": 200},
        )
        mock_create.side_effect = make_async_factory(mock_sc)

        response = client.post(
            "/api/public/upload",
            data={"client_id": "client-abc"},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 429

    @patch("public_routes.create_async_client")
    def test_invalid_file_type_rejected(self, mock_create):
        """Non-image/PDF file must be rejected with 400."""
        mock_sc = build_supabase_mock(
            table_data={"clients": [{"user_id": "user-abc"}]},
        )
        mock_create.side_effect = make_async_factory(mock_sc)

        response = client.post(
            "/api/public/upload",
            data={"client_id": "client-abc"},
            files={"files": ("script.js", io.BytesIO(b"alert('xss')"), "text/javascript")},
        )
        assert response.status_code == 400

    @patch("public_routes.create_async_client")
    @patch("public_routes.get_shared_client")
    def test_duplicate_file_returns_409(self, mock_shared, mock_create):
        """Uploading the same file twice (same SHA-256) → 409 Conflict."""
        mock_sc = build_supabase_mock(
            table_data={
                "clients": [{"user_id": "user-abc"}],
                "profiles": [{"tally_ledgers": None}],
                "invoices": [{"id": "existing-invoice"}],
            },
            table_counts={"invoices": 5},
        )
        mock_create.side_effect = make_async_factory(mock_sc)

        from contextlib import asynccontextmanager
        from unittest.mock import MagicMock

        class FakeHTTP:
            async def post(self, url, **kw):
                resp = MagicMock()
                resp.status_code = 200
                return resp
            async def __aenter__(self): return self
            async def __aexit__(self, *a): pass

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield FakeHTTP()

        mock_shared.side_effect = fake_shared

        response = client.post(
            "/api/public/upload",
            data={"client_id": "client-abc"},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 409
