"""Unit tests for support session metadata helpers and public upload HMAC secret."""
import os
import time
from types import SimpleNamespace

import pytest

from support_session import (
    is_support_session_active,
    merge_support_metadata,
    strip_support_metadata,
    support_session_needs_clear,
)
from public_upload_tokens import (
    create_public_upload_token,
    verify_public_upload_token,
    _token_secret,
)


def test_merge_and_strip_support_metadata():
    merged = merge_support_metadata({"tier": "pro"}, admin_user_id="admin-1", ttl_seconds=120)
    assert merged["tier"] == "pro"
    assert merged["is_support_session"] is True
    assert merged["support_opened_by"] == "admin-1"
    assert int(merged["support_session_expires_at"]) >= int(time.time())

    cleared = strip_support_metadata(merged)
    assert "is_support_session" not in cleared
    assert "support_session_expires_at" not in cleared
    assert cleared["tier"] == "pro"


def test_is_support_session_active_respects_expiry():
    user = SimpleNamespace(
        app_metadata={
            "is_support_session": True,
            "support_session_expires_at": int(time.time()) - 10,
        }
    )
    assert is_support_session_active(user) is False
    assert support_session_needs_clear(user) is True

    user.app_metadata["support_session_expires_at"] = int(time.time()) + 600
    assert is_support_session_active(user) is True
    assert support_session_needs_clear(user) is False


def test_public_upload_secret_rejects_service_key_fallback(monkeypatch):
    monkeypatch.delenv("PUBLIC_UPLOAD_TOKEN_SECRET", raising=False)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-should-not-be-used")
    with pytest.raises(RuntimeError, match="PUBLIC_UPLOAD_TOKEN_SECRET"):
        _token_secret()


def test_public_upload_token_roundtrip(monkeypatch):
    monkeypatch.setenv("PUBLIC_UPLOAD_TOKEN_SECRET", "unit-test-secret")
    token, exp = create_public_upload_token("client-abc", ttl_seconds=60)
    assert exp > int(time.time())
    verify_public_upload_token("client-abc", token)
