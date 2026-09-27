"""Custom career pages: embedded-ATS discovery, JSON-LD, link heuristics, pagination, JS-rendered pages."""

from datetime import datetime, timezone

import pytest

from conftest import FakeResponse, FakeSession, fixture_text, html_route, json_route, load_fixture
from job_radar.ats import custom
from job_radar.models import FetchError, default_criteria


def test_find_embedded_greenhouse():
    assert custom.find_embedded_ats(fixture_text("custom_embed.html")) == ("greenhouse", "acme")


def test_find_embedded_in_js_escaped_urls():
    assert custom.find_embedded_ats(fixture_text("custom_lever_escaped.html")) == ("lever", "umbrella")


def test_find_embedded_from_browser_requests():
    found = custom.find_embedded_ats("<html></html>", ["https://cdn.example/app.js",
                                                         "https://postman.wd108.myworkdayjobs.com/wday/cxs/postman/careers/jobs"])
    assert found == ("workday", "postman.wd108.myworkdayjobs.com/postman/careers")


def test_marketing_links_are_not_boards():
    html = '<a href="https://www.greenhouse.io/">Powered by Greenhouse</a><a href="https://www.lever.co/">Lever</a>'
    assert custom.find_embedded_ats(html) is None


def test_fetch_reroutes_to_embedded_ats():
    s = FakeSession({
        "https://acme.example/careers": html_route(fixture_text("custom_embed.html")),
        "boards-api.greenhouse.io/v1/boards/acme/jobs": json_route(load_fixture("greenhouse_stripe.json")),
    })
    ps = custom.fetch("https://acme.example/careers", s, default_criteria())
    assert ps.detected == ("greenhouse", "acme")
    assert ps.complete is True and len(ps) == 5


def test_json_ld_postings():
    ps = custom.parse_json_ld(fixture_text("custom_jsonld.html"), "https://globex.example/careers")
    assert [p.title for p in ps] == ["Senior Backend Engineer (Java)", "Platform Engineer"]
    first, remote = ps
    assert first.external_id == "ld:GBX-1042"
    assert first.url == "https://globex.example/careers/gbx-1042"
    assert first.location == "Bengaluru, KA, India"
    assert first.employment_type == "Full-time"
    assert first.posted_at == datetime(2026, 9, 20, tzinfo=timezone.utc)
    assert "4+ years of experience" in first.description_text and "<b>" not in first.description_text
    assert remote.remote is True and remote.location == "Remote (India)"
    assert remote.external_id == "https://globex.example/careers/platform"


def test_link_heuristics_titles_and_locations():
    c = default_criteria()
    ps = custom.parse_links(fixture_text("custom_links_p1.html"), "https://initech.example/careers", c)
    titles = [p.title for p in ps]
    assert titles == ["Senior Software Engineer, Payments", "Backend Developer", "Product Designer", "Data Analyst"]
    by = {p.title: p for p in ps}
    assert by["Senior Software Engineer, Payments"].location == "Bengaluru, India"
    assert by["Backend Developer"].location == "Remote" and by["Backend Developer"].remote is True
    assert by["Product Designer"].location == "Berlin, Germany"
    assert by["Data Analyst"].location == "Austin, TX"
    # tracking params dropped from the identity, relative links resolved
    assert by["Backend Developer"].external_id == "https://initech.example/careers/jobs/1202-backend-developer"
    assert by["Backend Developer"].url.startswith("https://initech.example/careers/jobs/1202")


def test_fetch_follows_pagination():
    s = FakeSession({
        "https://initech.example/careers?page=2": html_route(fixture_text("custom_links_p2.html")),
        "https://initech.example/careers": html_route(fixture_text("custom_links_p1.html")),
    })
    ps = custom.fetch("https://initech.example/careers", s, default_criteria())
    assert ps.complete is False and ps.detected is None
    assert len(ps) == 5  # 4 on page 1 + 1 new on page 2 (duplicate skipped)
    assert "Software Engineer II" in [p.title for p in ps]


def test_fetch_follows_view_openings_link():
    s = FakeSession({
        "https://hooli.example/careers/openings": html_route(fixture_text("custom_links_p2.html")),
        "https://hooli.example/careers": html_route(fixture_text("custom_landing.html")),
    })
    ps = custom.fetch("hooli.example/careers", s, default_criteria())
    assert sorted(p.title for p in ps) == ["Senior Software Engineer, Payments", "Software Engineer II"]


def test_js_rendered_page_without_browser_has_helpful_error(monkeypatch):
    monkeypatch.setattr(custom, "playwright_available", lambda: False)
    s = FakeSession({"https://app.example/careers": html_route(fixture_text("custom_js_shell.html"))})
    assert custom.looks_js_rendered(fixture_text("custom_js_shell.html"))
    with pytest.raises(FetchError, match="ENABLE_BROWSER"):
        custom.fetch("https://app.example/careers", s, default_criteria())


def test_js_rendered_page_uses_browser_when_available(monkeypatch):
    monkeypatch.setattr(custom, "playwright_available", lambda: True)
    monkeypatch.setattr(custom, "render_with_browser", lambda url: (
        fixture_text("custom_links_p2.html"), url, ["https://app.example/static/main.js"]))
    s = FakeSession({"https://app.example/careers": html_route(fixture_text("custom_js_shell.html"))})
    ps = custom.fetch("https://app.example/careers", s, default_criteria())
    assert len(ps) == 2


def test_page_errors_are_fetch_errors():
    s = FakeSession({"https://gone.example/jobs": FakeResponse(404, None, text="nope")})
    with pytest.raises(FetchError, match="404"):
        custom.fetch("https://gone.example/jobs", s)


def test_is_open_only_trusts_hard_404():
    s = FakeSession({"/jobs/1": FakeResponse(404, None, text=""), "/jobs/2": FakeResponse(200, None, text="ok")})
    assert custom.is_open("x", "https://a.example/jobs/1", s) is False
    assert custom.is_open("x", "https://a.example/jobs/2", s) is None
    assert custom.is_open("x", "ld:GBX-1", s) is None
