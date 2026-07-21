"""Unit tests for multi-org wallet resolution helpers."""
import pytest
from unittest.mock import AsyncMock, MagicMock
import sys, os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from utils import resolve_active_org_id, get_org_credits


def _table_mock(responses: dict):
    """
    responses: table_name -> list of rows returned by execute().
    """
    sc = MagicMock()

    def _table(name: str):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.order.return_value = chain
        chain.limit.return_value = chain
        chain.in_.return_value = chain

        async def _execute():
            return MagicMock(data=list(responses.get(name, [])))

        chain.execute = _execute
        return chain

    sc.table = MagicMock(side_effect=_table)
    return sc


@pytest.mark.asyncio
async def test_resolve_prefers_active_org_id():
    sc = _table_mock({
        "profiles": [{"active_org_id": "org-active"}],
        "organization_members": [{"org_id": "org-member", "role": "owner", "created_at": "2026-01-01"}],
    })
    assert await resolve_active_org_id(sc, "user-1") == "org-active"


@pytest.mark.asyncio
async def test_resolve_membership_prefers_owner_role():
    sc = _table_mock({
        "profiles": [{"active_org_id": None}],
        "organization_members": [
            {"org_id": "org-acct", "role": "accountant", "created_at": "2025-01-01"},
            {"org_id": "org-owner", "role": "owner", "created_at": "2026-06-01"},
        ],
    })
    assert await resolve_active_org_id(sc, "user-1") == "org-owner"


@pytest.mark.asyncio
async def test_resolve_membership_tiebreak_created_at():
    sc = _table_mock({
        "profiles": [{"active_org_id": None}],
        "organization_members": [
            {"org_id": "org-later", "role": "admin", "created_at": "2026-06-01"},
            {"org_id": "org-earlier", "role": "admin", "created_at": "2025-01-01"},
        ],
    })
    assert await resolve_active_org_id(sc, "user-1") == "org-earlier"


@pytest.mark.asyncio
async def test_resolve_owned_org_last_resort():
    sc = _table_mock({
        "profiles": [{"active_org_id": None}],
        "organization_members": [],
        "organizations": [{"id": "org-owned", "created_at": "2024-01-01"}],
    })
    assert await resolve_active_org_id(sc, "user-1") == "org-owned"


@pytest.mark.asyncio
async def test_get_org_credits_uses_resolved_org():
    sc = _table_mock({
        "profiles": [{"active_org_id": "org-active"}],
        "organizations": [{"credits": 77}],
    })
    assert await get_org_credits(sc, "user-1") == 77
