"""
Phase A — GST e-invoice QR / IRN decode (deterministic, pre-LLM).

An Indian e-invoice QR is a signed JWT (``Header.Payload.Signature``) issued by
the Invoice Registration Portal (IRP/NIC). The unsigned middle *payload* carries
8 government-signed fields we can trust almost absolutely:

    SellerGstin, BuyerGstin, DocNo, DocTyp, DocDt,
    TotInvVal, ItemCnt, MainHsnCode, Irn

We decode the payload **for internal seeding / cross-checking only** — we never
re-sign or mutate the QR (that would break the signature). Signature verification
against the NIC public key is out of scope here (a compliance/verification step,
not extraction).

This module degrades gracefully: if OpenCV / numpy / PyJWT are unavailable, or the
image has no QR, it returns ``None`` and the caller falls back to the LLM path.
"""
from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# Feature flag (default on — additive + safe; degrades if deps missing).
import os

QR_DECODE_ENABLED = os.getenv("QR_DECODE_ENABLED", "1") not in ("0", "false", "False")

# IRP signed-QR key -> KhataLens schema field.
# TotInvVal is the tax-inclusive invoice value → maps to Total_Amount.
SIGNED_FIELD_MAP: dict[str, str] = {
    "SellerGstin": "Supplier_GSTIN",
    "BuyerGstin": "Buyer_GSTIN",
    "DocNo": "Invoice_Number",
    "DocDt": "Invoice_Date",
    "TotInvVal": "Total_Amount",
    "Irn": "IRN",
}


@dataclass(frozen=True)
class QrSeed:
    """Normalized, high-trust seed derived from a signed e-invoice QR."""

    fields: dict[str, Any]  # schema-field-name -> value (only mapped keys)
    raw: dict[str, Any]  # full decoded IRP data payload
    source: str = "gst_qr_jwt"
    unmapped: dict[str, Any] = field(default_factory=dict)  # ItemCnt, MainHsnCode, DocTyp...

    def is_empty(self) -> bool:
        return not self.fields


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def parse_signed_qr(qr_text: str) -> QrSeed | None:
    """
    Parse a raw decoded QR string into a QrSeed.

    Handles both the JWT form (``h.p.s``) and, defensively, a bare JSON payload.
    Returns None when the text is not a recognizable IRP e-invoice payload.
    """
    if not qr_text or not qr_text.strip():
        return None
    text = qr_text.strip()

    data_obj: dict[str, Any] | None = None

    # Preferred: JWT with 3 dot-separated segments; decode the middle payload.
    parts = text.split(".")
    if len(parts) == 3:
        try:
            payload = json.loads(_b64url_decode(parts[1]).decode("utf-8"))
            inner = payload.get("data")
            # `data` is usually a JSON *string*; sometimes already an object.
            if isinstance(inner, str):
                data_obj = json.loads(inner)
            elif isinstance(inner, dict):
                data_obj = inner
        except Exception as e:  # noqa: BLE001 - best-effort decode
            logger.debug("QR JWT payload decode failed: %s", e)

    # Fallback: the QR is itself the JSON data (older / non-JWT encoders).
    if data_obj is None:
        try:
            maybe = json.loads(text)
            if isinstance(maybe, dict):
                data_obj = maybe.get("data") if isinstance(maybe.get("data"), dict) else maybe
        except Exception:  # noqa: BLE001
            data_obj = None

    if not isinstance(data_obj, dict) or not data_obj:
        return None

    mapped: dict[str, Any] = {}
    unmapped: dict[str, Any] = {}
    for key, value in data_obj.items():
        if value in (None, ""):
            continue
        target = SIGNED_FIELD_MAP.get(key)
        if target:
            mapped[target] = value
        else:
            unmapped[key] = value

    # Require at least one IRP-signature-y signal to avoid false positives.
    looks_like_einvoice = ("Irn" in data_obj) or ("SellerGstin" in data_obj)
    if not mapped or not looks_like_einvoice:
        return None

    return QrSeed(fields=mapped, raw=data_obj, unmapped=unmapped)


