"""Hermetic tests for GSTIN ops instrumentation (no PII in ops meta)."""
from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ["OPS_LOG_ENABLED"] = "true"
os.environ["OPS_LOG_SAMPLE_RATE"] = "1.0"
os.environ["GSTIN_API_KEY"] = "mock_key"

from tests.helpers import build_supabase_mock


@pytest.mark.asyncio
async def test_cache_hit_logs_suffix_only():
    import gstin_service as gs

    sc = build_supabase_mock(
        table_data={
            "gstin_cache": [
                {
                    "gstin": "27AADCB2230M1Z2",
                    "status": "Active",
                    "last_verified_at": "2099-01-01T00:00:00+00:00",
                    "legal_name": "Secret Name Pvt Ltd",
                }
            ]
        }
    )
    with patch("gstin_service.log_ops_event", new_callable=AsyncMock) as mock_log:
        status = await gs.verify_gstin(sc, "27AADCB2230M1Z2")
        assert status == "Active"
        mock_log.assert_awaited()
        kwargs = mock_log.await_args.kwargs
        assert kwargs["event_type"] == "gstin_cache_hit"
        blob = str(kwargs)
        assert "Secret Name" not in blob
        assert "27AADCB2230M1Z2" not in blob
        assert kwargs["meta"]["gstin_suffix"] == "M1Z2"


@pytest.mark.asyncio
async def test_invalid_gstin_short_circuits():
    import gstin_service as gs

    sc = build_supabase_mock()
    assert await gs.verify_gstin(sc, "SHORT") == "Invalid"
