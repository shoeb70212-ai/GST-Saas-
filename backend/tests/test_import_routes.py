"""
Tests for /api/import/purchase-register/preview.

Covers: auth (401), client access denial (403), 25 MB guard, unsupported file
type, happy path (per-row preview + summary), and that NO AI credits are spent
(the import router must not import or call any credit-deduction helper).
"""
import io
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("VITE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("VITE_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

import pytest
from fastapi.testclient import TestClient

from main import app
from utils import get_current_user
from tests.helpers import build_supabase_mock
from validators import gstin_check_char

_BODY14 = "27AAPFU0939F1Z"
VALID_GSTIN = _BODY14 + gstin_check_char(_BODY14)

http_client = TestClient(app)

CSV = (
    "GSTIN of Supplier,Invoice No.,Invoice Date,Supplier Name,Taxable Value,CGST Amount,SGST Amount,Invoice Value\n"
    f"{VALID_GSTIN},INV-001,15-05-2026,Acme Ltd,1000,90,90,1180\n"
).encode()


def _import_mock(has_access=True, invoices=None, user_id="user-123"):
    return build_supabase_mock(
        user_id=user_id,
        table_data={"invoices": invoices or []},
        rpc_results={"has_client_access": has_access},
    )


def _override_auth(user_id="user-123", supabase_client=None):
    mock_sc = supabase_client or _import_mock(user_id=user_id)

    async def _fake():
        return {"user_id": user_id, "supabase_client": mock_sc, "token": "fake.token"}

    app.dependency_overrides[get_current_user] = _fake
    return mock_sc


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestPreviewAuth:
    def test_no_auth_returns_401(self):
        response = http_client.post(
            "/api/import/purchase-register/preview",
            files={"file": ("pr.csv", io.BytesIO(CSV), "text/csv")},
            data={"client_id": "client-abc"},
        )
        assert response.status_code == 401

    def test_denied_client_access_returns_403(self):
        mock_sc = _import_mock(has_access=False)
        _override_auth(supabase_client=mock_sc)
        response = http_client.post(
            "/api/import/purchase-register/preview",
            files={"file": ("pr.csv", io.BytesIO(CSV), "text/csv")},
            data={"client_id": "other-client"},
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 403


class TestPreviewValidation:
    def test_file_over_25mb_returns_400(self):
        _override_auth()
        big = b"a,b\n" + b"1,2\n" * (25 * 1024 * 1024 // 4 + 1)
        response = http_client.post(
            "/api/import/purchase-register/preview",
            files={"file": ("huge.csv", io.BytesIO(big), "text/csv")},
            data={"client_id": "client-abc"},
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 400

    def test_unsupported_extension_returns_400(self):
        _override_auth()
        response = http_client.post(
            "/api/import/purchase-register/preview",
            files={"file": ("pr.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
            data={"client_id": "client-abc"},
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 400


class TestPreviewHappyPath:
    def test_returns_preview_rows_and_summary(self):
        mock_sc = _import_mock(has_access=True, invoices=[])
        _override_auth(supabase_client=mock_sc)
        response = http_client.post(
            "/api/import/purchase-register/preview",
            files={"file": ("pr.csv", io.BytesIO(CSV), "text/csv")},
            data={"client_id": "client-abc"},
            headers={"Authorization": "Bearer fake.token"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["row_count"] == 1
        assert body["summary"]["ready"] == 1
        assert len(body["preview_rows"]) == 1
        row = body["preview_rows"][0]
        assert row["status"] == "ready"
        assert row["invoice_data"]["invoice_number"] == "INV-001"
        assert row["invoice_data"]["total_amount"] == 1180

    def test_no_credits_helper_imported(self):
        """Import must be free of AI credits: no deduct/ensure-credits in the router."""
        import import_routes

        assert not hasattr(import_routes, "deduct_credits_rpc")
        assert not hasattr(import_routes, "ensure_sufficient_credits")
