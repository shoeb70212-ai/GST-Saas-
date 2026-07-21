"""
Shared test helpers for patching async Supabase clients.

The key issue: `create_async_client` is an async function (coroutine function).
When patched with `patch(..., new_callable=AsyncMock)`, calling it returns
another coroutine instead of the mock client, causing:
    AttributeError: 'coroutine' object has no attribute 'select'

The fix: use `side_effect` with a plain async def that returns the mock instance.
"""
from unittest.mock import AsyncMock, MagicMock


def make_async_factory(mock_instance):
    """
    Returns an async callable that, when awaited, returns `mock_instance`.
    Use as the `side_effect` of a patched `create_async_client`.

    Example:
        with patch("payment_routes.create_async_client") as mock_create:
            mock_sc = build_supabase_mock(...)
            mock_create.side_effect = make_async_factory(mock_sc)
            ...
    """
    async def _factory(*args, **kwargs):
        return mock_instance
    return _factory


def build_supabase_mock(
    user_id: str = "user-123",
    is_super_admin: bool = False,
    table_data: dict | None = None,
    table_counts: dict | None = None,
    rpc_result: int = 1,
) -> MagicMock:
    """
    Build a fully-configured Supabase async mock that handles the
    most common chained query patterns:
      .auth.get_user(token) -> user_id
      .postgrest.auth(token)
      .table(name).select(cols).eq(col,val).[eq].[execute]() -> data
      .table(name).insert(data).[execute]() -> inserted row
      .rpc(name, params).[execute]() -> rpc result
    """
    sc = MagicMock()

    # auth.get_user
    mock_user = MagicMock()
    mock_user.user.id = user_id
    sc.auth.get_user = AsyncMock(return_value=mock_user)
    sc.postgrest.auth = MagicMock()

    table_data = table_data or {}
    table_counts = table_counts or {}

    class _ChainResult:
        """Captures which table was accessed for execute() to return."""
        def __init__(self, name):
            self._name = name

        # All builder methods return self
        def select(self, *a, **kw): return self
        def eq(self, *a, **kw): return self
        def neq(self, *a, **kw): return self
        def in_(self, *a, **kw): return self
        def order(self, *a, **kw): return self
        def limit(self, *a, **kw): return self
        def gte(self, *a, **kw): return self
        def insert(self, data=None, *a, **kw):
            sc.insert_called_with.append((self._name, data))
            return self
        def update(self, *a, **kw): return self
        def delete(self, *a, **kw): return self
        def single(self): return self

        async def execute(self):
            result = MagicMock()
            recent_inserts = [
                item for tbl, item in sc.insert_called_with if tbl == self._name
            ]
            if recent_inserts:
                result.data = [{"id": "mock_inserted_id"}]
            else:
                data = table_data.get(self._name, [])
                result.data = data
            if self._name in table_counts:
                result.count = table_counts[self._name]
            else:
                result.count = len(result.data) if isinstance(result.data, list) else 0
            return result

    sc.insert_called_with = []
    sc.table = lambda name: _ChainResult(name)

    # rpc mock
    async def _rpc_execute():
        return MagicMock(data=rpc_result)
    rpc_chain = MagicMock()
    rpc_chain.execute = _rpc_execute
    sc.rpc = MagicMock(return_value=rpc_chain)

    # storage mock (bank statement uploads)
    storage_bucket = MagicMock()
    storage_bucket.upload = AsyncMock(return_value=MagicMock())
    storage_bucket.create_signed_url = AsyncMock(
        return_value=MagicMock(data={"signedURL": "https://example.com/signed"})
    )
    sc.storage.from_ = MagicMock(return_value=storage_bucket)

    # auth.admin.list_users (for admin routes)
    sc.auth.admin.list_users = AsyncMock(return_value=[])
    sc.auth.admin.delete_user = AsyncMock(return_value=None)

    return sc


def patch_async_return(mock_patch, return_value):
    """Set side_effect on a patched async factory to return `return_value`."""
    mock_patch.side_effect = make_async_factory(return_value)
