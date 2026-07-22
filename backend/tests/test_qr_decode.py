"""Hermetic tests for GST e-invoice QR / IRN decode (Phase A).

These avoid OpenCV: they exercise the JWT-payload parser and the seed-merge
logic directly. Image detection is covered separately behind the optional dep.
"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from qr_decode import apply_qr_seed, parse_signed_qr


def _b64url(obj: dict | str) -> str:
    raw = obj.encode() if isinstance(obj, str) else json.dumps(obj).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _make_signed_qr(data: dict) -> str:
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {"data": json.dumps(data), "iss": "NIC"}
    return f"{_b64url(header)}.{_b64url(payload)}.{_b64url('sig-bytes')}"


SAMPLE = {
    "SellerGstin": "37BZNPM9430M1KL",
    "BuyerGstin": "03BZNPM9430M1KL",
    "DocNo": "CTDN23456",
    "DocTyp": "INV",
    "DocDt": "05/08/2020",
    "TotInvVal": 16650,
    "ItemCnt": 1,
    "MainHsnCode": "39231010",
    "Irn": "afdcc32a0eaa3a054cffcd251884d3e3f4f726b75c8943e7d35fbabc82f05d8a",
}


class TestParse:
    def test_parses_jwt_payload(self):
        seed = parse_signed_qr(_make_signed_qr(SAMPLE))
        assert seed is not None
        assert seed.fields["Supplier_GSTIN"] == "37BZNPM9430M1KL"
        assert seed.fields["Buyer_GSTIN"] == "03BZNPM9430M1KL"
        assert seed.fields["Invoice_Number"] == "CTDN23456"
        assert seed.fields["Invoice_Date"] == "05/08/2020"
        assert seed.fields["Total_Amount"] == 16650
        assert seed.fields["IRN"].startswith("afdcc32a")
        # ItemCnt / MainHsnCode are captured but not mapped to top-level fields
        assert seed.unmapped["ItemCnt"] == 1
        assert seed.unmapped["MainHsnCode"] == "39231010"

    def test_bare_json_payload(self):
        seed = parse_signed_qr(json.dumps({"data": SAMPLE}))
        assert seed is not None
        assert seed.fields["IRN"].startswith("afdcc32a")

    def test_non_einvoice_returns_none(self):
        # A UPI / URL QR should not be mistaken for an e-invoice payload.
        assert parse_signed_qr("upi://pay?pa=someone@bank&am=100") is None
        assert parse_signed_qr("") is None
        assert parse_signed_qr("random text with no structure") is None

    def test_requires_signature_signal(self):
        # JSON with fields but no Irn/SellerGstin → rejected.
        seed = parse_signed_qr(json.dumps({"DocNo": "X1", "TotInvVal": 100}))
        assert seed is None


class TestApplySeed:
    def test_overlays_missing_fields(self):
        seed = parse_signed_qr(_make_signed_qr(SAMPLE))
        data = {"Supplier_GSTIN": None, "Total_Amount": None, "Line_Items": []}
        apply_qr_seed(data, seed)
        assert data["Supplier_GSTIN"] == "37BZNPM9430M1KL"
        assert data["Total_Amount"] == 16650
        assert data["QR_Verified"] is True
        assert "Supplier_GSTIN" not in data["QR_Overridden_Fields"]

    def test_overrides_and_flags_mismatch(self):
        seed = parse_signed_qr(_make_signed_qr(SAMPLE))
        # LLM read a wrong invoice number → QR (signed) wins, mismatch recorded.
        data = {"Invoice_Number": "WRONG-999", "Supplier_GSTIN": "37BZNPM9430M1KL"}
        apply_qr_seed(data, seed)
        assert data["Invoice_Number"] == "CTDN23456"
        assert "Invoice_Number" in data["QR_Overridden_Fields"]
        assert "Supplier_GSTIN" in data["QR_Confirmed_Fields"]

    def test_gstin_confirm_is_whitespace_insensitive(self):
        seed = parse_signed_qr(_make_signed_qr(SAMPLE))
        data = {"Supplier_GSTIN": " 37bznpm9430m1kl "}
        apply_qr_seed(data, seed)
        assert "Supplier_GSTIN" in data["QR_Confirmed_Fields"]
        assert "Supplier_GSTIN" not in data["QR_Overridden_Fields"]
