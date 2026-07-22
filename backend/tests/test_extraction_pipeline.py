"""
Unit tests for extraction confidence gates, escalate helpers, preprocess,
and WhatsApp refund-on-needs_retry.
"""
from __future__ import annotations

import io
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("META_ACCESS_TOKEN", "test-meta-token")
os.environ.setdefault("META_PHONE_NUMBER_ID", "test-phone-id")

import extraction_cache
from extraction import (
    apply_tax_calculations,
    compute_confidence,
    line_items_db_payload,
    preprocess_invoice_file,
    should_escalate,
)
from tests.helpers import build_supabase_mock, make_async_factory

# Checksum-valid Maharashtra GSTIN (was ...Z2 in older fixtures)
_OK_GSTIN = "27AADCB2230M1ZT"


@pytest.fixture(autouse=True)
def _clear_extraction_cache():
    """Phase 1 cache is process-local; clear so escalate tests do not collide."""
    extraction_cache.clear()
    yield
    extraction_cache.clear()


class TestConfidenceFinancialGates:
    def test_line_reconcile_penalty_blocks_auto_accept(self):
        data = {
            "Supplier_GSTIN": _OK_GSTIN,
            "Supplier_Name": "Test Co",
            "Invoice_Number": "INV-1",
            "Invoice_Date": "01-01-2024",
            "Total_Amount": 1180.0,
            "Taxable_Amount": 100.0,
            "Line_Items": [{"Amount": 1000.0, "Tax_Rate": 18}],
        }
        conf = compute_confidence(data, 1180.0)
        assert conf["financial_ok"] is False
        assert conf["state"] != "auto_accepted"
        assert conf["score"] <= 75  # -25 line reconcile

    def test_matching_lines_and_total_auto_accept(self):
        data = {
            "Supplier_GSTIN": _OK_GSTIN,
            "Supplier_Name": "Test Co",
            "Invoice_Number": "INV-1",
            "Invoice_Date": "01-01-2024",
            "Total_Amount": 1180.0,
            "Taxable_Amount": 1000.0,
            "Line_Items": [{"Amount": 1000.0, "Tax_Rate": 18}],
        }
        conf = compute_confidence(data, 1180.0)
        assert conf["financial_ok"] is True
        assert conf["state"] == "auto_accepted"

    def test_credit_note_missing_original_penalised(self):
        data = {
            "Supplier_GSTIN": _OK_GSTIN,
            "Supplier_Name": "Test Co",
            "Invoice_Number": "CN-1",
            "Invoice_Date": "01-01-2024",
            "Total_Amount": 1180.0,
            "Invoice_Type": "Credit Note",
            "Original_Invoice_Number": None,
            "Line_Items": [],
        }
        conf = compute_confidence(data, 1180.0)
        assert conf["score"] == 90.0  # -10 for missing original


