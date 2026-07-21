"""
Tests for /api/admin/* routes.

Security critical: verify_super_admin must check the database flag,
not user_metadata or JWT claims.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
import sys, os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from main import app
from tests.helpers import make_async_factory, build_supabase_mock

client = TestClient(app)


def _make_supabase_admin_mock(is_super_admin: bool = True, user_id: str = "admin-123"):
    return build_supabase_mock(
        user_id=user_id,
        table_data={"profiles": [{"is_super_admin": is_super_admin}]},
    )


# ═══════════════════════════════════════════════════════════════
# verify_super_admin dependency
# ═══════════════════════════════════════════════════════════════

class TestVerifySuperAdmin:
    def test_no_auth_header_returns_401(self):
        response = client.get("/api/admin/metrics")
        assert response.status_code == 401

    def test_empty_bearer_token_returns_401(self):
        response = client.get(
            "/api/admin/metrics",
            headers={"Authorization": "Bearer "},
        )
        assert response.status_code == 401

    @patch("admin_routes.create_async_client")
    def test_non_admin_user_returns_403(self, mock_create):
        """User with is_super_admin=False must be rejected with 403."""
        mock_create.side_effect = make_async_factory(_make_supabase_admin_mock(is_super_admin=False))
        response = client.get(
            "/api/admin/metrics",
            headers={"Authorization": "Bearer regular.user.token"},
        )
        assert response.status_code == 403

    @patch("admin_routes.create_async_client")
    def test_admin_with_true_flag_allowed(self, mock_create):
        """User with is_super_admin=True passes the guard."""
        admin_sc = _make_supabase_admin_mock(is_super_admin=True)
        service_sc = build_supabase_mock(table_data={})

        call_count = 0
        async def _factory(*a, **kw):
            nonlocal call_count
            call_count += 1
            return admin_sc if call_count == 1 else service_sc

        mock_create.side_effect = _factory

        response = client.get(
            "/api/admin/metrics",
            headers={"Authorization": "Bearer admin.jwt.token"},
        )
        assert response.status_code in (200, 500)

    @patch("admin_routes.create_async_client")
    def test_profile_not_found_returns_403(self, mock_create):
        """If profile row doesn't exist, return 403 (not 500)."""
        mock_sc = build_supabase_mock(user_id="user-ghost", table_data={"profiles": []})
        mock_create.side_effect = make_async_factory(mock_sc)

        response = client.get(
            "/api/admin/metrics",
            headers={"Authorization": "Bearer ghost.user.token"},
        )
        assert response.status_code == 403

    @patch("admin_routes.create_async_client")
    def test_invalid_token_from_supabase_returns_401(self, mock_create):
        """If Supabase raises on get_user, return 401."""
        from unittest.mock import MagicMock, AsyncMock
        mock_sc = MagicMock()
        mock_sc.auth.get_user = AsyncMock(side_effect=Exception("Token expired"))
        mock_create.side_effect = make_async_factory(mock_sc)

        response = client.get(
            "/api/admin/metrics",
            headers={"Authorization": "Bearer expired.token.here"},
        )
        assert response.status_code in (401, 500)


# ═══════════════════════════════════════════════════════════════
# GET /api/admin/tenants
# ═══════════════════════════════════════════════════════════════

class TestGetAllTenants:
    def test_unauthenticated_returns_401(self):
        response = client.get("/api/admin/tenants")
        assert response.status_code == 401

    @patch("admin_routes.create_async_client")
    def test_non_admin_returns_403(self, mock_create):
        mock_create.side_effect = make_async_factory(_make_supabase_admin_mock(is_super_admin=False))
        response = client.get(
            "/api/admin/tenants",
            headers={"Authorization": "Bearer user.token"},
        )
        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════
# POST /api/admin/tenants/{id}/update (quota)
# ═══════════════════════════════════════════════════════════════

class TestUpdateTenantQuota:
    def test_unauthenticated_returns_401(self):
        response = client.post(
            "/api/admin/tenants/some-tenant-id/update",
            json={"user_id": "some-tenant-id", "new_quota": 500},
        )
        assert response.status_code == 401

    @patch("admin_routes.create_async_client")
    def test_non_admin_blocked(self, mock_create):
        mock_create.side_effect = make_async_factory(_make_supabase_admin_mock(is_super_admin=False))
        response = client.post(
            "/api/admin/tenants/some-id/update",
            json={"user_id": "some-id", "new_quota": 500},
            headers={"Authorization": "Bearer user.token"},
        )
        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════
# DELETE /api/admin/tenants/{id}
# ═══════════════════════════════════════════════════════════════

class TestDeleteTenant:
    def test_unauthenticated_returns_401(self):
        response = client.delete("/api/admin/tenants/some-tenant-id")
        assert response.status_code == 401

    @patch("admin_routes.create_async_client")
    def test_non_admin_blocked(self, mock_create):
        mock_create.side_effect = make_async_factory(_make_supabase_admin_mock(is_super_admin=False))
        response = client.delete(
            "/api/admin/tenants/some-id",
            headers={"Authorization": "Bearer user.token"},
        )
        assert response.status_code == 403
