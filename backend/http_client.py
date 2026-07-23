"""
Process-wide shared httpx.AsyncClient.

Creation is serialized with an asyncio.Lock so concurrent callers cannot
orphan multiple clients. Call ``close_shared_client()`` on app shutdown.
Per-request timeouts belong on ``.get()`` / ``.post(..., timeout=...)``,
not on ``get_shared_client(timeout=...)`` after the client already exists.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

import httpx

logger = logging.getLogger(__name__)

_shared_client: httpx.AsyncClient | None = None
_lock = asyncio.Lock()

# Generous defaults: GSTIN/RPC are fast; storage uploads may be larger.
_DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


@asynccontextmanager
async def get_shared_client(*args, **kwargs):
    """
    Yield the shared AsyncClient, creating it on first use.

    Extra args/kwargs are only applied when creating the client. If a
    ``timeout`` is passed after the client already exists it is ignored
    (use request-level timeout instead).
    """
    global _shared_client
    async with _lock:
        if _shared_client is None or _shared_client.is_closed:
            create_kwargs = dict(kwargs)
            if args:
                logger.warning(
                    "get_shared_client ignoring positional args %s on create",
                    args,
                )
            if "timeout" not in create_kwargs:
                create_kwargs["timeout"] = _DEFAULT_TIMEOUT
            _shared_client = httpx.AsyncClient(**create_kwargs)
        elif kwargs.get("timeout") is not None:
            # Sticky client: per-call timeout must be set on the HTTP method.
            pass
    yield _shared_client


async def close_shared_client() -> None:
    """Close and clear the shared client (idempotent)."""
    global _shared_client
    async with _lock:
        client = _shared_client
        _shared_client = None
    if client is not None and not client.is_closed:
        await client.aclose()
