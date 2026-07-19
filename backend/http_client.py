import httpx
from contextlib import asynccontextmanager

_shared_client = None

@asynccontextmanager
async def get_shared_client(*args, **kwargs):
    global _shared_client
    if _shared_client is None:
        # Default timeout if not provided
        if 'timeout' not in kwargs:
            kwargs['timeout'] = 10.0
        _shared_client = httpx.AsyncClient(*args, **kwargs)
    yield _shared_client
