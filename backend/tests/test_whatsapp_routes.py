"""
Tests for /api/whatsapp/webhook endpoints.

Critical security: HMAC signature validation must be enforced.
Fail-closed behavior: missing META_APP_SECRET must reject all requests.
"""
import hmac
import hashlib
import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
import sys, os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("META_WEBHOOK_VERIFY_TOKEN", "test_verify_token_123")
os.environ.setdefault("META_APP_SECRET", "test_app_secret_abc")

from main import app

# Patch module-level attributes AFTER import so TestClient picks them up
import whatsapp_routes as _wr
_wr.WEBHOOK_VERIFY_TOKEN = "test_verify_token_123"
_wr.META_APP_SECRET = "test_app_secret_abc"

client = TestClient(app)


def _sign_payload(body: bytes, secret: str = "test_app_secret_abc") -> str:
    return "sha256=" + hmac.new(
        secret.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()


# ═══════════════════════════════════════════════════════════════
# GET /api/whatsapp/webhook — verification challenge
# ═══════════════════════════════════════════════════════════════

class TestWebhookVerification:
    def test_valid_verify_token_returns_challenge(self):
        response = client.get(
            "/api/whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "test_verify_token_123",
                "hub.challenge": "challenge_abc_789",
            },
        )
        assert response.status_code == 200
        assert response.text == "challenge_abc_789"

    def test_wrong_verify_token_returns_403(self):
        response = client.get(
            "/api/whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "WRONG_TOKEN",
                "hub.challenge": "challenge_xyz",
            },
        )
        assert response.status_code == 403

    def test_missing_challenge_still_verified(self):
        response = client.get(
            "/api/whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "test_verify_token_123",
                "hub.challenge": "",
            },
        )
        # Returns empty challenge string — still 200 since token matched
        assert response.status_code == 200

    def test_wrong_mode_returns_403(self):
        response = client.get(
            "/api/whatsapp/webhook",
            params={
                "hub.mode": "unsubscribe",
                "hub.verify_token": "test_verify_token_123",
                "hub.challenge": "challenge_abc",
            },
        )
        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════
# POST /api/whatsapp/webhook — message ingestion
# ═══════════════════════════════════════════════════════════════

class TestWebhookIngestion:
    def _make_message_payload(self, msg_type: str = "image") -> dict:
        return {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "919876543210",
                            "type": msg_type,
                            msg_type: {"id": "media_id_123", "mime_type": "image/jpeg"},
                        }]
                    }
                }]
            }]
        }

    def test_missing_signature_header_returns_403(self):
        """No X-Hub-Signature-256 header → 403 (fail-closed)."""
        payload = json.dumps(self._make_message_payload()).encode()
        response = client.post(
            "/api/whatsapp/webhook",
            content=payload,
            headers={"Content-Type": "application/json"},
            # No X-Hub-Signature-256 header
        )
        assert response.status_code == 403

    def test_invalid_signature_returns_403(self):
        """Wrong HMAC signature → 403."""
        payload = json.dumps(self._make_message_payload()).encode()
        response = client.post(
            "/api/whatsapp/webhook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": "sha256=deadbeefdeadbeef",
            },
        )
        assert response.status_code == 403

    def test_valid_signature_returns_200(self):
        """Correctly signed payload → 200 OK."""
        payload = json.dumps(self._make_message_payload()).encode()
        sig = _sign_payload(payload)
        response = client.post(
            "/api/whatsapp/webhook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": sig,
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_valid_signature_pdf_message_returns_200(self):
        payload = json.dumps(self._make_message_payload("document")).encode()
        sig = _sign_payload(payload)
        response = client.post(
            "/api/whatsapp/webhook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": sig,
            },
        )
        assert response.status_code == 200

    def test_invalid_json_returns_400(self):
        """Malformed JSON body → 400."""
        bad_payload = b"NOT_VALID_JSON{{{"
        sig = _sign_payload(bad_payload)
        response = client.post(
            "/api/whatsapp/webhook",
            content=bad_payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": sig,
            },
        )
        assert response.status_code == 400

    def test_empty_entry_array_returns_200_noop(self):
        """Empty entry array → 200 with no processing (not a crash)."""
        payload = json.dumps({"entry": []}).encode()
        sig = _sign_payload(payload)
        response = client.post(
            "/api/whatsapp/webhook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": sig,
            },
        )
        assert response.status_code == 200

    def test_status_message_returns_200_no_crash(self):
        """Delivery status messages (no 'messages' key) must not crash."""
        payload = json.dumps({
            "entry": [{
                "changes": [{
                    "value": {
                        "statuses": [{"id": "wamid.123", "status": "delivered"}]
                        # No 'messages' key
                    }
                }]
            }]
        }).encode()
        sig = _sign_payload(payload)
        response = client.post(
            "/api/whatsapp/webhook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": sig,
            },
        )
        assert response.status_code == 200

    def test_secret_not_configured_returns_500_not_200(self):
        """
        If META_APP_SECRET is not set, the endpoint must fail-closed (500/403),
        not silently accept all webhooks.
        """
        payload = json.dumps(self._make_message_payload()).encode()
        sig = _sign_payload(payload)

        with patch.dict(os.environ, {"META_APP_SECRET": ""}):
            # Reload the module attribute
            import whatsapp_routes
            original = whatsapp_routes.META_APP_SECRET
            whatsapp_routes.META_APP_SECRET = None
            try:
                response = client.post(
                    "/api/whatsapp/webhook",
                    content=payload,
                    headers={
                        "Content-Type": "application/json",
                        "X-Hub-Signature-256": sig,
                    },
                )
                # Must NOT return 200 when secret is unconfigured
                assert response.status_code in (403, 500)
            finally:
                whatsapp_routes.META_APP_SECRET = original
