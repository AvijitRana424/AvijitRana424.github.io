"""HTTP guards: capped Retry-After / backoff sleeps and the per-company deadline."""

import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
import requests

from job_radar import net
from job_radar.net import BudgetExceeded, CappedRetry, TimeoutSession, make_session


class _Resp:
    def __init__(self, retry_after=None):
        self.headers = {"Retry-After": retry_after} if retry_after is not None else {}


def test_retry_after_is_capped_per_retry_and_per_request():
    r = CappedRetry(total=5, status=5, backoff_factor=0.8)
    assert r.wait_for(_Resp("3600")) == net.MAX_WAIT_PER_RETRY  # urllib3 alone would sleep an hour
    assert r.wait_for(_Resp("2")) == 2
    assert r.wait_for(_Resp("not-a-date")) == 0  # malformed header → backoff (0 on the first retry)
    r.slept = net.MAX_WAIT_TOTAL - 4
    assert r.wait_for(_Resp("3600")) == 4  # only what is left of the per-request total
    r.slept = net.MAX_WAIT_TOTAL
    assert r.wait_for(_Resp("3600")) == 0


def test_capped_retry_carries_the_running_total():
    r = CappedRetry(total=3, status=3)
    r.slept = 12.5
    assert r.new(total=2).slept == 12.5 and isinstance(r.new(), CappedRetry)


class _RateLimited(BaseHTTPRequestHandler):
    hits = 0

    def do_GET(self):  # noqa: N802 (http.server API)
        type(self).hits += 1
        self.send_response(429)
        self.send_header("Retry-After", "3600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args):
        pass


def test_session_never_honours_an_hour_long_retry_after(monkeypatch):
    sleeps = []
    monkeypatch.setattr(net.time, "sleep", lambda s: sleeps.append(s))
    server = HTTPServer(("127.0.0.1", 0), _RateLimited)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        _RateLimited.hits = 0
        resp = make_session(5).get(f"http://127.0.0.1:{server.server_port}/jobs")
    finally:
        server.shutdown()
    assert resp.status_code == 429 and _RateLimited.hits == 4  # 1 try + 3 retries
    assert sleeps and max(sleeps) <= net.MAX_WAIT_PER_RETRY and sum(sleeps) <= net.MAX_WAIT_TOTAL


def test_deadline_stops_new_requests_and_clamps_timeouts(monkeypatch):
    seen = {}

    def fake_request(self, method, url, **kwargs):
        seen.update(kwargs)
        return "ok"

    monkeypatch.setattr(requests.Session, "request", fake_request)
    s = TimeoutSession(20)
    assert s.request("GET", "https://x") == "ok" and seen["timeout"] == 20  # no budget → default timeout

    s.deadline = time.monotonic() + 5
    s.request("GET", "https://x")
    assert 1.0 <= seen["timeout"] <= 5  # never longer than the time left

    s.deadline = time.monotonic() - 1
    with pytest.raises(BudgetExceeded):
        s.request("GET", "https://x")
    assert issubclass(BudgetExceeded, net.FetchError)  # callers treat it like any other fetch failure
