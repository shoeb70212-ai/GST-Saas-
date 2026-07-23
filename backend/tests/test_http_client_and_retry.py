"""Tests for shared httpx client + transient LLM retry filter."""
from __future__ import annotations

import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.mark.asyncio
async def test_shared_client_singleton_under_concurrent_create():
    from http_client import close_shared_client, get_shared_client

    await close_shared_client()

    async def _grab():
        async with get_shared_client() as client:
            return id(client)

    ids = await asyncio.gather(*[_grab() for _ in range(20)])
    assert len(set(ids)) == 1
    await close_shared_client()


@pytest.mark.asyncio
async def test_close_shared_client_idempotent():
    from http_client import close_shared_client, get_shared_client

    async with get_shared_client() as client:
        assert client is not None
    await close_shared_client()
    await close_shared_client()


def test_transient_llm_error_filter():
    from extraction import _is_transient_llm_error

    assert _is_transient_llm_error(TimeoutError("x")) is True
    assert _is_transient_llm_error(ConnectionError("x")) is True
    assert _is_transient_llm_error(ValueError("bad parse")) is False
    assert _is_transient_llm_error(RuntimeError("401 Unauthorized")) is False
    assert _is_transient_llm_error(Exception("model not found")) is False


def test_webhook_secret_requires_distinct_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("TESTING", "0")
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_live_x")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "same-secret")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "same-secret")

    import importlib
    import payment_routes

    with pytest.raises(RuntimeError, match="differ"):
        payment_routes._resolve_webhook_secret()
