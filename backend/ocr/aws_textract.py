"""AWS Textract stub — interface only until Phase E justifies wiring."""
from __future__ import annotations

from ocr.base import OcrProvider, OcrResult


class AwsTextractProvider(OcrProvider):
    name = "aws_textract"

    @classmethod
    def from_env(cls) -> AwsTextractProvider:
        return cls()

    def analyze(self, content: bytes, mime_type: str) -> OcrResult:
        raise NotImplementedError(
            "AWS Textract adapter is a stub. "
            "Set OCR_PROVIDER=azure for Phase E evaluation, or implement this provider."
        )
