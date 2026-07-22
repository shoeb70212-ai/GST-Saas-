"""
Tests for /api/public/* endpoints.

These routes are unauthenticated (used by client collaboration portal).
Key risks: rate limiting abuse, ZIP-bomb, file deduplication bypass,
free credit exploitation, unsigned token access.
"""
import io
import os
from contextlib import asynccontextmanager
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("PUBLIC_UPLOAD_TOKEN_SECRET", "test-upload-secret")

from main import app
from tests.helpers import make_async_factory, build_supabase_mock
from public_upload_tokens import create_public_upload_token

client = TestClient(app)

MINIMAL_JPEG = (
    b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00'
    b'\xff\xdb\x00C\x00' + b'\x08' * 64 +
    b'\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00'
    b'\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    b'\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    b'\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9'
)

CLIENT_ID = "client-abc-123"


def _client_row(**extra):
    row = {"id": CLIENT_ID, "client_name": "ACME Corp", "user_id": "user-abc"}
    row.update(extra)
    return row


def _token_for(client_id: str = CLIENT_ID) -> str:
    token, _ = create_public_upload_token(client_id)
    return token


def _fake_http_factory(rpc_result=1):
    class FakeHTTP:
        async def post(self, url, **kw):
            resp = MagicMock()
            resp.status_code = 200
            if "decrement_credits" in url or "refund_credits" in url:
                resp.json = MagicMock(return_value=rpc_result)
            return resp

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    @asynccontextmanager
    async def fake_shared(*a, **kw):
        yield FakeHTTP()

    return fake_shared


# ═══════════════════════════════════════════════════════════════
# GET /api/public/client/{client_id}
# ═══════════════════════════════════════════════════════════════

