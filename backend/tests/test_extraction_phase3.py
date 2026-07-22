"""Phase 3: difficulty router, disputed fields, targeted merge."""
from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")

import extraction_cache
from extraction_router import (
    better_result,
    build_targeted_prompt,
    classify_difficulty,
    disputed_fields,
    merge_targeted_fields,
    plan_route,
    prefer_targeted_reextract,
)
from preprocess import HYBRID_MIME


_OK_GSTIN = "27AADCB2230M1ZT"

_RICH_MD = (
    "| HSN | Description | Amount |\n|---|---|---|\n| 8471 | Widget | 1000 |\n"
    "| 9988 | Service | 500 |\n\n"
    "Tax Invoice GSTIN 27AAPFU0939F1ZV invoice taxable CGST SGST total amount qty rate\n"
    "Buyer details and payment terms appear below the table for length.\n"
)


@pytest.fixture(autouse=True)
def _clear_cache():
    extraction_cache.clear()
    yield
    extraction_cache.clear()


class TestClassify:
    def test_markdown_rich_is_easy(self):
        assert classify_difficulty("text/markdown", _RICH_MD) == "easy"

    def test_image_is_hard(self):
        assert classify_difficulty("image/jpeg", None) == "hard"

    def test_hybrid_is_hard(self):
        assert classify_difficulty(HYBRID_MIME, "thin text") == "hard"


class TestPlanRoute:
    def test_easy_uses_primary(self, monkeypatch):
        monkeypatch.setenv("EXTRACTION_ROUTING_ENABLED", "1")
        monkeypatch.setenv("ROUTING_USE_GEMINI_FOR_HARD", "0")
        import extraction_router as er

        monkeypatch.setattr(er, "ROUTING_ENABLED", True)
        monkeypatch.setattr(er, "ROUTING_USE_GEMINI_FOR_HARD", False)
        plan = plan_route("text/markdown", _RICH_MD)
        assert plan.tier == "easy"
        assert plan.first_pass == "primary"

    def test_hard_skips_to_verify(self, monkeypatch):
        import extraction_router as er

        monkeypatch.setattr(er, "ROUTING_ENABLED", True)
        monkeypatch.setattr(er, "ROUTING_USE_GEMINI_FOR_HARD", False)
        plan = plan_route("image/png", None)
        assert plan.tier == "hard"
        assert plan.first_pass == "verify"

    def test_hard_gemini_when_flagged(self, monkeypatch):
        import extraction_router as er

        monkeypatch.setattr(er, "ROUTING_ENABLED", True)
        monkeypatch.setattr(er, "ROUTING_USE_GEMINI_FOR_HARD", True)
        plan = plan_route("image/png", None)
        assert plan.first_pass == "gemini"


class TestDisputedAndTargeted:
    def test_disputed_missing_fields(self):
        data = {
            "Supplier_GSTIN": "BAD",
            "Invoice_Number": None,
            "Invoice_Date": "01-01-2024",
            "Total_Amount": 100,
        }
        d = disputed_fields(data, text_layer=None)
        assert "Invoice_Number" in d
        assert "Supplier_GSTIN" in d

    def test_prefer_targeted_on_review(self):
        data = {
            "Extraction_State": "needs_review",
            "Confidence_Score": 88,
            "Supplier_GSTIN": _OK_GSTIN,
            "Invoice_Number": None,
            "Invoice_Date": "01-01-2024",
            "Total_Amount": 1180,
            "Taxable_Amount": 1000,
        }
        assert prefer_targeted_reextract(data, None) is True

    def test_no_targeted_on_retry(self):
        data = {
            "Extraction_State": "needs_retry",
            "Confidence_Score": 40,
            "Invoice_Number": None,
        }
        assert prefer_targeted_reextract(data, None) is False

    def test_merge_targeted_only_listed(self):
        base = {"Invoice_Number": "OLD", "Total_Amount": 1, "Supplier_Name": "Keep"}
        patch = {"Invoice_Number": "NEW", "Total_Amount": 99, "Supplier_Name": "Nope"}
        merged = merge_targeted_fields(base, patch, ["Invoice_Number"])
        assert merged["Invoice_Number"] == "NEW"
        assert merged["Total_Amount"] == 1
        assert merged["Supplier_Name"] == "Keep"
        assert merged["Targeted_Reextract"] is True

    def test_build_targeted_prompt_lists_fields(self):
        p = build_targeted_prompt("BASE", ["Invoice_Number", "Total_Amount"])
        assert "Invoice_Number" in p
        assert "Targeted re-extraction" in p

    def test_better_result_prefers_auto_accepted(self):
        assert better_result(
            {"Extraction_State": "auto_accepted", "Confidence_Score": 95},
            {"Extraction_State": "needs_review", "Confidence_Score": 88},
        )