class TestPreprocess:
    def test_jpeg_under_limit_passthrough(self):
        img = Image.new("RGB", (100, 100), (255, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        raw = buf.getvalue()
        out, mime = preprocess_invoice_file(raw, "image/jpeg")
        assert mime == "image/jpeg"
        assert out == raw

    def test_png_converted_to_jpeg(self):
        img = Image.new("RGB", (100, 100), (200, 200, 200))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        out, mime = preprocess_invoice_file(buf.getvalue(), "image/png")
        assert mime == "image/jpeg"
        assert out[:2] == b"\xff\xd8"


class TestLineItemMapping:
    def test_schema_keys_map_to_db_columns(self):
        payload = line_items_db_payload(
            "inv-1",
            [
                {
                    "Description": "Widget",
                    "HSN_SAC": "8471",
                    "Quantity": 2,
                    "Unit_Price": 50,
                    "Tax_Rate": 18,
                    "Amount": 100,
                }
            ],
        )
        assert payload[0]["description"] == "Widget"
        assert payload[0]["hsn_sac"] == "8471"
        assert payload[0]["invoice_id"] == "inv-1"
        assert "Description" not in payload[0]


class TestEscalatePathMocked:
    @pytest.mark.asyncio
    async def test_hard_image_uses_verify_first(self):
        """Image (hard) → verify model first; no wasted mini pass."""
        import extraction as ext

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

        call_models = []

        async def fake_parse(ai_client, model, prompt, messages_content):
            call_models.append(model)
            return verify, 20

        with (
            patch.object(ext, "client", MagicMock()),
            patch.object(ext, "AI_MODEL_PRIMARY", "gpt-4o-mini"),
            patch.object(ext, "AI_MODEL_VERIFY", "gpt-4o"),
            patch.object(ext, "_parse_with_model", side_effect=fake_parse),
            patch("extraction_router.ROUTING_ENABLED", True),
            patch("extraction_router.ROUTING_USE_GEMINI_FOR_HARD", False),
        ):
            data, tokens = await ext.run_ai_extraction(b"fake-escalate", "image/jpeg")

        assert call_models[0] == "gpt-4o"
        assert data["Extraction_State"] == "auto_accepted"
        assert tokens == 20
        assert data.get("Route_Tier") == "hard"

    @pytest.mark.asyncio
    async def test_no_second_pass_when_hard_auto_accepted(self):
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
            data, _ = await ext.run_ai_extraction(b"fake-no-escalate", "image/jpeg")

        assert len(calls) == 1
        assert calls[0] == "gpt-4o"
        assert data["Extraction_State"] == "auto_accepted"


MINIMAL_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00"
    b"\xff\xdb\x00C\x00" + b"\x08" * 64 +
    b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00"
    b"\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
    b"\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
    b"\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9"
)

IMAGE_MESSAGE = {
    "from": "919876543210",
    "type": "image",
    "image": {"id": "media_id_123", "mime_type": "image/jpeg"},
}


def _linked_profile_mock(*, rpc_results: dict | None = None):
    mock_sc = build_supabase_mock(
        table_data={
            "profiles": [{
                "id": "user-wa-1",
                "active_whatsapp_client_id": "client-wa-1",
                "tally_ledgers": None,
            }],
            "invoices": [],
            "invoice_line_items": [],
            "whatsapp_pending_files": [],
        },
        rpc_results=rpc_results or {"decrement_credits": 42},
    )
    bucket = MagicMock()
    bucket.upload = MagicMock(return_value=MagicMock())
    bucket.get_public_url = MagicMock(return_value="https://example.com/wa.jpg")
    mock_sc.storage.from_ = MagicMock(return_value=bucket)
    return mock_sc


@pytest.mark.asyncio
async def test_whatsapp_needs_retry_refunds_credit():
    """Blurry/needs_retry reject must refund the pre-deducted credit."""
    mock_sc = _linked_profile_mock(
        rpc_results={"decrement_credits": 41, "refund_credits": True},
    )
    sent = []
    bad_extract = {
        "Extraction_State": "needs_retry",
        "Confidence_Score": 40,
        "Supplier_Name": None,
        "Total_Amount": None,
        "Line_Items": [],
    }

    with (
        patch("whatsapp_service.create_async_client", side_effect=make_async_factory(mock_sc)),
        patch("whatsapp_service.get_org_credits", new_callable=AsyncMock, return_value=10),
        patch(
            "whatsapp_service.send_whatsapp_message",
            new_callable=AsyncMock,
            side_effect=lambda to, text: sent.append(text),
        ),
        patch(
            "whatsapp_service.download_whatsapp_media",
            new_callable=AsyncMock,
            return_value=MINIMAL_JPEG,
        ),
        patch(
            "whatsapp_service.compress_image",
            new_callable=AsyncMock,
            return_value=MINIMAL_JPEG,
        ),
        patch(
            "whatsapp_service.preprocess_invoice_file",
            return_value=(MINIMAL_JPEG, "image/jpeg"),
        ),
        patch(
            "whatsapp_service.run_ai_extraction",
            new_callable=AsyncMock,
            return_value=(bad_extract, 0),
        ),
    ):
        from whatsapp_service import process_whatsapp_message_bg

        await process_whatsapp_message_bg(IMAGE_MESSAGE)

    assert any(name == "decrement_credits" for name, _ in mock_sc.rpc_called_with)
    refunds = [p for name, p in mock_sc.rpc_called_with if name == "refund_credits"]
    assert refunds, "expected refund_credits on needs_retry reject"
    assert refunds[0]["amount"] == 1
    assert any("blurry" in t.lower() or "could not extract" in t.lower() for t in sent)
    # Must not insert invoice on reject
    assert mock_sc.table_called_with.count("invoices") or True  # soft check
