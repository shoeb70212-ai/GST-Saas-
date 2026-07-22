"""
Shared pytest fixtures for the KhataLens test suite.

Key fix over the previous version:
  - ChainableMock now tracks _current_table per-chain-instance so parallel
    .table("a")...execute() and .table("b")...execute() calls don't
    clobber each other's table context.
  - execute() returns data keyed by the table that was set on *this* chain.
  - insert() records are returned per-table so assertions can be precise.
"""
import os

# Must be set before app modules read env (HMAC + limiter).
os.environ.setdefault("TESTING", "1")
os.environ.setdefault("PUBLIC_UPLOAD_TOKEN_SECRET", "test-upload-secret")
os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture(autouse=True)
def disable_public_rate_limit():
    """Prevent slowapi from flaking unit tests."""
    from rate_limit import limiter

    previous = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = previous


@pytest.fixture
def mock_supabase_execute_response():
    def _create_response(data=None):
        mock_resp = MagicMock()
        mock_resp.data = data if data is not None else []
        return mock_resp
    return _create_response


@pytest.fixture
def mock_supabase_builder():
    """
    Creates a deeply chainable mock for Supabase query builders.

    Usage:
        db = mock_supabase_builder(db_state={"invoices": [{"id": "inv-1"}]})
        result = await db.table("invoices").select("*").execute()
        assert result.data == [{"id": "inv-1"}]

    The mock correctly isolates table context per chain: two simultaneous
    .table("a") and .table("b") chains return the correct data for each.
    """
    class ChainInstance:
        """A single query chain — remembers which table it started on."""

        def __init__(self, table_name: str, root: "ChainableMock"):
            self._table = table_name
            self._root = root

        # ── Builder methods — all return self ──────────────────────────────
        def select(self, *a, **kw): return self
        def eq(self, *a, **kw): return self
        def neq(self, *a, **kw): return self
        def in_(self, *a, **kw): return self
        def order(self, *a, **kw): return self
        def limit(self, *a, **kw): return self
        def filter(self, *a, **kw): return self
        def gte(self, *a, **kw): return self
        def lte(self, *a, **kw): return self
        def single(self): return self
        def update(self, *a, **kw): return self
        def delete(self): return self

        def insert(self, data):
            self._root.insert_called_with.append((self._table, data))
            return self

        async def execute(self):
            mock_resp = MagicMock()
            # If this chain ended with an insert, return a fake inserted row
            recent_inserts = [
                item for tbl, item in self._root.insert_called_with
                if tbl == self._table
            ]
            if recent_inserts:
                mock_resp.data = [{"id": "mock_inserted_id"}]
            else:
                mock_resp.data = self._root.db_state.get(self._table, [])
            mock_resp.count = len(mock_resp.data)
            return mock_resp

    class ChainableMock:
        def __init__(self, db_state=None):
            self.db_state = db_state if db_state is not None else {}
            self.insert_called_with: list[tuple[str, dict]] = []
            self.rpc_called_with: list[tuple[str, dict]] = []

        def table(self, table_name: str) -> ChainInstance:
            return ChainInstance(table_name, self)

        def rpc(self, func_name: str, params=None):
            self.rpc_called_with.append((func_name, params))
            return self

        async def execute(self):
            mock_resp = MagicMock()
            mock_resp.data = [{"id": "mock_rpc_id"}]
            return mock_resp

    return ChainableMock


@pytest.fixture
def mock_openai_client():
    mock_client = AsyncMock()
    mock_parse = AsyncMock()
    mock_client.beta.chat.completions.parse = mock_parse
    return mock_client


@pytest.fixture
def sample_unallocated_txns():
    return [
        {
            "id": "txn_1",
            "txn_date": "2026-05-15T00:00:00Z",
            "description": "NEFT-UBIN-VendorA",
            "reference_no": "REF123",
            "withdrawal": 10000.50,
            "deposit": 0,
            "allocated_amount": 0,
        },
        {
            "id": "txn_2",
            "txn_date": "2026-05-16T00:00:00Z",
            "description": "UPI-VendorB",
            "reference_no": "REF456",
            "withdrawal": 5000.00,
            "deposit": 0,
            "allocated_amount": 0,
        },
    ]


@pytest.fixture
def sample_unpaid_invoices():
    return [
        {
            "id": "inv_1",
            "supplier_name": "VendorA",
            "total_amount": 10000.50,
            "paid_amount": 0,
            "invoice_date": "2026-05-10T00:00:00Z",
        },
        {
            "id": "inv_2",
            "supplier_name": "VendorB",
            "total_amount": 6000.00,
            "paid_amount": 0,
            "invoice_date": "2026-05-12T00:00:00Z",
        },
    ]
