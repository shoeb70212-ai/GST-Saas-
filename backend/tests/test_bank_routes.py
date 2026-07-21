"""
Tests for /api/bank-statements/* endpoints.

Covers: auth, client ownership, file type validation,
        cost calculation, credit deduction, status polling,
        export blocking on unreviewed transactions.
"""
import io
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
import sys, os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from main import app
from tests.helpers import make_async_factory, build_supabase_mock

http_client = TestClient(app)

MINIMAL_PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 2\n0000000000 65535 f\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n9\n%%EOF'

MINIMAL_JPEG = (
    b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00'
    b'\xff\xdb\x00C\x00' + b'\x08' * 64 +
    b'\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00'
    b'\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    b'\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    b'\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9'
)


async def _fake_user_id(token: str):
    return "user-123"


def _bank_mock(clients=None, statements=None, transactions=None, has_access=True):
    table_data = {}
    if clients is not None:
        table_data["clients"] = clients
    if statements is not None:
        table_data["bank_statements"] = statements
    if transactions is not None:
        table_data["bank_transactions"] = transactions
    return build_supabase_mock(
        user_id="user-123",
        table_data=table_data,
        rpc_results={"has_client_access": has_access},
    )


# ═══════════════════════════════════════════════════════════════
# GET /api/bank-statements/list/{client_id}
# ═══════════════════════════════════════════════════════════════

class TestListBankStatements:
    def test_no_auth_returns_401(self):
        response = http_client.get("/api/bank-statements/list/client-abc")
        assert response.status_code == 401

    def test_malformed_auth_returns_401(self):
        response = http_client.get(
            "/api/bank-statements/list/client-abc",
            headers={"Authorization": "Token badtoken"},
        )
        assert response.status_code == 401


# ═══════════════════════════════════════════════════════════════
# POST /api/bank-statements/upload
# ═══════════════════════════════════════════════════════════════

