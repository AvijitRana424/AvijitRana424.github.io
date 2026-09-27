"""Shared fakes: no test touches the network."""

from __future__ import annotations

import copy
import json
import sys
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import pytest

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def load_fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def fixture_text(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
#  HTTP
# ---------------------------------------------------------------------------

class FakeResponse:
    def __init__(self, status: int = 200, body: Any = None, text: Optional[str] = None, url: str = "",
                 headers: Optional[dict] = None):
        self.status_code = status
        self._body = body
        self.text = text if text is not None else (json.dumps(body) if body is not None else "")
        self.url = url
        self.headers = headers or {"content-type": "application/json" if text is None else "text/html"}

    def json(self):
        if self._body is None:
            return json.loads(self.text)
        return copy.deepcopy(self._body)

    def close(self):
        pass


Route = Union[FakeResponse, Callable[[str, str, dict], FakeResponse]]


class FakeSession:
    """Routes requests by URL substring. Records every call in ``calls`` as (method, url, kwargs)."""

    def __init__(self, routes: Optional[Dict[str, Route]] = None):
        self.routes: Dict[str, Route] = dict(routes or {})
        self.calls: List[Tuple[str, str, dict]] = []
        self.headers: dict = {}

    def add(self, pattern: str, route: Route) -> "FakeSession":
        self.routes[pattern] = route
        return self

    def request(self, method: str, url: str, **kwargs) -> FakeResponse:
        self.calls.append((method.upper(), url, kwargs))
        # longest matching pattern wins, so specific routes can override general ones
        for pattern in sorted(self.routes, key=len, reverse=True):
            if pattern in url:
                route = self.routes[pattern]
                resp = route(method.upper(), url, kwargs) if callable(route) else route
                if not resp.url:
                    resp.url = url
                return resp
        return FakeResponse(404, {"error": "no route"}, url=url)

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)


def json_route(body: Any, status: int = 200) -> FakeResponse:
    return FakeResponse(status, body)


def html_route(text: str, status: int = 200, url: str = "") -> FakeResponse:
    return FakeResponse(status, None, text=text, url=url, headers={"content-type": "text/html"})


@pytest.fixture
def fake_session():
    return FakeSession()


# ---------------------------------------------------------------------------
#  PostgREST
# ---------------------------------------------------------------------------

class FakeClient:
    """In-memory stand-in for PostgrestClient with the same select/insert/update signatures."""

    DEFAULTS = {
        "jobs": lambda: {"status": "new", "notes": None, "applied_at": None, "notified": False, "is_active": True,
                         "source": "scraper", "match_reasons": [], "match_score": 0},
        "fetch_runs": lambda: {"status": "running", "errors": [], "email_sent": False},
        "companies": lambda: {"active": True, "ats_type": "auto", "last_status": "pending", "jobs_seen_count": 0},
        "search_criteria": lambda: {},
    }

    def __init__(self, tables: Optional[Dict[str, List[dict]]] = None):
        self.tables: Dict[str, List[dict]] = {k: [dict(r) for r in v] for k, v in (tables or {}).items()}
        self.log: List[Tuple[str, str, Any]] = []

    @staticmethod
    def _matches(row: dict, filters) -> bool:
        if not filters:
            return True
        items = filters.items() if isinstance(filters, dict) else filters
        for f in items:
            col, op, val = (f[0], "eq", f[1]) if isinstance(filters, dict) else f
            cur = row.get(col)
            if op == "eq" and cur != val:
                return False
            if op == "neq" and cur == val:
                return False
            if op == "in" and cur not in val:
                return False
            if op == "gte" and not (cur is not None and str(cur) >= str(val)):
                return False
            if op == "lt" and not (cur is not None and str(cur) < str(val)):
                return False
            if op == "is" and cur is not val:
                return False
        return True

    def select(self, table, columns="*", filters=None, order=None, limit=None):
        self.log.append(("select", table, filters))
        rows = [dict(r) for r in self.tables.get(table, []) if self._matches(r, filters)]
        if order:
            for part in reversed(order.split(",")):  # stable sorts, last key first
                col, _, direction = part.partition(".")
                rows.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=direction == "desc")
        if columns != "*":
            keep = [c.strip() for c in columns.split(",")]
            rows = [{k: r.get(k) for k in keep} for r in rows]
        return rows[:limit] if limit else rows

    def insert(self, table, rows, on_conflict=None, ignore_duplicates=False):
        payload = [rows] if isinstance(rows, dict) else list(rows)
        self.log.append(("insert", table, payload))
        out = []
        existing = self.tables.setdefault(table, [])
        for r in payload:
            if on_conflict:
                keys = on_conflict.split(",")
                if any(all(e.get(k) == r.get(k) for k in keys) for e in existing):
                    if ignore_duplicates:
                        continue
                    raise RuntimeError("duplicate key")
            row = {**self.DEFAULTS.get(table, dict)(), "id": str(uuid.uuid4()), **r}
            existing.append(row)
            out.append(dict(row))
        return out

    def update(self, table, values, filters):
        self.log.append(("update", table, (dict(values), filters)))
        out = []
        for row in self.tables.get(table, []):
            if self._matches(row, filters):
                row.update(values)
                out.append(dict(row))
        return out


@pytest.fixture
def fake_client():
    return FakeClient()
