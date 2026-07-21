"""
Hermetic edge-case tests for WhatsApp invoice processing credit paths.

Covers: early wallet gate, decrement_credits == -1, AI failure → refund_credits.
"""
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("META_ACCESS_TOKEN", "test-meta-token")
os.environ.setdefault("META_PHONE_NUMBER_ID", "test-phone-id")

from tests.helpers import build_supabase_mock, make_async_factory

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
    # WhatsApp storage path uses sync upload/get_public_url
    bucket = MagicMock()
    bucket.upload = MagicMock(return_value=MagicMock())
    bucket.get_public_url = MagicMock(return_value="https://example.com/wa.jpg")
    mock_sc.storage.from_ = MagicMock(return_value=bucket)
    return mock_sc


@pytest.mark.asyncio
async def test_zero_org_credits_sends_recharge_and_skips_deduct():
    """Wallet gate before media/AI: get_org_credits <= 0 must not call decrement_credits."""
    mock_sc = _linked_profile_mock()
    sent = []

    with (
        patch("whatsapp_service.create_async_client", side_effect=make_async_factory(mock_sc)),
        patch("whatsapp_service.get_org_credits", new_callable=AsyncMock, return_value=0),
        patch("whatsapp_service.send_whatsapp_message", new_callable=AsyncMock, side_effect=lambda to, text: sent.append(text)),
        patch("whatsapp_service.download_whatsapp_media", new_callable=AsyncMock) as mock_dl,
    ):
        from whatsapp_service import process_whatsapp_message_bg

        await process_whatsapp_message_bg(IMAGE_MESSAGE)

    assert any("insufficient credits" in t.lower() for t in sent)
    assert mock_dl.await_count == 0
    assert not any(name == "decrement_credits" for name, _ in mock_sc.rpc_called_with)


@pytest.mark.asyncio
async def test_decrement_credits_minus1_notifies_and_skips_ai():
    """Race after wallet gate: decrement_credits == -1 must stop before AI."""
    mock_sc = _linked_profile_mock(rpc_results={"decrement_credits": -1})
    sent = []

    with (
        patch("whatsapp_service.create_async_client", side_effect=make_async_factory(mock_sc)),
        patch("whatsapp_service.get_org_credits", new_callable=AsyncMock, return_value=5),
        patch("whatsapp_service.send_whatsapp_message", new_callable=AsyncMock, side_effect=lambda to, text: sent.append(text)),
        patch("whatsapp_service.download_whatsapp_media", new_callable=AsyncMock, return_value=MINIMAL_JPEG),
        patch("whatsapp_service.compress_image", new_callable=AsyncMock, return_value=MINIMAL_JPEG),
        patch("main.run_ai_extraction", new_callable=AsyncMock) as mock_ai,
    ):
        from whatsapp_service import process_whatsapp_message_bg

        await process_whatsapp_message_bg(IMAGE_MESSAGE)

    assert any("insufficient credits" in t.lower() for t in sent)
    mock_ai.assert_not_awaited()
    assert any(name == "decrement_credits" for name, _ in mock_sc.rpc_called_with)
    assert not any(name == "refund_credits" for name, _ in mock_sc.rpc_called_with)


@pytest.mark.asyncio
async def test_ai_failure_refunds_credit():
    """AI extraction failure after successful deduct must call refund_credits."""
    mock_sc = _linked_profile_mock(
        rpc_results={"decrement_credits": 41, "refund_credits": True},
    )
    sent = []

    with (
        patch("whatsapp_service.create_async_client", side_effect=make_async_factory(mock_sc)),
        patch("whatsapp_service.get_org_credits", new_callable=AsyncMock, return_value=10),
        patch("whatsapp_service.send_whatsapp_message", new_callable=AsyncMock, side_effect=lambda to, text: sent.append(text)),
        patch("whatsapp_service.download_whatsapp_media", new_callable=AsyncMock, return_value=MINIMAL_JPEG),
        patch("whatsapp_service.compress_image", new_callable=AsyncMock, return_value=MINIMAL_JPEG),
        patch("main.run_ai_extraction", new_callable=AsyncMock, side_effect=RuntimeError("AI boom")),
    ):
        from whatsapp_service import process_whatsapp_message_bg

        await process_whatsapp_message_bg(IMAGE_MESSAGE)

    assert any(name == "decrement_credits" for name, _ in mock_sc.rpc_called_with)
    refunds = [p for name, p in mock_sc.rpc_called_with if name == "refund_credits"]
    assert refunds, "expected refund_credits after AI failure"
    assert refunds[0]["amount"] == 1
    assert refunds[0]["user_id_param"] == "user-wa-1"
    assert any("internal error" in t.lower() for t in sent)
