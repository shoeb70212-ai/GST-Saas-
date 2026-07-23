"""Unit tests for bridge_auth + fingerprint idempotency."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("TESTING", "1")
os.environ.setdefault("BRIDGE_JWT_SECRET", "test-bridge-jwt-secret")

from bridge_auth import (
    BRIDGE_AUD,
    create_device_token,
    generate_device_secret,
    hash_device_secret,
    job_fingerprint,
    verify_device_secret,
    verify_device_token,
)
from fastapi import HTTPException
import pytest


def test_secret_roundtrip():
    s = generate_device_secret()
    h = hash_device_secret(s)
    assert verify_device_secret(s, h)
    assert not verify_device_secret("wrong", h)


def test_device_token_claims():
    token, exp = create_device_token(device_id="d1", user_id="u1", org_id="o1", ttl_seconds=60)
    claims = verify_device_token(token)
    assert claims["aud"] == BRIDGE_AUD
    assert claims["sub"] == "d1"
    assert claims["uid"] == "u1"
    assert claims["oid"] == "o1"
    assert claims["exp"] == exp


def test_device_token_rejects_bad_sig():
    token, _ = create_device_token(device_id="d1", user_id="u1", org_id="o1")
    with pytest.raises(HTTPException):
        verify_device_token(token + "x")


def test_fingerprint_stable():
    a = job_fingerprint(client_id="c1", xml="<ENVELOPE/>", source="invoices")
    b = job_fingerprint(client_id="c1", xml="<ENVELOPE/>", source="invoices")
    c = job_fingerprint(client_id="c1", xml="<ENVELOPE>x</ENVELOPE>", source="invoices")
    assert a == b
    assert a != c
