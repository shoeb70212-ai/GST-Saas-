"""
Pluggable classical OCR providers (Phase B / E).

Default-off: set ``OCR_ENABLED=1`` and provider credentials to use in production.
Bench harness (``bench.run_ocr_compare``) uses the same adapters for evaluation.
"""
from __future__ import annotations

import os

from ocr.base import OcrProvider, OcrResult, OcrWord

OCR_ENABLED = os.getenv("OCR_ENABLED", "0") in ("1", "true", "True")
OCR_PROVIDER = (os.getenv("OCR_PROVIDER") or "azure").strip().lower()


def get_ocr_provider(*, require_enabled: bool = True) -> OcrProvider:
    """
    Factory for the configured OCR provider.

    Raises RuntimeError with a clear message when disabled or misconfigured.
    """
    if require_enabled and not OCR_ENABLED:
        raise RuntimeError(
            "OCR is disabled. Set OCR_ENABLED=1 and provider credentials "
            "(e.g. AZURE_DI_ENDPOINT + AZURE_DI_KEY) to enable."
        )
    if OCR_PROVIDER in ("azure", "azure_read", "documentintelligence"):
        from ocr.azure_read import AzureReadProvider

        return AzureReadProvider.from_env()
    if OCR_PROVIDER in ("google", "google_docai", "documentai"):
        from ocr.google_docai import GoogleDocAiProvider

        return GoogleDocAiProvider.from_env()
    if OCR_PROVIDER in ("aws", "textract", "aws_textract"):
        from ocr.aws_textract import AwsTextractProvider

        return AwsTextractProvider.from_env()
    raise RuntimeError(f"Unknown OCR_PROVIDER={OCR_PROVIDER!r}")


__all__ = [
    "OCR_ENABLED",
    "OCR_PROVIDER",
    "OcrProvider",
    "OcrResult",
    "OcrWord",
    "get_ocr_provider",
]
