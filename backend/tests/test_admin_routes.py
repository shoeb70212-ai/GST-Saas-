"""
Tests for /api/admin/* routes.

Security critical: verify_super_admin must check the database flag,
not user_metadata or JWT claims. Auth is composed via Depends(get_current_user).
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
from utils import get_current_user
from tests.helpers import make_async_factory, build_supabase_mock

client = TestClient(app)


def _auth_override(is_super_admin: bool = True, user_id: str = "admin-123", table_data: dict | None = None):
    profiles = [{"id": user_id, "is_super_admin": is_super_admin, "active_org_id": "org-1", "created_at": "2026-01-01"}]
    data = {"profiles": profiles}
    if table_data:
        data.update(table_data)
    sc = build_supabase_mock(user_id=user_id, table_data=data)

    async def _fake():
        return {"user_id": user_id, "supabase_client": sc, "token": "test.jwt"}

    return _fake, sc


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


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

    def test_non_admin_user_returns_403(self):
        """User with is_super_admin=False must be rejected with 403."""
        fake, _ = _auth_override(is_super_admin=False)
        app.dependency_overrides[get_current_user] = fake
        response = client.get(
            "/api/admin/metrics",
            headers={"Authorization": "Bearer regular.user.token"},
        )
        assert response.status_code == 403

    @patch("admin_routes.create_async_client")
    def test_admin_with_true_flag_allowed(self, mock_create):
        """User with is_super_admin=True passes the guard."""
        fake, _ = _auth_override(is_super_admin=True)
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(table_data={}, table_counts={"invoices": 0, "clients": 0, "profiles": 0})
        mock_create.side_effect = make_async_factory(service_sc)

        response = client.get(
            "/api/admin/metrics",
            headers={"Authorization": "Bearer admin.jwt.token"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "metrics" in body

    def test_profile_not_found_returns_403(self):
        """If profile row doesn't exist, return 403 (not 500)."""
        sc = build_supabase_mock(user_id="user-ghost", table_data={"profiles": []})

        async def _fake():
            return {"user_id": "user-ghost", "supabase_client": sc, "token": "tok"}

        app.dependency_overrides[get_current_user] = _fake
        response = client.get(
            "/api/admin/metrics",
            headers={"Authorization": "Bearer ghost.user.token"},
        )
        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════
# GET /api/admin/tenants
# ═══════════════════════════════════════════════════════════════

class TestGetAllTenants:
    def test_unauthenticated_returns_401(self):
        response = client.get("/api/admin/tenants")
        assert response.status_code == 401

    def test_non_admin_returns_403(self):
        fake, _ = _auth_override(is_super_admin=False)
        app.dependency_overrides[get_current_user] = fake
        response = client.get(
            "/api/admin/tenants",
            headers={"Authorization": "Bearer user.token"},
        )
        assert response.status_code == 403

    @patch("admin_routes.create_async_client")
    def test_tenants_pagination_shape(self, mock_create):
        fake, _ = _auth_override(is_super_admin=True)
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(
            table_data={
                "profiles": [
                    {"id": "u1", "company_name": "Acme", "active_org_id": "org-1", "created_at": "2026-01-02"},
                ],
                "organizations": [{"id": "org-1", "credits": 42}],
                "tenant_usage": [],
                "clients": [],
            },
            table_counts={"profiles": 1},
        )
        mock_create.side_effect = make_async_factory(service_sc)

        response = client.get(
            "/api/admin/tenants?limit=50&offset=0",
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "pagination" in body
        assert body["pagination"]["limit"] == 50
        assert body["pagination"]["offset"] == 0
        assert isinstance(body["tenants"], list)
        if body["tenants"]:
            assert body["tenants"][0]["credits"] == 42


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

    def test_non_admin_blocked(self):
        fake, _ = _auth_override(is_super_admin=False)
        app.dependency_overrides[get_current_user] = fake
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

    def test_non_admin_blocked(self):
        fake, _ = _auth_override(is_super_admin=False)
        app.dependency_overrides[get_current_user] = fake
        response = client.delete(
            "/api/admin/tenants/some-id",
            headers={"Authorization": "Bearer user.token"},
        )
        assert response.status_code == 403
