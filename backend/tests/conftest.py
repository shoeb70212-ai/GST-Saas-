import pytest
from unittest.mock import AsyncMock, MagicMock, patch

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
    .table().select().eq().in_().order().limit().execute()
    """
    class ChainableMock:
        def __init__(self, db_state=None):
            # db_state is a dict: {"table_name": [data_list]}
            self.db_state = db_state if db_state is not None else {}
            self.insert_called_with = []
            self.rpc_called_with = []
            self._current_table = None

        def table(self, table_name):
            self._current_table = table_name
            return self

        def select(self, columns):
            return self

        def eq(self, col, val):
            return self

        def neq(self, col, val):
            return self

        def in_(self, col, vals):
            return self

        def order(self, col, **kwargs):
            return self

        def limit(self, count):
            return self

        def insert(self, data):
            self.insert_called_with.append((self._current_table, data))
            return self

        def rpc(self, func_name, params=None):
            self.rpc_called_with.append((func_name, params))
            return self

        async def execute(self):
            mock_resp = MagicMock()
            if self.insert_called_with and self.insert_called_with[-1][0] == self._current_table:
                # Mocking a returning insert
                mock_resp.data = [{"id": "mock_inserted_id"}]
            else:
                mock_resp.data = self.db_state.get(self._current_table, [])
            return mock_resp

    return ChainableMock

@pytest.fixture
def mock_openai_client():
    mock_client = AsyncMock()
    # Mocking client.beta.chat.completions.parse
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
            "allocated_amount": 0
        },
        {
            "id": "txn_2",
            "txn_date": "2026-05-16T00:00:00Z",
            "description": "UPI-VendorB",
            "reference_no": "REF456",
            "withdrawal": 5000.00,
            "deposit": 0,
            "allocated_amount": 0
        }
    ]

@pytest.fixture
def sample_unpaid_invoices():
    return [
        {
            "id": "inv_1",
            "supplier_name": "VendorA",
            "total_amount": 10000.50,
            "paid_amount": 0,
            "invoice_date": "2026-05-10T00:00:00Z"
        },
        {
            "id": "inv_2",
            "supplier_name": "VendorB",
            "total_amount": 6000.00,
            "paid_amount": 0,
            "invoice_date": "2026-05-12T00:00:00Z"
        }
    ]