class TestBankStatementUpload:
    def test_no_auth_returns_401(self):
        response = http_client.post(
            "/api/bank-statements/upload",
            files={"file": ("stmt.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")},
            data={"client_id": "client-abc"},
        )
        assert response.status_code == 401

    @patch("bank_routes.get_user_from_token", new_callable=AsyncMock)
    def test_file_over_25mb_returns_400(self, mock_user):
        """Files over 25 MB must be rejected before processing."""
        mock_user.return_value = "user-123"
        big_file = b'%PDF-1.4\n' + b'\x00' * (25 * 1024 * 1024 + 1)
        response = http_client.post(
            "/api/bank-statements/upload",
            files={"file": ("huge.pdf", io.BytesIO(big_file), "application/pdf")},
            data={"client_id": "client-abc"},
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 400

    @patch("bank_routes.process_bank_statement_bg")
    @patch("bank_routes.get_user_from_token")
    @patch("bank_routes.get_user_supabase_client")
    def test_unknown_extension_processed_as_pdf(self, mock_sc_fn, mock_user_fn, _mock_bg):
        """Unknown extensions are treated as PDF; invalid PDF bytes return 400."""
        async def _fake_user(_token):
            return "user-123"
        mock_user_fn.side_effect = _fake_user
        mock_sc = _bank_mock(clients=[{"id": "client-abc"}])
        mock_sc_fn.side_effect = make_async_factory(mock_sc)

        response = http_client.post(
            "/api/bank-statements/upload",
            files={"file": ("script.exe", io.BytesIO(b'MZ\x90\x00'), "application/octet-stream")},
            data={"client_id": "client-abc"},
            headers={"Authorization": "Bearer fake.token"},
        )
        # Non-PDF binary cannot be opened as PDF after extension fallback
        assert response.status_code == 400
        assert "PDF" in (response.json().get("detail") or "")

    @patch("bank_routes.get_user_from_token", new_callable=AsyncMock)
    @patch("bank_routes.get_user_supabase_client")
    def test_accessing_other_users_client_returns_403(self, mock_sc_fn, mock_user):
        """Outsider without has_client_access → 403."""
        mock_user.return_value = "user-123"
        mock_sc = _bank_mock(clients=[], has_access=False)
        mock_sc_fn.side_effect = make_async_factory(mock_sc)

        response = http_client.post(
            "/api/bank-statements/upload",
            files={"file": ("stmt.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")},
            data={"client_id": "another-users-client"},
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 403

    @patch("bank_routes.process_bank_statement_bg")
    @patch("bank_routes.ensure_sufficient_credits", new_callable=AsyncMock)
    @patch("bank_routes._store_statement_file", new_callable=AsyncMock)
    @patch("bank_routes._prepare_statement_content", new_callable=AsyncMock)
    @patch("bank_routes.get_user_from_token", new_callable=AsyncMock)
    @patch("bank_routes.get_user_supabase_client")
    def test_org_teammate_with_has_client_access_can_upload(
        self, mock_sc_fn, mock_user, mock_prepare, mock_store, mock_credits, _mock_bg
    ):
        """Org teammate (not clients.user_id owner) may upload when RPC allows."""
        mock_user.return_value = "teammate-456"
        mock_prepare.return_value = (MINIMAL_PDF, ".pdf", 2)
        mock_store.return_value = "client-abc/bank_stmt.pdf"
        mock_sc = _bank_mock(clients=[], has_access=True)
        mock_sc_fn.side_effect = make_async_factory(mock_sc)

        response = http_client.post(
            "/api/bank-statements/upload",
            files={"file": ("stmt.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")},
            data={"client_id": "client-abc"},
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        assert any(
            name == "has_client_access"
            for name, _ in mock_sc.rpc_called_with
        )

    @patch("bank_routes.get_user_from_token", new_callable=AsyncMock)
    @patch("bank_routes.get_user_supabase_client")
    def test_list_denied_without_has_client_access(self, mock_sc_fn, mock_user):
        mock_user.return_value = "outsider-789"
        mock_sc = _bank_mock(has_access=False)
        mock_sc_fn.side_effect = make_async_factory(mock_sc)

        response = http_client.get(
            "/api/bank-statements/list/client-abc",
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 403

    @patch("bank_routes.get_user_from_token", new_callable=AsyncMock)
    @patch("bank_routes.get_user_supabase_client")
    def test_list_allowed_for_teammate_with_access(self, mock_sc_fn, mock_user):
        mock_user.return_value = "teammate-456"
        mock_sc = _bank_mock(
            statements=[{"id": "stmt-1", "bank_name": "HDFC", "status": "completed",
                         "account_number": None, "file_url": None, "created_at": "2024-01-01",
                         "error_message": None}],
            has_access=True,
        )
        mock_sc_fn.side_effect = make_async_factory(mock_sc)

        response = http_client.get(
            "/api/bank-statements/list/client-abc",
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"


# ═══════════════════════════════════════════════════════════════
# GET /api/bank-statements/{id}/status
# ═══════════════════════════════════════════════════════════════

class TestBankStatementStatus:
    def test_no_auth_returns_401(self):
        response = http_client.get("/api/bank-statements/stmt-123/status")
        assert response.status_code == 401

    @patch("bank_routes.get_user_supabase_client")
    def test_nonexistent_statement_returns_404(self, mock_sc_fn):
        mock_sc = _bank_mock(statements=[])
        mock_sc_fn.side_effect = make_async_factory(mock_sc)

        response = http_client.get(
            "/api/bank-statements/nonexistent-id/status",
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 404

    @patch("bank_routes.get_user_supabase_client")
    def test_completed_statement_returns_status(self, mock_sc_fn):
        mock_sc = _bank_mock(statements=[{
            "id": "stmt-123",
            "status": "completed",
            "bank_name": "HDFC",
            "account_number": "1234567890",
            "file_url": None,
        }])
        mock_sc_fn.side_effect = make_async_factory(mock_sc)

        response = http_client.get(
            "/api/bank-statements/stmt-123/status",
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"


# ═══════════════════════════════════════════════════════════════
# GET /api/bank-statements/{id}/export
# ═══════════════════════════════════════════════════════════════

class TestBankStatementExport:
    def test_no_auth_returns_401(self):
        response = http_client.get("/api/bank-statements/stmt-123/export")
        assert response.status_code == 401

    @patch("bank_routes.get_user_supabase_client")
    def test_transactions_with_math_errors_blocked_from_export(self, mock_sc_fn):
        """
        Export must be blocked if any transaction has has_math_error=True.
        This prevents exporting corrupt data to accounting software.
        """
        mock_sc = _bank_mock(
            statements=[{"id": "stmt-123"}],
            transactions=[{
                "id": "txn-1",
                "txn_date": "2024-01-01",
                "description": "NEFT transfer",
                "withdrawal": 1000.0,
                "deposit": None,
                "balance": 9000.0,
                "has_math_error": True,
                "needs_manual_review": False,
            }],
        )
        mock_sc_fn.side_effect = make_async_factory(mock_sc)

        response = http_client.get(
            "/api/bank-statements/stmt-123/export",
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 400

    @patch("bank_routes.get_user_supabase_client")
    def test_transactions_needing_review_blocked_from_export(self, mock_sc_fn):
        """Export must also be blocked if needs_manual_review=True."""
        mock_sc = _bank_mock(
            statements=[{"id": "stmt-123"}],
            transactions=[{
                "id": "txn-1",
                "txn_date": None,
                "description": "Unknown",
                "withdrawal": None,
                "deposit": None,
                "balance": None,
                "has_math_error": False,
                "needs_manual_review": True,
            }],
        )
        mock_sc_fn.side_effect = make_async_factory(mock_sc)

        response = http_client.get(
            "/api/bank-statements/stmt-123/export",
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 400