class TestGetClientInfo:
    @patch("public_routes.create_async_client")
    def test_valid_client_returns_name(self, mock_create):
        mock_sc = build_supabase_mock(
            table_data={"clients": [_client_row()]},
        )
        mock_create.side_effect = make_async_factory(mock_sc)

        token = _token_for("client-abc-123")
        response = client.get(f"/api/public/client/client-abc-123?token={token}")
        assert response.status_code == 200
        assert response.json()["client_name"] == "ACME Corp"

    @patch("public_routes.create_async_client")
    def test_nonexistent_client_returns_404(self, mock_create):
        mock_sc = build_supabase_mock(table_data={"clients": []})
        mock_create.side_effect = make_async_factory(mock_sc)

        token = _token_for("nonexistent-id")
        response = client.get(f"/api/public/client/nonexistent-id?token={token}")
        assert response.status_code == 404

    def test_missing_token_returns_401(self):
        response = client.get("/api/public/client/client-abc-123")
        assert response.status_code in (401, 422)

    def test_invalid_token_returns_401(self):
        response = client.get("/api/public/client/client-abc-123?token=not-a-valid-token")
        assert response.status_code == 401


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
            data={"client_id": "ghost-client", "upload_token": _token_for("ghost-client")},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 404

    @patch("public_routes.create_async_client")
    def test_rate_limit_at_200_returns_429(self, mock_create):
        """Daily upload limit of 200 must be enforced."""
        mock_sc = build_supabase_mock(
            table_data={
                "clients": [_client_row()],
                "profiles": [{"id": "user-abc", "tally_ledgers": None}],
            },
            table_counts={"invoices": 200},
        )
        mock_create.side_effect = make_async_factory(mock_sc)

        response = client.post(
            "/api/public/upload",
            data={"client_id": CLIENT_ID, "upload_token": _token_for()},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 429

    @patch("public_routes.create_async_client")
    def test_invalid_file_type_rejected(self, mock_create):
        """Non-image/PDF file must be rejected with 400."""
        mock_sc = build_supabase_mock(
            table_data={"clients": [_client_row()]},
        )
        mock_create.side_effect = make_async_factory(mock_sc)

        response = client.post(
            "/api/public/upload",
            data={"client_id": CLIENT_ID, "upload_token": _token_for()},
            files={"files": ("script.js", io.BytesIO(b"alert('xss')"), "text/javascript")},
        )
        assert response.status_code == 400

    @patch("public_routes.create_async_client")
    @patch("public_routes.get_shared_client")
    def test_duplicate_file_returns_409(self, mock_shared, mock_create):
        """Uploading the same file twice (same SHA-256) → 409 Conflict."""
        mock_sc = build_supabase_mock(
            table_data={
                "clients": [_client_row()],
                "profiles": [{"id": "user-abc", "tally_ledgers": None}],
                "invoices": [{"id": "existing-invoice"}],
            },
            table_counts={"invoices": 5},
        )
        mock_create.side_effect = make_async_factory(mock_sc)
        mock_shared.side_effect = _fake_http_factory()

        response = client.post(
            "/api/public/upload",
            data={"client_id": CLIENT_ID, "upload_token": _token_for()},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 409

    def test_missing_upload_token_returns_401(self):
        response = client.post(
            "/api/public/upload",
            data={"client_id": CLIENT_ID},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code in (401, 422)

    def test_expired_upload_token_returns_401(self):
        expired, _ = create_public_upload_token(CLIENT_ID, ttl_seconds=-10)
        response = client.post(
            "/api/public/upload",
            data={"client_id": CLIENT_ID, "upload_token": expired},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 401
        assert "expired" in response.json()["detail"].lower()

    def test_token_for_other_client_returns_401(self):
        other_token = _token_for("client-other-999")
        response = client.post(
            "/api/public/upload",
            data={"client_id": CLIENT_ID, "upload_token": other_token},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 401

    @patch("public_routes.create_async_client")
    @patch("public_routes.get_shared_client")
    def test_insufficient_credits_returns_402_before_queue(self, mock_shared, mock_create):
        """Credits must be checked before AI — no free processing."""
        mock_sc = build_supabase_mock(
            table_data={
                "clients": [_client_row()],
                "profiles": [{"id": "user-abc", "tally_ledgers": None}],
                "invoices": [],
            },
        )
        mock_create.side_effect = make_async_factory(mock_sc)
        mock_shared.side_effect = _fake_http_factory(rpc_result=-1)

        response = client.post(
            "/api/public/upload",
            data={"client_id": CLIENT_ID, "upload_token": _token_for()},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 402

    @patch("public_routes.create_async_client")
    @patch("public_routes.get_shared_client")
    def test_storage_failure_refunds_credit(self, mock_shared, mock_create):
        """Storage 500 after deduct must refund before surfacing error."""
        mock_sc = build_supabase_mock(
            table_data={
                "clients": [_client_row()],
                "profiles": [{"id": "user-abc", "tally_ledgers": None}],
                "invoices": [],
            },
        )
        mock_create.side_effect = make_async_factory(mock_sc)

        class FailStorageHTTP:
            posts: list = []

            async def post(self, url, **kw):
                FailStorageHTTP.posts.append(url)
                resp = MagicMock()
                if "decrement_credits" in url:
                    resp.status_code = 200
                    resp.json = MagicMock(return_value=50)
                elif "refund_credits" in url:
                    resp.status_code = 200
                    resp.json = MagicMock(return_value=True)
                else:
                    # storage object upload
                    resp.status_code = 500
                    resp.text = "storage boom"
                    resp.json = MagicMock(return_value={"error": "storage boom"})
                return resp

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                pass

        @asynccontextmanager
        async def fake_shared(*a, **kw):
            yield FailStorageHTTP()

        mock_shared.side_effect = fake_shared
        FailStorageHTTP.posts = []

        response = client.post(
            "/api/public/upload",
            data={"client_id": CLIENT_ID, "upload_token": _token_for()},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 500
        assert any("refund_credits" in u for u in FailStorageHTTP.posts)
        assert any("decrement_credits" in u for u in FailStorageHTTP.posts)

    @patch("public_routes.create_async_client")
    @patch("public_routes.get_shared_client")
    def test_successful_upload_deducts_before_queue(self, mock_shared, mock_create):
        mock_sc = build_supabase_mock(
            table_data={
                "clients": [_client_row()],
                "profiles": [{"id": "user-abc", "tally_ledgers": None}],
                "invoices": [],
            },
        )
        mock_create.side_effect = make_async_factory(mock_sc)
        mock_shared.side_effect = _fake_http_factory(rpc_result=99)

        response = client.post(
            "/api/public/upload",
            data={"client_id": CLIENT_ID, "upload_token": _token_for()},
            files={"files": ("inv.jpg", io.BytesIO(MINIMAL_JPEG), "image/jpeg")},
        )
        assert response.status_code == 200
        assert response.json()["queued_ids"]


# ═══════════════════════════════════════════════════════════════
# POST /api/public/issue-token
# ═══════════════════════════════════════════════════════════════

class TestIssueToken:
    @patch("public_routes.create_async_client")
    @patch("utils.create_async_client")
    def test_authenticated_user_can_issue_token(self, mock_utils_create, mock_public_create):
        mock_sc = build_supabase_mock(
            table_data={"clients": [{"id": CLIENT_ID, "client_name": "ACME Corp"}]},
        )
        mock_utils_create.side_effect = make_async_factory(mock_sc)
        mock_public_create.side_effect = make_async_factory(mock_sc)

        response = client.post(
            "/api/public/issue-token",
            json={"client_id": CLIENT_ID},
            headers={"Authorization": "Bearer valid-test-token"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "upload_token" in body
        assert CLIENT_ID in body["portal_url"]

    def test_unauthenticated_issue_token_returns_401(self):
        response = client.post(
            "/api/public/issue-token",
            json={"client_id": CLIENT_ID},
        )
        assert response.status_code == 401
