"""
Hermetic tests for ops_log helpers and extraction failure instrumentation.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ["OPS_LOG_ENABLED"] = "true"
os.environ["OPS_LOG_SAMPLE_RATE"] = "1.0"

from ops_log import (
    build_ops_ctx,
    field_presence_flags,
    log_extraction_quality,
    log_ops_event,
    ops_log_enabled,
    sanitize_ops_filename,
    truncate_message,
)
from tests.helpers import build_supabase_mock


class TestOpsLogHelpers:
    def test_truncate_message(self):
        assert truncate_message(None) is None
        assert truncate_message("short") == "short"
        long = "x" * 600
        out = truncate_message(long, max_len=50)
        assert len(out) == 50
        assert out.endswith("...")

    def test_sanitize_filename_strips_path_chars(self):
        clean = sanitize_ops_filename("../../secret invoice (1).pdf")
        assert ".." not in clean
        assert "(" not in clean
        assert clean.endswith(".pdf") or "pdf" in clean

    def test_field_presence_flags_no_financial_values(self):
        data = {
            "Supplier_GSTIN": "27AADCB2230M1Z2",
            "Supplier_Name": "Acme",
            "Invoice_Number": "INV-1",
            "Total_Amount": 1180.0,
            "Taxable_Amount": 1000.0,
            "Line_Items": [{"Amount": 1000}],
        }
        flags = field_presence_flags(data)
        assert flags["has_supplier_gstin"] is True
        assert flags["has_total_amount"] is True
        assert flags["has_line_items"] is True
        assert flags["line_item_count"] == 1
        # Must never leak actual amounts / GSTIN / names
        blob = str(flags)
        assert "1180" not in blob
        assert "27AADCB" not in blob
        assert "Acme" not in blob
        assert "INV-1" not in blob

    def test_build_ops_ctx(self):
        ctx = build_ops_ctx(
            "scan",
            user_id="u1",
            file_name="bill #2.pdf",
            mime_type="application/pdf",
        )
        assert ctx["channel"] == "scan"
        assert ctx["user_id"] == "u1"
        assert ctx["mime_type"] == "application/pdf"
        assert "#" not in (ctx["file_name_sanitized"] or "")


class TestLogOpsEventWrite:
    @pytest.mark.asyncio
    async def test_log_ops_event_inserts_row(self):
        sc = build_supabase_mock()
        ok = await log_ops_event(
            severity="error",
            event_type="ai_failure",
            channel="scan",
            user_id="user-1",
            message="boom " * 200,
            model_used="gpt-4o-mini",
            latency_ms=123,
            meta={"has_supplier_gstin": False},
            supabase_client=sc,
        )
        assert ok is True
        inserts = [row for tbl, row in sc.insert_called_with if tbl == "ops_events"]
        assert len(inserts) == 1
        row = inserts[0]
        assert row["severity"] == "error"
        assert row["event_type"] == "ai_failure"
        assert row["channel"] == "scan"
        assert row["user_id"] == "user-1"
        assert len(row["message"]) <= 500
        assert "Total_Amount" not in row
        assert row["meta"]["has_supplier_gstin"] is False

    @pytest.mark.asyncio
    async def test_meta_accepts_credit_outcome(self):
        sc = build_supabase_mock()
        ok = await log_ops_event(
            severity="error",
            event_type="channel_exception",
            channel="batch",
            message="ai failed",
            meta={"credit_outcome": "refunded", "refunded": True},
            supabase_client=sc,
        )
        assert ok is True
        row = sc.insert_called_with[-1][1]
        assert row["meta"]["credit_outcome"] == "refunded"

    @pytest.mark.asyncio
    async def test_disabled_skips_write(self, monkeypatch):
        monkeypatch.setenv("OPS_LOG_ENABLED", "false")
        # Re-read enabled flag via module function
        assert ops_log_enabled() is False
        sc = build_supabase_mock()
        ok = await log_ops_event(
            severity="error",
            event_type="ai_failure",
            channel="scan",
            message="should not write",
            supabase_client=sc,
        )
        assert ok is False
        assert sc.insert_called_with == []
        monkeypatch.setenv("OPS_LOG_ENABLED", "true")

    @pytest.mark.asyncio
    async def test_log_extraction_quality_needs_retry(self):
        ctx = build_ops_ctx("batch", user_id="u1")
        data = {
            "Extraction_State": "needs_retry",
            "Confidence_Score": 20,
            "Extraction_Model": "gpt-4o-mini",
            "Escalated": True,
            "Supplier_GSTIN": None,
            "Line_Items": [],
        }
        with patch("ops_log.log_ops_event", new_callable=AsyncMock) as mock_log:
            await log_extraction_quality(ctx, data, tokens_used=42, latency_ms=99)
            types = {c.kwargs.get("event_type") for c in mock_log.await_args_list}
            assert "needs_retry" in types
            assert "escalated_to_verify" in types


class TestExtractionFailureCallsOpsLog:
    @pytest.mark.asyncio
    async def test_ai_failure_logs_ops_event(self):
        import extraction as ext

        async def boom(*_a, **_k):
            raise RuntimeError("primary down")

        ops_ctx = build_ops_ctx("scan", user_id="u-ops", file_name="x.pdf")

        with (
            patch.object(ext, "client", MagicMock()),
            patch.object(ext, "AI_MODEL_PRIMARY", "gpt-4o-mini"),
            patch.object(ext, "gemini_client", None),
            patch.object(ext, "_parse_with_model", side_effect=boom),
            patch("extraction.log_from_ctx", new_callable=AsyncMock) as mock_log,
        ):
            with pytest.raises(Exception):
                await ext.run_ai_extraction(b"fake", "image/jpeg", ops_ctx=ops_ctx)

            assert mock_log.await_count >= 1
            event_types = [c.kwargs.get("event_type") for c in mock_log.await_args_list]
            assert "ai_primary_failure" in event_types or "ai_failure" in event_types

    @pytest.mark.asyncio
    async def test_needs_retry_outcome_logs_quality(self):
        import extraction as ext

        primary = {
            "Supplier_GSTIN": "INVALID",
            "Supplier_Name": None,
            "Invoice_Number": None,
            "Invoice_Date": None,
            "Total_Amount": None,
            "Line_Items": [],
        }

        async def fake_parse(ai_client, model, prompt, messages_content):
            return primary, 10

        ops_ctx = build_ops_ctx("public", user_id="u2")

        with (
            patch.object(ext, "client", MagicMock()),
            patch.object(ext, "AI_MODEL_PRIMARY", "gpt-4o-mini"),
            patch.object(ext, "AI_MODEL_VERIFY", None),
            patch.object(ext, "gemini_client", None),
            patch.object(ext, "_parse_with_model", side_effect=fake_parse),
            patch("extraction.log_extraction_quality", new_callable=AsyncMock) as mock_q,
        ):
            data, tokens = await ext.run_ai_extraction(
                b"x", "image/jpeg", ops_ctx=ops_ctx
            )
            assert tokens == 10
            assert data.get("Extraction_State") == "needs_retry"
            mock_q.assert_awaited()