@pytest.mark.asyncio
async def test_hard_image_starts_with_verify():
    """Hard docs skip mini — first call is verify model."""
    import extraction as ext

    good = {
        "Supplier_GSTIN": _OK_GSTIN,
        "Supplier_Name": "Good Co",
        "Invoice_Number": "INV-9",
        "Invoice_Date": "01-01-2024",
        "Total_Amount": 1180.0,
        "Buyer_GSTIN": "27AADCB1234M1Z1",
        "Line_Items": [{"Amount": 1000.0, "Tax_Rate": 18.0}],
        "Cess_Amount": None,
        "Round_Off": None,
    }
    calls = []

    async def fake_parse(ai_client, model, prompt, messages_content):
        calls.append(model)
        return good, 5

    with (
        patch.object(ext, "client", MagicMock()),
        patch.object(ext, "AI_MODEL_PRIMARY", "gpt-4o-mini"),
        patch.object(ext, "AI_MODEL_VERIFY", "gpt-4o"),
        patch.object(ext, "_parse_with_model", side_effect=fake_parse),
        patch("extraction_router.ROUTING_ENABLED", True),
        patch("extraction_router.ROUTING_USE_GEMINI_FOR_HARD", False),
    ):
        data, _ = await ext.run_ai_extraction(b"fake-hard-route", "image/jpeg")

    assert calls[0] == "gpt-4o"
    assert data.get("Route_Tier") == "hard"
    assert data["Extraction_State"] == "auto_accepted"


@pytest.mark.asyncio
async def test_easy_markdown_starts_with_mini_then_verify_on_retry():
    import extraction as ext

    primary = {
        "Supplier_GSTIN": "INVALID",
        "Supplier_Name": None,
        "Invoice_Number": None,
        "Invoice_Date": None,
        "Total_Amount": None,
        "Line_Items": [],
    }
    verify = {
        "Supplier_GSTIN": _OK_GSTIN,
        "Supplier_Name": "Good Co",
        "Invoice_Number": "INV-9",
        "Invoice_Date": "01-01-2024",
        "Total_Amount": 1180.0,
        "Buyer_GSTIN": "27AADCB1234M1Z1",
        "Line_Items": [{"Amount": 1000.0, "Tax_Rate": 18.0}],
        "Cess_Amount": None,
        "Round_Off": None,
    }
    calls = []

    async def fake_parse(ai_client, model, prompt, messages_content):
        calls.append(model)
        if "mini" in (model or ""):
            return primary, 10
        return verify, 20

    with (
        patch.object(ext, "client", MagicMock()),
        patch.object(ext, "AI_MODEL_PRIMARY", "gpt-4o-mini"),
        patch.object(ext, "AI_MODEL_VERIFY", "gpt-4o"),
        patch.object(ext, "_parse_with_model", side_effect=fake_parse),
        patch("extraction_router.ROUTING_ENABLED", True),
        patch("extraction_router.ROUTING_USE_GEMINI_FOR_HARD", False),
    ):
        data, tokens = await ext.run_ai_extraction(_RICH_MD, "text/markdown")

    assert calls[0] == "gpt-4o-mini"
    assert "gpt-4o" in calls[1]
    assert data["Extraction_State"] == "auto_accepted"
    assert tokens == 30
    assert data.get("Route_Tier") == "easy"


@pytest.mark.asyncio
async def test_targeted_reextract_on_needs_review():
    import extraction as ext

    # Image path → no text grounding noise; only Invoice_Number disputed → targeted.
    first = {
        "Supplier_GSTIN": _OK_GSTIN,
        "Supplier_Name": "Good Co",
        "Invoice_Number": None,
        "Invoice_Date": "01-01-2024",
        "Total_Amount": 1180.0,
        "Taxable_Amount": 1000.0,
        "CGST_Amount": 90.0,
        "SGST_Amount": 90.0,
        "Buyer_GSTIN": "27AADCB1234M1Z1",
        "Line_Items": [{"Amount": 1000.0, "Tax_Rate": 18.0}],
        "Cess_Amount": None,
        "Round_Off": None,
    }
    patch_pass = dict(first)
    patch_pass["Invoice_Number"] = "INV-FIXED"

    calls = []

    async def fake_parse(ai_client, model, prompt, messages_content):
        calls.append((model, "targeted" if "Targeted re-extraction" in prompt else "full"))
        if "Targeted re-extraction" in prompt:
            return patch_pass, 8
        return first, 12

    with (
        patch.object(ext, "client", MagicMock()),
        patch.object(ext, "AI_MODEL_PRIMARY", "gpt-4o-mini"),
        patch.object(ext, "AI_MODEL_VERIFY", "gpt-4o"),
        patch.object(ext, "_parse_with_model", side_effect=fake_parse),
        patch("extraction_router.ROUTING_ENABLED", True),
        patch("extraction_router.ROUTING_USE_GEMINI_FOR_HARD", False),
    ):
        data, _ = await ext.run_ai_extraction(b"fake-targeted", "image/jpeg")

    assert any(kind == "targeted" for _, kind in calls), calls
    assert data.get("Invoice_Number") == "INV-FIXED"
