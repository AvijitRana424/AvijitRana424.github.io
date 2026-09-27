"""Minimal Supabase PostgREST client (service-role key) + the few queries the scanner needs.

The scanner only ever writes *scraped* columns of ``jobs``; the user-managed columns
(status, notes, applied_at, status_updated_at) are never sent, so re-scans cannot clobber them.
"""

from __future__ import annotations

import re
import threading
import uuid
from datetime import datetime, timedelta
from typing import Any, Iterable, List, Mapping, Optional, Sequence, Tuple, Union

import requests

from .net import make_session

Filter = Tuple[str, str, Any]  # (column, op, value)   op: eq neq gt gte lt lte in is not.is
Filters = Union[Sequence[Filter], Mapping[str, Any], None]

#: columns of ``jobs`` the user owns — the scanner must never write them
USER_MANAGED_JOB_FIELDS = frozenset({"status", "notes", "applied_at", "status_updated_at"})

PAGE_SIZE = 1000
ID_CHUNK = 100
#: a fetch_runs row still 'running' after this long belongs to a run that was killed (cancel / timeout)
STALE_RUN_AFTER = timedelta(hours=2)

_CONTENT_RANGE = re.compile(r"^\s*(?:\d+-\d+|\*)/(\d+|\*)\s*$")


class DBError(RuntimeError):
    pass


def _literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _quote(value: Any) -> str:
    s = _literal(value)
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _as_filters(filters: Filters) -> List[Filter]:
    if not filters:
        return []
    if isinstance(filters, Mapping):
        return [(k, "eq", v) for k, v in filters.items()]
    return list(filters)


def encode_filters(filters: Filters) -> List[Tuple[str, str]]:
    """Turn (column, op, value) triples into PostgREST query parameters."""
    params: List[Tuple[str, str]] = []
    for column, op, value in _as_filters(filters):
        if op == "in":
            params.append((column, "in.(" + ",".join(_quote(v) for v in value) + ")"))
        elif op in ("is", "not.is"):
            params.append((column, f"{op}.{_literal(value)}"))
        elif op == "eq" and value is None:
            params.append((column, "is.null"))
        elif op == "neq" and value is None:
            params.append((column, "not.is.null"))
        elif op in ("eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike"):
            params.append((column, f"{op}.{_literal(value)}"))
        else:
            raise ValueError(f"unsupported filter operator {op!r}")
    return params


def _chunks(items: Sequence[Any], size: int = ID_CHUNK) -> Iterable[Sequence[Any]]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


