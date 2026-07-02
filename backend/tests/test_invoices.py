import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock
import sys
import os
import io

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from main import app

client = TestClient(app)

@pytest.fixture
def mock_supabase_client():
    with patch('main.create_async_client', new_callable=AsyncMock) as mock_create:
        mock_client = MagicMock()
        
        # Mock auth
        mock_user = MagicMock()
        mock_user.user.id = "test-user-id"
        mock_client.auth.get_user = AsyncMock(return_value=mock_user)
        
        # Mock profile credits
        mock_profile_resp = MagicMock()
        mock_profile_resp.data = [{"credits": 50}]
        mock_execute = AsyncMock(return_value=mock_profile_resp)
        mock_client.table().select().eq().execute = mock_execute
        
        # Mock RPC
        mock_rpc_resp = MagicMock()
        mock_rpc_resp.data = 49
        mock_client.rpc().execute = AsyncMock(return_value=mock_rpc_resp)
        
        # Mock Insert
        mock_insert_resp = MagicMock()
        mock_insert_resp.data = [{"id": "test-invoice-id"}]
        mock_client.table().insert().execute = AsyncMock(return_value=mock_insert_resp)
        
        mock_create.return_value = mock_client
        yield mock_client

@pytest.fixture
def mock_ai_extraction():
    with patch('main.run_ai_extraction', new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = {
            "Supplier_Name": "Test Supplier",
            "Supplier_GSTIN": "29TESTGSTIN1234",
            "Invoice_Number": "INV-001",
            "Invoice_Date": "2023-01-01",
            "Total_Amount": 1000.0,
            "Taxable_Amount": 800.0,
            "CGST_Amount": 100.0,
            "SGST_Amount": 100.0,
            "IGST_Amount": 0.0,
            "Line_Items": []
        }
        yield mock_extract

@pytest.mark.asyncio
async def test_scan_invoice_success(mock_supabase_client, mock_ai_extraction):
    file_content = b"fake image content"
    files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
    headers = {"Authorization": "Bearer fake_token"}
    
    response = client.post("/api/scan-invoice", files=files, headers=headers)
    
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["Supplier_Name"] == "Test Supplier"
    assert data["data"]["Taxable_Amount"] == 800.0
