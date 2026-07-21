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

    @patch("admin_routes.create_async_client")
    def test_tenants_accepts_q_and_exclude_test(self, mock_create):
        fake, _ = _auth_override(is_super_admin=True)
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(
            table_data={
                "profiles": [
                    {
                        "id": "u-real",
                        "company_name": "Real CA Firm",
                        "active_org_id": "org-1",
                        "created_at": "2026-01-02",
                    },
                    {
                        "id": "u-test",
                        "company_name": "KhataLens-test-Firm",
                        "active_org_id": "org-2",
                        "created_at": "2026-01-03",
                    },
                ],
                "organizations": [
                    {"id": "org-1", "credits": 10},
                    {"id": "org-2", "credits": 100},
                ],
                "tenant_usage": [],
                "clients": [],
            },
            table_counts={"profiles": 2},
        )
        mock_create.side_effect = make_async_factory(service_sc)

        response = client.get(
            "/api/admin/tenants?limit=50&offset=0&exclude_test=true&q=Real",
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["pagination"]["exclude_test"] is True
        assert body["pagination"]["q"] == "Real"


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


# ═══════════════════════════════════════════════════════════════
# GET /api/admin/ops-events
# ═══════════════════════════════════════════════════════════════

class TestListOpsEvents:
    def test_unauthenticated_returns_401(self):
        response = client.get("/api/admin/ops-events")
        assert response.status_code == 401

    def test_non_admin_returns_403(self):
        fake, _ = _auth_override(is_super_admin=False)
        app.dependency_overrides[get_current_user] = fake
        response = client.get(
            "/api/admin/ops-events",
            headers={"Authorization": "Bearer user.token"},
        )
        assert response.status_code == 403

    @patch("admin_routes.create_async_client")
    def test_admin_lists_events(self, mock_create):
        fake, _ = _auth_override(is_super_admin=True)
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(
            table_data={
                "ops_events": [
                    {
                        "id": "evt-1",
                        "created_at": "2026-07-22T01:00:00Z",
                        "severity": "error",
                        "event_type": "ai_failure",
                        "channel": "scan",
                        "message": "primary down",
                    }
                ]
            },
            table_counts={"ops_events": 1},
        )
        mock_create.side_effect = make_async_factory(service_sc)

        response = client.get(
            "/api/admin/ops-events?limit=40&offset=0",
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert len(body["events"]) == 1
        assert body["events"][0]["event_type"] == "ai_failure"
        assert "pagination" in body


# ═══════════════════════════════════════════════════════════════
# Ops triage: resolve / reopen / open filter
# ═══════════════════════════════════════════════════════════════

class TestOpsEventTriage:
    def test_resolve_requires_admin(self):
        fake, _ = _auth_override(is_super_admin=False)
        app.dependency_overrides[get_current_user] = fake
        response = client.post(
            "/api/admin/ops-events/evt-1/resolve",
            json={"note": "fixed"},
            headers={"Authorization": "Bearer user.token"},
        )
        assert response.status_code == 403

    @patch("admin_routes.create_async_client")
    def test_resolve_sets_fields(self, mock_create):
        fake, _ = _auth_override(is_super_admin=True, user_id="admin-123")
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(
            table_data={
                "ops_events": [
                    {
                        "id": "evt-1",
                        "severity": "error",
                        "event_type": "ai_failure",
                        "resolved_at": None,
                        "meta": {"credit_outcome": "refunded"},
                    }
                ],
                "admin_audit_log": [],
            }
        )
        mock_create.side_effect = make_async_factory(service_sc)

        response = client.post(
            "/api/admin/ops-events/evt-1/resolve",
            json={"note": "Contacted CA; refund confirmed"},
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert body["resolved_at"]
        updates = [u for tbl, u in service_sc.update_called_with if tbl == "ops_events"]
        assert updates
        assert updates[-1]["resolved_by"] == "admin-123"
        assert updates[-1]["resolution_note"]

    @patch("admin_routes.create_async_client")
    def test_list_resolved_open_param_accepted(self, mock_create):
        fake, _ = _auth_override(is_super_admin=True)
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(
            table_data={"ops_events": []},
            table_counts={"ops_events": 0},
        )
        mock_create.side_effect = make_async_factory(service_sc)

        response = client.get(
            "/api/admin/ops-events?resolved=open&severity=error",
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        assert response.json()["pagination"]["resolved"] == "open"

    @patch("admin_routes.create_async_client")
    def test_get_event_enrich_refund_status(self, mock_create):
        fake, _ = _auth_override(is_super_admin=True)
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(
            table_data={
                "ops_events": [
                    {
                        "id": "evt-9",
                        "severity": "error",
                        "event_type": "channel_exception",
                        "org_id": "org-1",
                        "user_id": "u1",
                        "meta": {"credit_outcome": "refunded", "refunded": True},
                    }
                ],
                "organizations": [{"id": "org-1", "name": "Acme CA", "owner_id": "u1"}],
                "profiles": [{"id": "u1", "company_name": "Acme CA"}],
            }
        )
        mock_create.side_effect = make_async_factory(service_sc)

        response = client.get(
            "/api/admin/ops-events/evt-9",
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        ev = response.json()["event"]
        assert ev["refund_status"] == "refunded"
        assert ev["org_name"] == "Acme CA"


# ═══════════════════════════════════════════════════════════════
# Health aggregations
# ═══════════════════════════════════════════════════════════════

class TestAdminHealth:
    def test_health_summary_non_admin_403(self):
        fake, _ = _auth_override(is_super_admin=False)
        app.dependency_overrides[get_current_user] = fake
        response = client.get(
            "/api/admin/health-summary",
            headers={"Authorization": "Bearer user.token"},
        )
        assert response.status_code == 403

    @patch("admin_routes.create_async_client")
    def test_health_channels_shape(self, mock_create):
        fake, _ = _auth_override(is_super_admin=True)
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(
            table_data={
                "ops_events": [
                    {"channel": "scan", "severity": "error", "created_at": "2026-07-22T01:00:00Z"},
                    {"channel": "scan", "severity": "info", "created_at": "2026-07-22T01:01:00Z"},
                    {"channel": "whatsapp", "severity": "error", "created_at": "2026-07-22T01:02:00Z"},
                ]
            }
        )
        mock_create.side_effect = make_async_factory(service_sc)
        response = client.get(
            "/api/admin/health/channels?window=24h",
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "channels" in body
        assert "scan" in body["channels"]

    @patch("admin_routes.create_async_client")
    def test_health_credits_excludes_test_names(self, mock_create):
        fake, _ = _auth_override(is_super_admin=True)
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(
            table_data={
                "organizations": [
                    {"id": "o1", "name": "Real Firm", "credits": 5, "is_test_archived": False},
                    {"id": "o2", "name": "KhataLens-test-X", "credits": 1, "is_test_archived": False},
                ],
                "ops_events": [],
            }
        )
        mock_create.side_effect = make_async_factory(service_sc)
        response = client.get(
            "/api/admin/health/credits",
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        names = [o["name"] for o in response.json()["low_balance_orgs"]]
        assert "Real Firm" in names
        assert all("khatalens-test" not in n.lower() for n in names)


# ═══════════════════════════════════════════════════════════════
# Tenant tooling + alerts
# ═══════════════════════════════════════════════════════════════

class TestTenantTooling:
    def test_credit_adjust_non_admin(self):
        fake, _ = _auth_override(is_super_admin=False)
        app.dependency_overrides[get_current_user] = fake
        response = client.post(
            "/api/admin/tenants/u1/credits",
            json={"delta": 10, "note": "goodwill top-up"},
            headers={"Authorization": "Bearer user.token"},
        )
        assert response.status_code == 403

    @patch("admin_routes.resolve_active_org_id", new_callable=AsyncMock)
    @patch("admin_routes.create_async_client")
    def test_credit_adjust_calls_rpc(self, mock_create, mock_resolve):
        mock_resolve.return_value = "org-1"
        fake, _ = _auth_override(is_super_admin=True)
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(rpc_results={"admin_adjust_org_credits": 50})
        mock_create.side_effect = make_async_factory(service_sc)

        response = client.post(
            "/api/admin/tenants/u1/credits",
            json={"delta": 40, "note": "goodwill top-up after outage"},
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        assert response.json()["credits"] == 50
        assert any(name == "admin_adjust_org_credits" for name, _ in service_sc.rpc_called_with)

    @patch("admin_routes.resolve_active_org_id", new_callable=AsyncMock)
    @patch("admin_routes.create_async_client")
    def test_suspend_writes_fields(self, mock_create, mock_resolve):
        mock_resolve.return_value = "org-1"
        fake, _ = _auth_override(is_super_admin=True, user_id="admin-123")
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(
            table_data={
                "organizations": [{"id": "org-1", "credits": 10, "suspended_at": None}],
                "admin_audit_log": [],
            }
        )
        mock_create.side_effect = make_async_factory(service_sc)
        response = client.post(
            "/api/admin/tenants/u1/suspend",
            json={"reason": "abuse", "note": "spam scans"},
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        updates = [u for tbl, u in service_sc.update_called_with if tbl == "organizations"]
        assert updates
        assert updates[-1]["suspend_reason"] == "abuse"

    @patch("admin_routes.create_async_client")
    def test_bulk_archive_dry_run(self, mock_create):
        fake, _ = _auth_override(is_super_admin=True)
        app.dependency_overrides[get_current_user] = fake
        service_sc = build_supabase_mock(
            table_data={
                "profiles": [
                    {"id": "u-test", "company_name": "KhataLens-test-Firm", "active_org_id": "org-t"},
                    {"id": "u-real", "company_name": "Acme Test Consultants", "active_org_id": "org-r"},
                ]
            }
        )
        # Emails: only u-test is test domain
        async def _list_users(**_kw):
            u1 = MagicMock(id="u-test", email="bot@khatalens-test.com")
            u2 = MagicMock(id="u-real", email="ca@acme.com")
            return [u1, u2]

        service_sc.auth.admin.list_users = AsyncMock(side_effect=_list_users)
        mock_create.side_effect = make_async_factory(service_sc)

        response = client.post(
            "/api/admin/tenants/bulk-archive-tests",
            json={"confirm": "DELETE_TEST_FIRMS", "dry_run": True},
            headers={"Authorization": "Bearer admin.token"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["dry_run"] is True
        ids = [c["user_id"] for c in body["candidates"]]
        assert "u-test" in ids
        assert "u-real" not in ids


class TestOpsAlerts:
    def test_alerts_check_missing_secret_401(self, monkeypatch):
        monkeypatch.setenv("OPS_ALERT_SECRET", "s3cret")
        response = client.post("/api/admin/alerts/check")
        assert response.status_code == 401

    @patch("ops_alerts.run_spike_check", new_callable=AsyncMock)
    @patch("admin_routes.create_async_client")
    def test_alerts_check_with_secret(self, mock_create, mock_run, monkeypatch):
        monkeypatch.setenv("OPS_ALERT_SECRET", "s3cret")
        mock_run.return_value = {
            "fired": False,
            "error_count": 2,
            "threshold": 10,
        }
        service_sc = build_supabase_mock()
        mock_create.side_effect = make_async_factory(service_sc)
        response = client.post(
            "/api/admin/alerts/check",
            headers={"X-Ops-Alert-Secret": "s3cret"},
        )
        assert response.status_code == 200
        assert response.json()["error_count"] == 2

    def test_alerts_status_non_admin(self):
        fake, _ = _auth_override(is_super_admin=False)
        app.dependency_overrides[get_current_user] = fake
        response = client.get(
            "/api/admin/alerts/status",
            headers={"Authorization": "Bearer user.token"},
        )
        assert response.status_code == 403

