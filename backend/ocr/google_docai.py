"""Google Document AI stub — interface only until Phase E justifies wiring."""
from __future__ import annotations

from ocr.base import OcrProvider, OcrResult


class GoogleDocAiProvider(OcrProvider):
    name = "google_docai"

    @classmethod
    def from_env(cls) -> GoogleDocAiProvider:
        return cls()

    def analyze(self, content: bytes, mime_type: str) -> OcrResult:
        raise NotImplementedError(
            "Google Document AI adapter is a stub. "
            "Set OCR_PROVIDER=azure for Phase E evaluation, or implement this provider."
        )
