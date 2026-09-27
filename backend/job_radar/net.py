"""Shared HTTP session: polite User-Agent, default timeout, retries with backoff on 429/5xx.

Two guards keep one slow or rate-limiting site from stalling the whole scan:

* :class:`CappedRetry` never sleeps longer than ``MAX_WAIT_PER_RETRY`` seconds per retry, nor more than
  ``MAX_WAIT_TOTAL`` seconds per request in total — whatever ``Retry-After`` asks for (urllib3 would
  otherwise honour up to 6 hours).
* :class:`TimeoutSession` accepts a ``deadline`` (``time.monotonic()`` value). Once it has passed, every
  request raises :class:`BudgetExceeded`, and before that each request's timeout is clamped to the time left.
"""

from __future__ import annotations

import json
import time
from typing import Any, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .models import FetchError

USER_AGENT = "JobRadar/1.0 (+personal job tracker)"
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
BROWSER_HEADERS = {
    "User-Agent": BROWSER_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


MAX_WAIT_PER_RETRY = 10.0  # seconds, per retry (Retry-After or exponential backoff)
MAX_WAIT_TOTAL = 30.0      # seconds of sleeping, per request, across all its retries


class BudgetExceeded(FetchError):
    """The per-company time budget ran out; raised instead of starting another request."""


class CappedRetry(Retry):
    """urllib3 Retry whose sleeps are capped per retry and per request (see module docstring)."""

    def __init__(self, *args, slept: float = 0.0, **kwargs):
        super().__init__(*args, **kwargs)
        self.slept = slept

    def new(self, **kw):  # type: ignore[override]
        kw.setdefault("slept", self.slept)  # carry the running total over to the next attempt
        return super().new(**kw)

    def wait_for(self, response=None) -> float:
        wait: Optional[float] = None
        if self.respect_retry_after_header and response is not None:
            try:
                wait = self.get_retry_after(response)
            except Exception:  # malformed Retry-After → fall back to the backoff formula
                wait = None
        if not wait:
            wait = self.get_backoff_time()
        return max(0.0, min(float(wait or 0.0), MAX_WAIT_PER_RETRY, MAX_WAIT_TOTAL - self.slept))

    def sleep(self, response=None) -> None:  # type: ignore[override]
        wait = self.wait_for(response)
        if wait > 0:
            time.sleep(wait)
            self.slept += wait


class TimeoutSession(requests.Session):
    """requests.Session that applies a default timeout to every request and honours an optional deadline."""

    def __init__(self, timeout: float = 20.0):
        super().__init__()
        self.default_timeout = timeout
        self.deadline: Optional[float] = None  # time.monotonic() value; None = no budget

    def request(self, method, url, **kwargs):  # type: ignore[override]
        kwargs.setdefault("timeout", self.default_timeout)
        if self.deadline is not None:
            left = self.deadline - time.monotonic()
            if left <= 0:
                raise BudgetExceeded("time budget exceeded")
            if isinstance(kwargs["timeout"], (int, float)):
                kwargs["timeout"] = max(1.0, min(float(kwargs["timeout"]), left))
        return super().request(method, url, **kwargs)


#: methods retried on 429/5xx. POST is included for the ATS search APIs (read-only) and the Supabase
#: inserts, which are idempotent (jobs upsert on (company_id, external_id); fetch_runs rows carry a
#: client-generated id and ignore duplicates).
RETRY_METHODS = frozenset({"GET", "POST", "HEAD", "PATCH"})


def make_session(timeout: float = 20.0, retries: int = 3, backoff: float = 0.8,
                 allowed_methods=RETRY_METHODS) -> TimeoutSession:
    session = TimeoutSession(timeout)
    retry = CappedRetry(
        total=retries,
        connect=retries,
        read=2,
        status=retries,
        backoff_factor=backoff,
        backoff_max=MAX_WAIT_PER_RETRY,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(allowed_methods),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=16, pool_maxsize=16)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    return session


def describe_status(status: int, what: str = "board") -> str:
    if status == 404:
        return f"{what} not found (HTTP 404) — check the career URL / identifier"
    if status in (401, 403):
        return f"access denied (HTTP {status}) — the site blocks automated requests"
    if status == 422:
        return f"request rejected (HTTP 422) — the {what} path looks wrong"
    if status == 429:
        return "rate limited (HTTP 429) — try again later"
    if status >= 500:
        return f"site error (HTTP {status})"
    return f"unexpected HTTP {status}"


def _raise_for(resp: requests.Response, what: str) -> None:
    if resp.status_code >= 400:
        raise FetchError(describe_status(resp.status_code, what))


def request_json(session: requests.Session, method: str, url: str, *, what: str = "board", **kwargs) -> Any:
    try:
        resp = session.request(method, url, **kwargs)
    except requests.exceptions.Timeout as exc:
        raise FetchError(f"timed out reading {url}") from exc
    except requests.exceptions.SSLError as exc:
        raise FetchError(f"TLS error talking to {url}") from exc
    except requests.exceptions.ConnectionError as exc:
        raise FetchError(f"could not connect to {url}") from exc
    except requests.exceptions.RequestException as exc:
        raise FetchError(f"request failed: {exc}") from exc
    _raise_for(resp, what)
    try:
        return resp.json()
    except (ValueError, json.JSONDecodeError) as exc:
        raise FetchError(f"expected JSON from {url} but got {resp.headers.get('content-type', 'unknown content')}") from exc


def get_json(session: requests.Session, url: str, *, what: str = "board", **kwargs) -> Any:
    return request_json(session, "GET", url, what=what, **kwargs)


def post_json(session: requests.Session, url: str, body: Any, *, what: str = "board", **kwargs) -> Any:
    headers = {"Content-Type": "application/json", **kwargs.pop("headers", {})}
    return request_json(session, "POST", url, what=what, json=body, headers=headers, **kwargs)


def get_html(session: requests.Session, url: str, **kwargs) -> requests.Response:
    """GET a web page with browser-like headers; raises FetchError on network/HTTP errors."""
    headers = {**BROWSER_HEADERS, **kwargs.pop("headers", {})}
    try:
        resp = session.get(url, headers=headers, allow_redirects=True, **kwargs)
    except requests.exceptions.Timeout as exc:
        raise FetchError(f"timed out loading {url}") from exc
    except requests.exceptions.RequestException as exc:
        raise FetchError(f"could not load {url}: {type(exc).__name__}") from exc
    _raise_for(resp, "career page")
    return resp
