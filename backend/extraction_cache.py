"""
In-memory idempotency cache for invoice extraction results.

Key: SHA-256 of content + model ids + prompt version (+ optional ledger fingerprint).
Bounded LRU — process-local only (not shared across workers; still cuts repeat
scans in the same uvicorn process / bench runs).
"""
from __future__ import annotations

import hashlib
import threading
import time
from collections import OrderedDict
from typing import Any

_DEFAULT_MAX = 256
_lock = threading.Lock()
_store: OrderedDict[str, tuple[float, dict[str, Any], int]] = OrderedDict()
_max_entries = _DEFAULT_MAX


def configure(max_entries: int = _DEFAULT_MAX) -> None:
    global _max_entries
    with _lock:
        _max_entries = max(8, int(max_entries))
        while len(_store) > _max_entries:
            _store.popitem(last=False)


def clear() -> None:
    with _lock:
        _store.clear()


def content_sha256(content: bytes | str) -> str:
    if isinstance(content, str):
        raw = content.encode("utf-8")
    else:
        raw = content
    return hashlib.sha256(raw).hexdigest()


def make_cache_key(
    *,
    content: bytes | str,
    mime_type: str,
    primary_model: str | None,
    verify_model: str | None,
    prompt_version: str,
    ledger_fingerprint: str = "",
) -> str:
    h = content_sha256(content)
    parts = [
        h,
        mime_type or "",
        primary_model or "",
        verify_model or "",
        prompt_version,
        ledger_fingerprint,
    ]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def get(key: str) -> tuple[dict[str, Any], int] | None:
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        _store.move_to_end(key)
        _ts, data, tokens = item
        # Shallow copy so callers cannot mutate the cache entry
        return dict(data), tokens


def put(key: str, data: dict[str, Any], tokens: int) -> None:
    with _lock:
        if key in _store:
            _store.move_to_end(key)
        _store[key] = (time.time(), dict(data), int(tokens))
        while len(_store) > _max_entries:
            _store.popitem(last=False)


def size() -> int:
    with _lock:
        return len(_store)
