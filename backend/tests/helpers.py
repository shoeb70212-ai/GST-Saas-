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
    rpc_results: dict | None = None,
) -> MagicMock:
    """
    Build a fully-configured Supabase async mock that handles the
    most common chained query patterns:
      .auth.get_user(token) -> user_id
      .postgrest.auth(token)
      .table(name).select(cols).eq(col,val).[eq].[execute]() -> data
      .table(name).insert(data).[execute]() -> inserted row
      .rpc(name, params).[execute]() -> rpc result

    Prefer `rpc_results` (name → data) when a route calls multiple RPCs
    (e.g. has_client_access + decrement_credits).
    """
    sc = MagicMock()

    # auth.get_user
    mock_user = MagicMock()
    mock_user.user.id = user_id
    sc.auth.get_user = AsyncMock(return_value=mock_user)
    sc.postgrest.auth = MagicMock()

    table_data = table_data or {}
    table_counts = table_counts or {}
    rpc_by_name = dict(rpc_results or {})

    class _ChainResult:
        """Captures which table was accessed for execute() to return."""

        def __init__(self, name):
            self._name = name
            self._filters = []
            self._last_update = None

        def select(self, *a, **kw):
            return self

        def eq(self, col=None, val=None, *a, **kw):
            if col is not None:
                self._filters.append(("eq", col, val))
            return self

        def neq(self, *a, **kw):
            return self

        def in_(self, *a, **kw):
            return self

        def order(self, *a, **kw):
            return self

        def limit(self, *a, **kw):
            return self

        def gte(self, *a, **kw):
            return self

        def gt(self, *a, **kw):
            return self

        def lt(self, *a, **kw):
            return self

        def lte(self, *a, **kw):
            return self

        def is_(self, *a, **kw):
            return self

        def insert(self, data=None, *a, **kw):
            sc.insert_called_with.append((self._name, data))
            return self

        def update(self, data=None, *a, **kw):
            sc.update_called_with.append((self._name, data))
            self._last_update = data
            return self

        def delete(self, *a, **kw):
            return self

        def maybe_single(self):
            return self

        def range(self, *a, **kw):
            return self

        def single(self):
            return self

        def ilike(self, *a, **kw):
            return self

        def or_(self, *a, **kw):
            return self

        def filter(self, *a, **kw):
            return self

        @property
        def not_(self):
            return self

        async def execute(self):
            result = MagicMock()
            recent_inserts = [
                item for tbl, item in sc.insert_called_with if tbl == self._name
            ]
            if self._last_update is not None:
                data = list(table_data.get(self._name, []) or [])
                id_filter = next(
                    (v for op, c, v in self._filters if op == "eq" and c == "id"),
                    None,
                )
                if id_filter is not None:
                    out = []
                    for row in data:
                        if row.get("id") == id_filter:
                            out.append({**row, **self._last_update})
                        else:
                            out.append(row)
                    table_data[self._name] = out
                    result.data = [r for r in out if r.get("id") == id_filter] or [
                        {**self._last_update}
                    ]
                else:
                    result.data = [self._last_update]
            elif recent_inserts:
                result.data = [{"id": "mock_inserted_id"}]
            else:
                data = table_data.get(self._name, [])
                id_filter = next(
                    (v for op, c, v in self._filters if op == "eq" and c == "id"),
                    None,
                )
                if id_filter is not None and isinstance(data, list):
                    data = [r for r in data if r.get("id") == id_filter]
                result.data = data
            if self._name in table_counts:
                result.count = table_counts[self._name]
            else:
                result.count = len(result.data) if isinstance(result.data, list) else 0
            return result

    sc.insert_called_with = []
    sc.update_called_with = []
    sc.rpc_called_with = []
    sc.table = lambda name: _ChainResult(name)

    def _rpc(func_name: str, params=None):
        sc.rpc_called_with.append((func_name, params))
        rpc_chain = MagicMock()

        async def _rpc_execute():
            if func_name in rpc_by_name:
                return MagicMock(data=rpc_by_name[func_name])
            return MagicMock(data=rpc_result)

        rpc_chain.execute = _rpc_execute
        return rpc_chain

    sc.rpc = MagicMock(side_effect=_rpc)

    # storage mock (bank statement uploads)
    storage_bucket = MagicMock()
    storage_bucket.upload = AsyncMock(return_value=MagicMock())
    storage_bucket.create_signed_url = AsyncMock(
        return_value=MagicMock(data={"signedURL": "https://example.com/signed"})
    )
    sc.storage.from_ = MagicMock(return_value=storage_bucket)

    # auth.admin helpers (for admin routes)
    sc.auth.admin.list_users = AsyncMock(return_value=[])
    sc.auth.admin.delete_user = AsyncMock(return_value=None)
    sc.auth.admin.generate_link = AsyncMock(
        return_value=MagicMock(
            properties=MagicMock(action_link="https://example.com/auth/magic")
        )
    )
    sc.auth.admin.get_user_by_id = AsyncMock(
        return_value=MagicMock(user=MagicMock(email="tenant@example.com", id=user_id))
    )

    return sc


def patch_async_return(mock_patch, return_value):
    """Set side_effect on a patched async factory to return `return_value`."""
    mock_patch.side_effect = make_async_factory(return_value)
