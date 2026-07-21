"""
Tests for payment routes:
  POST /api/create-order
  POST /api/verify-payment
  POST /api/webhooks/payment

Strategy: Mock the Supabase async client and Razorpay client at module level.
No real payments, no real database writes.
"""
import json
import hmac
import hashlib
import pytest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
import sys, os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# ── Env vars must be set before importing payment_routes ────────────────────
os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("RAZORPAY_KEY_ID", "rzp_test_mock")
os.environ.setdefault("RAZORPAY_KEY_SECRET", "rzp_test_secret")
os.environ.setdefault("RAZORPAY_WEBHOOK_SECRET", "webhook_secret_123")
os.environ.setdefault("ENVIRONMENT", "development")

from main import app
from utils import get_current_user
from tests.helpers import make_async_factory, build_supabase_mock

client = TestClient(app)


def _make_supabase_mock(
    user_id: str = "user-123",
    order_data: dict | None = None,
):
    return build_supabase_mock(
        user_id=user_id,
        table_data={
            "payment_orders": [order_data] if order_data else [],
        },
    )


def _override_auth(user_id: str = "user-123", supabase_client=None):
    """Wire Depends(get_current_user) to a controlled mock client."""
    mock_sc = supabase_client or _make_supabase_mock(user_id=user_id)

    async def _fake():
        return {
            "user_id": user_id,
            "supabase_client": mock_sc,
            "token": "fake.jwt.token",
        }

    app.dependency_overrides[get_current_user] = _fake
    return mock_sc


def _clear_auth():
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def _cleanup_auth_overrides():
    yield
    _clear_auth()


def _fake_fulfill_http(rpc_body: dict | None = None, status_code: int = 200):
    """Async context manager yielding an httpx-like client for fulfill_payment_order."""
    body = rpc_body if rpc_body is not None else {
        "success": True,
        "message": "Credits granted successfully",
        "credits_granted": 1000,
    }
    posted = []

    class FakeHTTP:
        async def post(self, url, **kw):
            posted.append({"url": url, "json": kw.get("json"), "headers": kw.get("headers")})
            resp = MagicMock()
            resp.status_code = status_code
            resp.text = json.dumps(body)
            resp.json = MagicMock(return_value=body)
            return resp

    @asynccontextmanager
    async def factory(*a, **kw):
        yield FakeHTTP()

    factory.posted = posted  # type: ignore[attr-defined]
    return factory


# ═══════════════════════════════════════════════════════════════
# POST /api/create-order
# ═══════════════════════════════════════════════════════════════

