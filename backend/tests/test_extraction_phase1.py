"""Phase 1 extraction hardening: cache, field confidence, cost, pinned decode."""
from __future__ import annotations

import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")

import extraction_cache
from extraction_meta import (
    attach_scan_meta,
    compute_field_confidence,
    estimate_cost_inr,
    value_grounded_in_text,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    extraction_cache.clear()
    yield
    extraction_cache.clear()


class TestCostEstimate:
    def test_tokens_to_inr(self):
        assert estimate_cost_inr(0) == 0.0
        assert estimate_cost_inr(1000, inr_per_1k=0.025) == 0.025
        assert estimate_cost_inr(4000, inr_per_1k=0.025) == 0.1


class TestFieldConfidence:
    def test_grounding_in_markdown(self):
        text = "Tax Invoice\nGSTIN: 27AAPFU0939F1ZV\nInvoice No: INV-99\nTotal: 1180.00"
        assert value_grounded_in_text("27AAPFU0939F1ZV", text) is True
        assert value_grounded_in_text("INV-99", text) is True
        assert value_grounded_in_text(1180.0, text) is True
        assert value_grounded_in_text("MISSING", text) is False
        assert value_grounded_in_text("INV-99", None) is None

    def test_compute_field_confidence_avg(self):
        data = {
            "Supplier_GSTIN": "27AAPFU0939F1ZV",
            "Invoice_Number": "INV-1",
            "Invoice_Date": "01-01-2024",
            "Taxable_Amount": 1000,
            "CGST_Amount": 90,
            "SGST_Amount": 90,
            "IGST_Amount": None,
            "Total_Amount": 1180,
        }
        text = "27AAPFU0939F1ZV INV-1 01-01-2024 1000 90 1180"
        fc = compute_field_confidence(data, text_layer=text)
        assert fc["text_layer_available"] is True
        assert fc["fields"]["Supplier_GSTIN"]["grounded_in_text"] is True
        assert fc["avg_critical_score"] > 0.5


class TestCache:
    def test_put_get_roundtrip(self):
        key = extraction_cache.make_cache_key(
            content=b"abc",
            mime_type="image/jpeg",
            primary_model="openai/gpt-4o-mini",
            verify_model="openai/gpt-4o",
            prompt_version="v1",
        )
        extraction_cache.put(key, {"Invoice_Number": "X"}, 42)
        hit = extraction_cache.get(key)
        assert hit is not None
        data, tokens = hit
        assert data["Invoice_Number"] == "X"
        assert tokens == 42

    def test_key_changes_with_prompt_version(self):
        a = extraction_cache.make_cache_key(
            content=b"abc",
            mime_type="image/jpeg",
            primary_model="m1",
            verify_model="m2",
            prompt_version="v1",
        )
        b = extraction_cache.make_cache_key(
            content=b"abc",
            mime_type="image/jpeg",
            primary_model="m1",
            verify_model="m2",
            prompt_version="v2",
        )
        assert a != b


class TestAttachMeta:
    def test_attach_scan_meta(self):
        data = {
            "Supplier_GSTIN": "27AAPFU0939F1ZV",
            "Invoice_Number": "1",
            "Invoice_Date": "01-01-2024",
            "Total_Amount": 100,
            "Confidence_Score": 90,
            "Extraction_State": "needs_review",
            "Extraction_Model": "test",
        }
        attach_scan_meta(
            data,
            tokens=2000,
            cache_hit=False,
            text_layer=None,
            prompt_version="v1",
            latency_ms=120,
        )
        assert data["Estimated_Cost_INR"] == estimate_cost_inr(2000)
        assert data["Scan_Meta"]["cache_hit"] is False
        assert "Field_Confidence" in data


@pytest.mark.asyncio
async def test_run_ai_extraction_cache_hit():
    import extraction as ext

    payload = {
        "Supplier_GSTIN": "27AAPFU0939F1ZV",
        "Supplier_Name": "Acme",
        "Invoice_Number": "INV-1",
        "Invoice_Date": "01-01-2024",
        "Total_Amount": 1180.0,
        "Taxable_Amount": 1000.0,
        "CGST_Amount": 90.0,
        "SGST_Amount": 90.0,
        "Line_Items": [],
        "Confidence_Score": 100,
        "Extraction_State": "auto_accepted",
        "Extraction_Model": "openai/gpt-4o-mini",
        "financial_ok": True,
    }

    async def fake_parse(*_a, **_k):
        return dict(payload), 111

    with patch.object(ext, "client", MagicMock()), patch.object(
        ext, "AI_MODEL_PRIMARY", "openai/gpt-4o-mini"
    ), patch.object(ext, "AI_MODEL_VERIFY", "openai/gpt-4o"), patch.object(
        ext, "_parse_with_model", side_effect=fake_parse
    ), patch.object(ext, "EXTRACTION_CACHE_ENABLED", True):
        d1, t1 = await ext.run_ai_extraction("md text with 27AAPFU0939F1ZV INV-1 1180", "text/markdown")
        assert t1 == 111
        assert d1.get("Cache_Hit") is False
        d2, t2 = await ext.run_ai_extraction("md text with 27AAPFU0939F1ZV INV-1 1180", "text/markdown")
        assert t2 == 111
        assert d2.get("Cache_Hit") is True
        assert d2.get("Scan_Meta", {}).get("cache_hit") is True


@pytest.mark.asyncio
async def test_parse_with_model_passes_temperature_zero():
    import extraction as ext

    mock_client = MagicMock()
    parsed = MagicMock()
    parsed.model_dump.return_value = {"Invoice_Number": "1"}
    choice = MagicMock()
    choice.message.parsed = parsed
    resp = MagicMock()
    resp.choices = [choice]
    resp.usage.total_tokens = 10
    mock_client.beta.chat.completions.parse = AsyncMock(return_value=resp)

    data, tokens = await ext._parse_with_model(mock_client, "m", "prompt", [{"type": "text", "text": "x"}])
    assert data["Invoice_Number"] == "1"
    assert tokens == 10
    kwargs = mock_client.beta.chat.completions.parse.await_args.kwargs
    assert kwargs["temperature"] == 0.0 or kwargs["temperature"] == 0
    assert kwargs["max_tokens"] == ext.LLM_MAX_TOKENS
