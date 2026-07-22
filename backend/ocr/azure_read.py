"""
Azure AI Document Intelligence — Read / Layout adapter.

Pricing (approx.): prebuilt-read ~$1.50/1k pages; prebuilt-layout ~$10/1k.
Do NOT use prebuilt-invoice here — Western schema, no GSTIN/HSN/CGST.

Env:
  AZURE_DI_ENDPOINT   e.g. https://<resource>.cognitiveservices.azure.com/
  AZURE_DI_KEY
  AZURE_DI_MODEL      default prebuilt-read (override with prebuilt-layout)
"""
from __future__ import annotations

import logging
import os
from typing import Any

from ocr.base import OcrProvider, OcrResult, OcrWord

logger = logging.getLogger(__name__)


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


class AzureReadProvider(OcrProvider):
    name = "azure_read"

    def __init__(
        self,
        endpoint: str,
        key: str,
        *,
        model_id: str = "prebuilt-read",
    ) -> None:
        if not endpoint or not key:
            raise RuntimeError(
                "Azure DI requires AZURE_DI_ENDPOINT and AZURE_DI_KEY."
            )
        self.endpoint = endpoint.rstrip("/")
        self.key = key
        self.model_id = model_id or "prebuilt-read"
        self._client = None

    @classmethod
    def from_env(cls) -> AzureReadProvider:
        return cls(
            endpoint=_env("AZURE_DI_ENDPOINT"),
            key=_env("AZURE_DI_KEY"),
            model_id=_env("AZURE_DI_MODEL", "prebuilt-read"),
        )

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            from azure.ai.documentintelligence import DocumentIntelligenceClient
            from azure.core.credentials import AzureKeyCredential
        except ImportError as e:
            raise RuntimeError(
                "Install azure-ai-documentintelligence: "
                "pip install azure-ai-documentintelligence"
            ) from e
        self._client = DocumentIntelligenceClient(
            endpoint=self.endpoint,
            credential=AzureKeyCredential(self.key),
        )
        return self._client

    def analyze(self, content: bytes, mime_type: str) -> OcrResult:
        if not content:
            return OcrResult(text="", provider=self.name, model_id=self.model_id)

        client = self._get_client()
        # SDK 1.0+ accepts bytes with content_type; fall back to AnalyzeDocumentRequest.
        result = self._analyze_bytes(client, content, mime_type)
        return parse_azure_result(result, provider=self.name, model_id=self.model_id)

    def _analyze_bytes(self, client, content: bytes, mime_type: str):
        content_type = mime_type or "application/octet-stream"
        try:
            poller = client.begin_analyze_document(
                model_id=self.model_id,
                body=content,
                content_type=content_type,
            )
            return poller.result()
        except TypeError:
            # Older / alternate signature
            from azure.ai.documentintelligence.models import AnalyzeDocumentRequest

            poller = client.begin_analyze_document(
                self.model_id,
                AnalyzeDocumentRequest(bytes_source=content),
            )
            return poller.result()


def parse_azure_result(
    result: Any,
    *,
    provider: str = "azure_read",
    model_id: str = "prebuilt-read",
) -> OcrResult:
    """
    Normalize an Azure AnalyzeResult (or dict-like) into OcrResult.

    Kept separate for hermetic unit tests without the SDK.
    """
    if result is None:
        return OcrResult(text="", provider=provider, model_id=model_id)

    # Prefer full content string when present.
    text = getattr(result, "content", None)
    if text is None and isinstance(result, dict):
        text = result.get("content")
    text = text or ""

    words: list[OcrWord] = []
    page_dims: dict[int, tuple[float, float]] = {}
    pages = getattr(result, "pages", None)
    if pages is None and isinstance(result, dict):
        pages = result.get("pages") or []

    for page in pages or []:
        if isinstance(page, dict):
            page_num = int(page.get("page_number") or 1)
            page_words = page.get("words") or []
            pw = page.get("width")
            ph = page.get("height")
        else:
            page_num = int(getattr(page, "page_number", 1) or 1)
            page_words = getattr(page, "words", None) or []
            pw = getattr(page, "width", None)
            ph = getattr(page, "height", None)
        try:
            if pw and ph:
                page_dims[page_num] = (float(pw), float(ph))
        except (TypeError, ValueError):
            pass

        for w in page_words:
            if isinstance(w, dict):
                wtext = str(w.get("content") or "")
                conf = w.get("confidence")
                poly = w.get("polygon")
            else:
                wtext = str(getattr(w, "content", "") or "")
                conf = getattr(w, "confidence", None)
                poly = getattr(w, "polygon", None)
            if not wtext:
                continue
            bbox: tuple[float, ...] | None = None
            if poly:
                try:
                    bbox = tuple(float(x) for x in poly)
                except (TypeError, ValueError):
                    bbox = None
            conf_f = float(conf) if conf is not None else None
            words.append(
                OcrWord(text=wtext, confidence=conf_f, bbox=bbox, page=page_num)
            )

    # If content was empty but we have words, join them.
    if not text.strip() and words:
        text = " ".join(w.text for w in words)

    page_count = len(pages) if pages else (1 if text else 0)
    return OcrResult(
        text=text,
        words=words,
        page_count=page_count or 1,
        page_dims=page_dims,
        provider=provider,
        model_id=model_id,
    )
