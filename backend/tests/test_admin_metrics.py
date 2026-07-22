"""Unit tests for admin_metrics health_ai scan_cost enrichment."""
from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from admin_metrics import health_ai  # noqa: E402


def _admin_with_events(events: list[dict]):
    client = MagicMock()
    table = MagicMock()
    client.table.return_value = table
    table.select.return_value = table
    table.gte.return_value = table
    table.order.return_value = table
    table.limit.return_value = table

    async def _execute():
        return MagicMock(data=events)

    table.execute = AsyncMock(side_effect=_execute)
    return client


@pytest.mark.asyncio
async def test_health_ai_scan_cost_aggregates():
    events = [
        {
            "event_type": "scan_cost",
            "severity": "info",
            "model_used": "openai/gpt-4o-mini",
            "tokens_used": 1000,
            "meta": {
                "estimated_cost_inr": 0.4,
                "cache_hit": False,
                "avg_field_confidence": 90.0,
            },
        },
        {
            "event_type": "scan_cost",
            "severity": "info",
            "model_used": "openai/gpt-4o-mini",
            "tokens_used": 500,
            "meta": {
                "estimated_cost_inr": 0.2,
                "cache_hit": True,
                "avg_field_confidence": 80.0,
            },
        },
        {
            "event_type": "escalated_to_verify",
            "severity": "warning",
            "model_used": "openai/gpt-4o",
            "tokens_used": 2000,
            "meta": {},
        },
    ]
    out = await health_ai(_admin_with_events(events), "24h")
    assert out["scan_count"] == 2
    assert out["avg_cost_per_scan_inr"] == 0.3
    assert out["cache_hit_rate"] == 0.5
    assert out["avg_field_confidence"] == 85.0
    assert out["escalate_count"] == 1
    assert out["escalate_rate"] > 0


@pytest.mark.asyncio
async def test_health_ai_empty_window():
    out = await health_ai(_admin_with_events([]), "24h")
    assert out["scan_count"] == 0
    assert out["avg_cost_per_scan_inr"] is None
    assert out["cache_hit_rate"] is None
    assert out["avg_field_confidence"] is None
    assert out["escalate_rate"] == 0.0