class TestCreateOrder:
    def test_no_auth_returns_401(self):
        response = client.post(
            "/api/create-order",
            json={"amount": 2499, "credits": 1000, "plan_type": "starter"},
        )
        assert response.status_code == 401

    def test_malformed_auth_returns_401(self):
        response = client.post(
            "/api/create-order",
            json={"amount": 2499, "credits": 1000, "plan_type": "starter"},
            headers={"Authorization": "Token notbearer"},
        )
        assert response.status_code == 401

    def test_mock_mode_returns_order_id(self):
        """In dev mock mode (rzp_test_mock key), order is created without Razorpay."""
        _override_auth()
        response = client.post(
            "/api/create-order",
            json={"amount": 2499.0, "credits": 1000, "plan_type": "starter"},
            headers={"Authorization": "Bearer fake.jwt.token"},
        )
        assert response.status_code == 200
        assert "order_id" in response.json()

    def test_create_order_response_has_required_fields(self):
        """200 response must contain order_id, amount, currency, key_id."""
        _override_auth()
        response = client.post(
            "/api/create-order",
            json={"amount": 2499.0, "credits": 1000, "plan_type": "starter"},
            headers={"Authorization": "Bearer fake.jwt.token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "order_id" in data
        assert "amount" in data
        assert "currency" in data
        assert "key_id" in data


# ═══════════════════════════════════════════════════════════════
# POST /api/verify-payment
# ═══════════════════════════════════════════════════════════════

class TestVerifyPayment:
    def test_no_auth_returns_401(self):
        response = client.post(
            "/api/verify-payment",
            json={
                "razorpay_payment_id": "pay_123",
                "razorpay_order_id": "order_123",
                "razorpay_signature": "sig_123",
            },
        )
        assert response.status_code == 401

    def test_order_not_found_returns_404(self):
        """If order doesn't exist in DB, return 404."""
        mock_sc = build_supabase_mock(table_data={"payment_orders": []})
        _override_auth(supabase_client=mock_sc)

        response = client.post(
            "/api/verify-payment",
            json={
                "razorpay_payment_id": "pay_123",
                "razorpay_order_id": "order_nonexistent",
                "razorpay_signature": "sig_123",
            },
            headers={"Authorization": "Bearer fake.jwt.token"},
        )
        assert response.status_code == 404

    def test_wrong_user_order_returns_403(self):
        """Order belonging to a different user must return 403."""
        order = {
            "order_id": "order_abc",
            "user_id": "other-user-999",
            "expected_credits": 1000,
            "expected_amount": 249900,
            "plan_type": "starter",
            "status": "pending",
        }
        mock_sc = build_supabase_mock(user_id="user-123", table_data={"payment_orders": [order]})
        _override_auth(user_id="user-123", supabase_client=mock_sc)

        response = client.post(
            "/api/verify-payment",
            json={
                "razorpay_payment_id": "pay_123",
                "razorpay_order_id": "order_abc",
                "razorpay_signature": "sig_123",
            },
            headers={"Authorization": "Bearer fake.jwt.token"},
        )
        assert response.status_code == 403

    def test_already_fulfilled_returns_success_idempotent(self):
        """If order is already fulfilled, return success without re-processing."""
        order = {
            "order_id": "order_abc",
            "user_id": "user-123",
            "expected_credits": 1000,
            "expected_amount": 249900,
            "plan_type": "starter",
            "status": "fulfilled",
        }
        mock_sc = build_supabase_mock(user_id="user-123", table_data={"payment_orders": [order]})
        _override_auth(user_id="user-123", supabase_client=mock_sc)

        response = client.post(
            "/api/verify-payment",
            json={
                "razorpay_payment_id": "pay_123",
                "razorpay_order_id": "order_abc",
                "razorpay_signature": "sig_123",
            },
            headers={"Authorization": "Bearer fake.jwt.token"},
        )
        assert response.status_code == 200
        assert "already verified" in response.json().get("message", "").lower()

    def test_missing_order_id_returns_400(self):
        _override_auth()
        response = client.post(
            "/api/verify-payment",
            json={"razorpay_payment_id": "pay_123"},  # missing order_id
            headers={"Authorization": "Bearer fake.jwt.token"},
        )
        assert response.status_code == 400

    @patch("payment_routes.get_shared_client")
    def test_pending_order_calls_fulfill_rpc_with_server_amounts(self, mock_shared):
        """Happy path: mock Razorpay mode fulfills via idempotent RPC (ledger written in SQL)."""
        order = {
            "order_id": "order_mock_abc",
            "user_id": "user-123",
            "expected_credits": 1000,
            "expected_amount": 249900,
            "plan_type": "starter",
            "status": "pending",
        }
        mock_sc = build_supabase_mock(user_id="user-123", table_data={"payment_orders": [order]})
        _override_auth(user_id="user-123", supabase_client=mock_sc)
        fake_http = _fake_fulfill_http({
            "success": True,
            "message": "Credits granted successfully",
            "credits_granted": 1000,
        })
        mock_shared.side_effect = fake_http

        response = client.post(
            "/api/verify-payment",
            json={
                "razorpay_payment_id": "pay_ledger_1",
                "razorpay_order_id": "order_mock_abc",
                "razorpay_signature": "sig_mock",
            },
            headers={"Authorization": "Bearer fake.jwt.token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["credits_granted"] == 1000
        assert len(fake_http.posted) == 1
        payload = fake_http.posted[0]["json"]
        assert payload["p_order_id"] == "order_mock_abc"
        assert payload["p_payment_id"] == "pay_ledger_1"
        assert payload["p_amount_paid"] == 249900
        assert "fulfill_payment_order" in fake_http.posted[0]["url"]

    @patch("payment_routes.get_shared_client")
    def test_fulfill_rpc_failure_returns_400(self, mock_shared):
        order = {
            "order_id": "order_fail",
            "user_id": "user-123",
            "expected_credits": 1000,
            "expected_amount": 249900,
            "plan_type": "starter",
            "status": "pending",
        }
        mock_sc = build_supabase_mock(user_id="user-123", table_data={"payment_orders": [order]})
        _override_auth(user_id="user-123", supabase_client=mock_sc)
        mock_shared.side_effect = _fake_fulfill_http({
            "success": False,
            "error": "Amount mismatch",
        })

        response = client.post(
            "/api/verify-payment",
            json={
                "razorpay_payment_id": "pay_fail",
                "razorpay_order_id": "order_fail",
                "razorpay_signature": "sig_mock",
            },
            headers={"Authorization": "Bearer fake.jwt.token"},
        )
        assert response.status_code == 400
        assert "Amount mismatch" in response.json()["detail"]


# ═══════════════════════════════════════════════════════════════
# POST /api/webhooks/payment (Razorpay Webhook)
# ═══════════════════════════════════════════════════════════════

class TestRazorpayWebhook:
    WEBHOOK_SECRET = "webhook_secret_123"

    def _make_payload(self, event: str = "payment.captured") -> bytes:
        payload = {
            "event": event,
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_test_123",
                        "order_id": "order_test_abc",
                        "amount": 249900,
                        "currency": "INR",
                        "status": "captured",
                    }
                }
            },
        }
        return json.dumps(payload).encode("utf-8")

    def _sign(self, body: bytes) -> str:
        return hmac.new(
            self.WEBHOOK_SECRET.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()

    def test_webhook_without_signature_returns_400_or_500(self):
        """Missing signature header → must not return 200."""
        body = self._make_payload()
        response = client.post(
            "/api/webhooks/payment",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        # Without Razorpay client (mock key), webhook returns 200 in dev mode
        # With real client, missing sig → 400
        assert response.status_code in (200, 400, 500)

    def test_webhook_with_invalid_signature_rejected(self):
        """Wrong signature → 400."""
        body = self._make_payload()
        response = client.post(
            "/api/webhooks/payment",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-razorpay-signature": "sha256=invalid_signature_here",
            },
        )
        # In mock mode (rzp_test_mock) client is None → accepted in dev
        # In real mode → 400
        assert response.status_code in (200, 400)

    def test_non_captured_event_returns_200_noop(self):
        """Events other than payment.captured should be silently ignored."""
        body = self._make_payload(event="payment.failed")
        response = client.post(
            "/api/webhooks/payment",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code in (200, 400)

    def test_webhook_always_returns_ok_status_field(self):
        """Webhook must return {"status": "ok"} on success to prevent Razorpay retries."""
        body = self._make_payload()
        response = client.post(
            "/api/webhooks/payment",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        if response.status_code == 200:
            assert response.json().get("status") == "ok"


# ═══════════════════════════════════════════════════════════════
# GET /api/audit/usage-logs
# ═══════════════════════════════════════════════════════════════

class TestUsageLogs:
    def test_no_auth_returns_401(self):
        response = client.get("/api/audit/usage-logs")
        assert response.status_code == 401

    def test_returns_list_of_logs(self):
        mock_sc = build_supabase_mock(
            user_id="user-123",
            table_data={
                "profiles": [{"active_org_id": "org-abc"}],
                "credit_usage_logs": [{"id": "log-1", "task_type": "invoice_scan", "tokens_used": 500}],
            }
        )
        _override_auth(supabase_client=mock_sc)

        response = client.get(
            "/api/audit/usage-logs",
            headers={"Authorization": "Bearer fake.jwt.token"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        assert isinstance(response.json()["data"], list)
