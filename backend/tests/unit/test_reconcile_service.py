import pytest
from unittest.mock import patch, AsyncMock
from reconcile_service import run_ai_matching_engine

@pytest.fixture
def mock_db_state(sample_unallocated_txns, sample_unpaid_invoices):
    return {
        "clients": [{"auto_approve_exact_matches": True}],
        "bank_statements": [{"id": "stmt_1"}],
        "bank_transactions": sample_unallocated_txns,
        "invoices": sample_unpaid_invoices,
        "reconciliation_matches": [{"id": "mock_match_id"}]
    }

@pytest.mark.asyncio
@patch("reconcile_service.client")
@patch("reconcile_service.create_async_client")
async def test_exact_match_auto_approve(mock_create_client, mock_openai, mock_supabase_builder, mock_db_state):
    """
    Test that Tier 1 Exact Matching correctly identifies matches within 1-paisa tolerance,
    and automatically triggers the approve RPC when auto-approve is True.
    """
    mock_db = mock_supabase_builder(db_state=mock_db_state)
    mock_create_client.return_value = mock_db

    class MockParsedMessage:
        class MockResult:
            suggestions = []
        parsed = MockResult()

    class MockChoice:
        message = MockParsedMessage()

    class MockResponse:
        choices = [MockChoice()]

    mock_openai.beta.chat.completions.parse = AsyncMock(return_value=MockResponse())

    # The mock state has:
    # Txn1: 10000.50, "NEFT-UBIN-VendorA"
    # Inv1: 10000.50, "Vendor A"
    # This is an exact amount and string match.
    
    result = await run_ai_matching_engine("client_123", "user_123")

    assert result["status"] == "success"
    # We expect 1 exact match (Txn1 <-> Inv1) to be suggested/approved
    assert result["suggestions_created"] >= 1
    
    # Check if insert was called for reconciliation_matches
    inserts = [item for table, item in mock_db.insert_called_with if table == "reconciliation_matches"]
    assert len(inserts) > 0
    assert inserts[0]["match_type"] == "EXACT"
    assert inserts[0]["status"] == "APPROVED"  # Because auto-approve is True

    # Check if RPC was called
    assert len(mock_db.rpc_called_with) > 0
    assert mock_db.rpc_called_with[0][0] == "approve_reconciliation_match"

@pytest.mark.asyncio
@patch("reconcile_service.client")
@patch("reconcile_service.create_async_client")
async def test_ai_fuzzy_match(mock_create_client, mock_openai, mock_supabase_builder, mock_db_state):
    """
    Test that leftovers are sent to OpenAI for fuzzy matching, and valid suggestions are inserted.
    """
    # Turn off auto-approve and remove exact matches
    mock_db_state["clients"] = [{"auto_approve_exact_matches": False}]
    
    # Make amounts mismatched so deterministic tier fails
    mock_db_state["bank_transactions"][0]["withdrawal"] = 9000.00 # Doesn't match 10000.50
    mock_db_state["invoices"][0]["total_amount"] = 10000.50

    mock_db = mock_supabase_builder(db_state=mock_db_state)
    mock_create_client.return_value = mock_db

    # Setup Mock OpenAI Response
    class MockParsedMessage:
        class MockResult:
            class MockSuggestion:
                bank_transaction_id = "txn_1"
                invoice_id = "inv_1"
                match_type = "PARTIAL"
                allocated_amount = 9000.00
                confidence_score = 0.95
            suggestions = [MockSuggestion()]
        parsed = MockResult()

    class MockChoice:
        message = MockParsedMessage()

    class MockResponse:
        choices = [MockChoice()]

    mock_openai.beta.chat.completions.parse = AsyncMock(return_value=MockResponse())

    result = await run_ai_matching_engine("client_123", "user_123")

    assert result["status"] == "success"
    # Expect 1 suggestion from AI
    assert result["suggestions_created"] == 1

    # Check if insert was called
    inserts = [item for table, item in mock_db.insert_called_with if table == "reconciliation_matches"]
    assert len(inserts) > 0
    assert inserts[0]["match_type"] == "PARTIAL"
    assert inserts[0]["status"] == "SUGGESTED"
    assert inserts[0]["created_by"] == "AI"

@pytest.mark.asyncio
@patch("reconcile_service.create_async_client")
async def test_no_data(mock_create_client, mock_supabase_builder):
    """
    Test when there are no statements or invoices.
    """
    mock_db = mock_supabase_builder(db_state={})
    mock_create_client.return_value = mock_db

    result = await run_ai_matching_engine("client_123", "user_123")

    assert result["status"] == "success"
    assert result["suggestions_created"] == 0
    assert "No bank statements" in result["message"]
