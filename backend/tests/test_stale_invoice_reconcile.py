"""Tests for stale pending invoice reconciliation."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from stale_invoice_reconcile import reconcile_stale_pending_invoices


@pytest.mark.asyncio
async def test_reconcile_stale_dry_run_does_not_mutate(monkeypatch):
    rows = [
        {
            "id": "inv-1",
            "user_id": "user-1",
            "processing_status": "pending",
            "created_at": "2020-01-01T00:00:00+00:00",
            "file_name": "a.pdf",
        }
    ]
    admin = MagicMock()
    chain = MagicMock()
    admin.table.return_value = chain
    chain.select.return_value = chain
    chain.in_.return_value = chain
    chain.lt.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.execute = AsyncMock(return_value=MagicMock(data=rows))

    refund = AsyncMock(return_value=True)
    monkeypatch.setattr("stale_invoice_reconcile._refund_one", refund)

    result = await reconcile_stale_pending_invoices(admin, older_than_minutes=15, dry_run=True)
    assert result["candidates"] == 1
    assert result["dry_run"] is True
    assert result["marked_failed"] == 0
    refund.assert_not_called()


@pytest.mark.asyncio
async def test_reconcile_stale_marks_and_refunds(monkeypatch):
    rows = [
        {
            "id": "inv-1",
            "user_id": "user-1",
            "processing_status": "pending_from_client",
            "created_at": "2020-01-01T00:00:00+00:00",
            "file_name": "a.pdf",
        }
    ]
    admin = MagicMock()

    select_chain = MagicMock()
    update_chain = MagicMock()

    def table_side_effect(name):
        assert name == "invoices"
        # first call is select query; subsequent are updates — simplify with one builder
        return select_chain

    admin.table.side_effect = table_side_effect
    for chain in (select_chain, update_chain):
        chain.select.return_value = chain
        chain.update.return_value = chain
        chain.eq.return_value = chain
        chain.in_.return_value = chain
        chain.lt.return_value = chain
        chain.order.return_value = chain
        chain.limit.return_value = chain

    select_chain.execute = AsyncMock(
        side_effect=[
            MagicMock(data=rows),
            MagicMock(data=[{"id": "inv-1"}]),  # conditional update succeeded
        ]
    )

    refund = AsyncMock(return_value=True)
    monkeypatch.setattr("stale_invoice_reconcile._refund_one", refund)

    result = await reconcile_stale_pending_invoices(admin, older_than_minutes=15, dry_run=False)
    assert result["candidates"] == 1
    assert result["marked_failed"] == 1
    assert result["refunded"] == 1
    refund.assert_awaited_once()