def _detect_qr_text(image_bytes: bytes) -> str | None:
    """Return the decoded QR string from image bytes, or None. Best-effort."""
    if not image_bytes:
        return None
    # Primary: OpenCV (no zbar system dependency → clean on Windows/Docker).
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore

        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return None
        detector = cv2.QRCodeDetector()
        # detectAndDecodeMulti handles invoices with multiple QRs (QR + UPI etc.)
        try:
            ok, decoded, _pts, _straight = detector.detectAndDecodeMulti(img)
            if ok:
                for text in decoded:
                    if text and parse_signed_qr(text) is not None:
                        return text
                for text in decoded:
                    if text:
                        return text
        except Exception:  # noqa: BLE001 - older OpenCV without Multi
            pass
        text, _pts2, _straight2 = detector.detectAndDecode(img)
        if text:
            return text
    except Exception as e:  # noqa: BLE001
        logger.debug("OpenCV QR detect unavailable/failed: %s", e)

    # Fallback: pyzbar (requires the zbar shared lib; optional).
    try:
        from PIL import Image  # type: ignore
        from pyzbar.pyzbar import decode as zbar_decode  # type: ignore
        import io

        img = Image.open(io.BytesIO(image_bytes))
        for sym in zbar_decode(img):
            try:
                return sym.data.decode("utf-8")
            except Exception:  # noqa: BLE001
                continue
    except Exception as e:  # noqa: BLE001
        logger.debug("pyzbar QR detect unavailable/failed: %s", e)

    return None


def seed_from_image(image_bytes: bytes) -> QrSeed | None:
    """Detect + parse a signed e-invoice QR from raw image bytes."""
    if not QR_DECODE_ENABLED:
        return None
    text = _detect_qr_text(image_bytes)
    if not text:
        return None
    return parse_signed_qr(text)


def image_bytes_from_content(content: bytes | str, mime_type: str) -> bytes | None:
    """
    Extract the raster image bytes a QR could live in, for the given payload.

    - image/*        → the bytes themselves
    - hybrid payload → the embedded compact JPEG
    - text/markdown  → None (digital-native; QR not in rendered text)
    """
    from preprocess import HYBRID_MIME  # local import avoids cycle at module load

    if mime_type.startswith("image/") and isinstance(content, (bytes, bytearray)):
        return bytes(content)
    if mime_type == HYBRID_MIME:
        try:
            from preprocess import decode_hybrid

            return decode_hybrid(content).get("image_bytes") or None
        except Exception:  # noqa: BLE001
            return None
    return None


def apply_qr_seed(data_dict: dict, seed: QrSeed) -> dict:
    """
    Overlay government-signed QR fields onto an extraction result.

    Signed fields are authoritative: where the LLM disagrees we override and
    record the mismatch for review/audit. Diagnostics are attached under
    ``QR_*`` keys (schema-agnostic helpers, dropped before DB persistence).
    """
    if seed is None or seed.is_empty():
        return data_dict

    from validators import normalize_gstin

    overridden: list[str] = []
    confirmed: list[str] = []

    def _norm(name: str, value: Any) -> Any:
        if name in ("Supplier_GSTIN", "Buyer_GSTIN") and isinstance(value, str):
            return normalize_gstin(value)
        return value

    for name, qr_value in seed.fields.items():
        current = data_dict.get(name)
        qr_norm = _norm(name, qr_value)
        cur_norm = _norm(name, current) if isinstance(current, str) else current
        if current in (None, "") or cur_norm != qr_norm:
            if current not in (None, "") and cur_norm != qr_norm:
                overridden.append(name)
            data_dict[name] = qr_value
        else:
            confirmed.append(name)

    data_dict["QR_Verified"] = True
    data_dict["QR_Source"] = seed.source
    data_dict["QR_Confirmed_Fields"] = confirmed
    data_dict["QR_Overridden_Fields"] = overridden
    if seed.unmapped.get("ItemCnt") is not None:
        data_dict["QR_Item_Count"] = seed.unmapped.get("ItemCnt")
    if seed.unmapped.get("MainHsnCode"):
        data_dict["QR_Main_HSN"] = seed.unmapped.get("MainHsnCode")
    return data_dict