class PostgrestClient:
    """select / insert / update against ``<SUPABASE_URL>/rest/v1``."""

    def __init__(self, url: str, key: str, timeout: float = 20.0):
        if not url or not key:
            raise DBError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        self.base = url.rstrip("/") + "/rest/v1"
        self.key = key
        self.timeout = timeout
        self._local = threading.local()

    # one requests.Session per thread (the scanner works on several companies at once)
    @property
    def session(self) -> requests.Session:
        s = getattr(self._local, "session", None)
        if s is None:
            s = make_session(self.timeout, retries=3)
            headers = {
                "apikey": self.key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            # Legacy service_role keys are JWTs and go in Authorization too. The newer
            # "sb_secret_..." keys are not JWTs: the apikey header alone grants the role.
            if not self.key.startswith("sb_"):
                headers["Authorization"] = f"Bearer {self.key}"
            s.headers.update(headers)
            self._local.session = s
        return s

    def _request(self, method: str, table: str, params=None, json_body=None, prefer: Optional[str] = None,
                 headers: Optional[dict] = None) -> requests.Response:
        hdrs = dict(headers or {})
        if prefer:
            hdrs["Prefer"] = prefer
        try:
            resp = self.session.request(method, f"{self.base}/{table}", params=params, json=json_body, headers=hdrs)
        except requests.exceptions.RequestException as exc:
            raise DBError(f"Supabase request failed ({method} {table}): {type(exc).__name__}") from exc
        if resp.status_code >= 400:
            detail = resp.text[:300]
            try:
                body = resp.json()
                detail = "; ".join(str(body.get(k)) for k in ("message", "details", "hint") if body.get(k)) or detail
            except ValueError:
                pass
            raise DBError(f"Supabase {method} {table} → HTTP {resp.status_code}: {detail}")
        return resp

    def select(self, table: str, columns: str = "*", filters: Filters = None, order: Optional[str] = None,
               limit: Optional[int] = None) -> List[dict]:
        """All matching rows, paged. Pass a unique ``order`` (e.g. ``id.asc``) for stable pages.

        Paging asks PostgREST for the exact row count (``Prefer: count=exact``) and keeps going until it
        has them all, so a project whose *max rows* setting is below PAGE_SIZE is not silently truncated."""
        base_params: List[Tuple[str, str]] = [("select", columns), *encode_filters(filters)]
        if order:
            base_params.append(("order", order))
        rows: List[dict] = []
        offset = 0
        total: Optional[int] = None
        while True:
            want = PAGE_SIZE if limit is None else min(PAGE_SIZE, limit - len(rows))
            params = base_params + [("limit", str(want)), ("offset", str(offset))]
            resp = self._request("GET", table, params=params, prefer="count=exact" if offset == 0 else None)
            page = resp.json()
            if total is None and offset == 0:
                total = _total_from(resp)
            rows.extend(page)
            offset += len(page)
            if not page or (limit is not None and len(rows) >= limit):
                return rows
            if total is not None:
                if len(rows) >= total:
                    return rows
            elif len(page) < want:
                return rows

    def insert(self, table: str, rows: Union[dict, Sequence[dict]], on_conflict: Optional[str] = None,
               ignore_duplicates: bool = False) -> List[dict]:
        payload = [rows] if isinstance(rows, dict) else list(rows)
        if not payload:
            return []
        params = [("on_conflict", on_conflict)] if on_conflict else None
        prefer = "return=representation"
        if ignore_duplicates:
            prefer += ",resolution=ignore-duplicates"
        return self._request("POST", table, params=params, json_body=payload, prefer=prefer).json()

    def update(self, table: str, values: Mapping[str, Any], filters: Filters) -> List[dict]:
        params = encode_filters(filters)
        if not params:
            raise DBError("refusing to update without a filter")
        return self._request("PATCH", table, params=params, json_body=dict(values), prefer="return=representation").json()


def _total_from(resp) -> Optional[int]:
    """Row count from a ``Content-Range: 0-999/1234`` header (None when absent or ``*``)."""
    headers = getattr(resp, "headers", None) or {}
    try:
        value = headers.get("Content-Range") or headers.get("content-range")
    except AttributeError:
        return None
    m = _CONTENT_RANGE.match(value or "")
    if not m or m.group(1) == "*":
        return None
    return int(m.group(1))


# ---------------------------------------------------------------------------
#  Job Radar queries
# ---------------------------------------------------------------------------

def _iso(dt: datetime) -> str:
    return dt.isoformat()


class JobRadarDB:
    """The handful of reads/writes the scanner performs. ``client`` is a PostgrestClient (or a fake in tests)."""

    def __init__(self, client):
        self.client = client

    # --- reads ---------------------------------------------------------------
    def load_criteria_row(self) -> Optional[dict]:
        rows = self.client.select("search_criteria", "*", order="updated_at.desc", limit=1)
        return rows[0] if rows else None

    def load_companies(self, name: Optional[str] = None) -> List[dict]:
        if not name:
            return self.client.select("companies", "*", filters=[("active", "eq", True)], order="name.asc")
        rows = self.client.select("companies", "*", order="name.asc")
        wanted = name.strip().lower()
        exact = [r for r in rows if str(r.get("name", "")).strip().lower() == wanted]
        return exact or [r for r in rows if wanted in str(r.get("name", "")).lower()]

    def jobs_for_company(self, company_id: str) -> List[dict]:
        return self.client.select(
            "jobs", "id,external_id,is_active,source,title,status", filters=[("company_id", "eq", company_id)],
            order="id.asc",
        )

    def pending_digest_jobs(self, since: datetime) -> List[dict]:
        """Scraped, active, not yet e-mailed matches. Jobs the owner archived are never e-mailed."""
        return self.client.select(
            "jobs",
            "id,company_id,title,url,location,match_score,match_reasons,posted_at,date_found",
            filters=[("notified", "eq", False), ("source", "eq", "scraper"), ("is_active", "eq", True),
                     ("status", "neq", "archived"), ("date_found", "gte", _iso(since))],
            order="match_score.desc,id.asc",
        )

    # --- writes --------------------------------------------------------------
    def fail_stale_runs(self, now: datetime, older_than: timedelta = STALE_RUN_AFTER) -> int:
        """Close fetch_runs rows left 'running' by a run that was cancelled, timed out or killed."""
        rows = self.client.update(
            "fetch_runs",
            {"status": "failed", "finished_at": _iso(now),
             "errors": [{"company": "(scanner)", "message": "run did not finish (cancelled, timed out or killed)"}]},
            [("status", "eq", "running"), ("started_at", "lt", _iso(now - older_than))],
        )
        return len(rows or [])

    def start_run(self, trigger: str, started_at: datetime) -> Optional[str]:
        # The id is generated here so a retried POST (response lost, request re-sent) cannot create a
        # second row that nobody finishes: the duplicate is ignored and we still know our id.
        run_id = str(uuid.uuid4())
        self.client.insert("fetch_runs", {"id": run_id, "status": "running", "trigger": trigger,
                                          "started_at": _iso(started_at)},
                           on_conflict="id", ignore_duplicates=True)
        return run_id

    def finish_run(self, run_id: str, values: Mapping[str, Any]) -> None:
        self.client.update("fetch_runs", values, [("id", "eq", run_id)])

    def update_company(self, company_id: str, values: Mapping[str, Any]) -> None:
        self.client.update("companies", values, [("id", "eq", company_id)])

    def insert_jobs(self, rows: Sequence[dict]) -> List[dict]:
        for row in rows:
            bad = USER_MANAGED_JOB_FIELDS & set(row)
            if bad:
                raise DBError(f"scanner must not write user-managed job fields: {sorted(bad)}")
        return self.client.insert("jobs", rows, on_conflict="company_id,external_id", ignore_duplicates=True)

    def touch_jobs(self, ids: Sequence[str], seen_at: datetime) -> None:
        for chunk in _chunks(list(ids)):
            self.client.update("jobs", {"last_seen_at": _iso(seen_at), "is_active": True}, [("id", "in", list(chunk))])

    def deactivate_jobs(self, ids: Sequence[str]) -> None:
        for chunk in _chunks(list(ids)):
            self.client.update("jobs", {"is_active": False}, [("id", "in", list(chunk))])

    def mark_notified(self, ids: Sequence[str], value: bool = True) -> None:
        for chunk in _chunks(list(ids)):
            self.client.update("jobs", {"notified": value}, [("id", "in", list(chunk))])


def connect(settings) -> JobRadarDB:
    return JobRadarDB(PostgrestClient(settings.supabase_url, settings.supabase_key, settings.request_timeout))
