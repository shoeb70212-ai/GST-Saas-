"""Shared OCR types and provider protocol."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class OcrWord:
    """One recognized word with optional bounding box (normalized 0–1 or pixel)."""

    text: str
    confidence: float | None = None
    # Polygon as flat [x1,y1,x2,y2,...] in page coordinate space (pixels if known).
    bbox: tuple[float, ...] | None = None
    page: int = 1


@dataclass
class OcrResult:
    """Normalized OCR output — provider-agnostic."""

    text: str
    words: list[OcrWord] = field(default_factory=list)
    tables: list[list[list[str]]] = field(default_factory=list)  # page tables optional
    page_count: int = 1
    # page_number -> (width, height) in the same units as word polygons (Azure: inches)
    page_dims: dict[int, tuple[float, float]] = field(default_factory=dict)
    provider: str = ""
    model_id: str = ""
    raw: dict[str, Any] | None = None  # optional truncated diagnostics

    def is_empty(self) -> bool:
        return not (self.text or "").strip()


class OcrProvider(ABC):
    """Classical OCR / layout provider. Implementations must be sync or wrap async."""

    name: str = "base"

    @abstractmethod
    def analyze(self, content: bytes, mime_type: str) -> OcrResult:
        """Run OCR on document bytes. Raises on hard transport/auth errors."""
