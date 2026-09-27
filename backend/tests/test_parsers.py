"""ATS parsers against trimmed real responses (fixtures/), plus fetch() paging/fallback logic."""

from datetime import datetime, timedelta, timezone

import pytest

from conftest import FakeResponse, FakeSession, json_route, load_fixture
from job_radar.ats import ashby, greenhouse, lever, recruitee, smartrecruiters, workable, workday
from job_radar.models import FetchError, Postings, default_criteria

WD_ID = "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite"


def by_title(postings, title):
    return next(p for p in postings if p.title == title)


# ---------------------------------------------------------------------------
#  Greenhouse
# ---------------------------------------------------------------------------

def test_greenhouse_parse():
    ps = greenhouse.parse(load_fixture("greenhouse_stripe.json"), "stripe")
    assert len(ps) == 5
    p = by_title(ps, "Software Engineer, Stripe Data Pipeline")
    assert p.external_id == "8209970"
    assert p.url == "https://stripe.com/jobs/search?gh_jid=8209970"
    assert p.location == "Bangalore"
    assert p.department == "8122 Data Foundations"
    assert p.posted_at == datetime(2026, 9, 21, 11, 18, 26, tzinfo=timezone.utc)
    # content arrives HTML-escaped — it must come out as clean text
    assert "&lt;" not in p.description_text and "<p>" not in p.description_text
    assert "Stripe" in p.description_text
    # "IN-Bengaluru" office is redundant next to "Bengaluru"
    assert by_title(ps, "Software Engineer, Intern").location == "Bengaluru"


def test_greenhouse_eu_fallback_on_404():
    data = load_fixture("greenhouse_stripe.json")
    s = FakeSession({
        "boards-api.greenhouse.io/v1/boards/acme": FakeResponse(404, {"status": 404}),
        "boards-api.eu.greenhouse.io/v1/boards/acme": json_route(data),
    })
    assert len(greenhouse.fetch("acme", s)) == 5
    assert [c[1].split("/v1")[0] for c in s.calls] == ["https://boards-api.greenhouse.io", "https://boards-api.eu.greenhouse.io"]


def test_greenhouse_not_found_message():
    s = FakeSession()  # every route 404s
    with pytest.raises(FetchError, match="not found"):
        greenhouse.fetch("nope", s)


# ---------------------------------------------------------------------------
#  Lever
# ---------------------------------------------------------------------------

def test_lever_parse():
    ps = lever.parse(load_fixture("lever_spotify.json"), "spotify")
    assert len(ps) == 5
    p = by_title(ps, "Senior Backend Engineer - Subscriptions")
    assert p.url.startswith("https://jobs.lever.co/spotify/")
    assert p.location.startswith("London; Stockholm")
    assert p.remote is False  # workplaceType hybrid
    assert p.employment_type == "Full-time"  # "Permanent" normalised
    assert p.department == "Subscriptions R&D"
    assert p.posted_at.year == 2025
    remote = by_title(ps, "Data Scientist - Music Mission")
    assert remote.remote is True
    # lists (requirements) are part of the description
    assert "Who You Are" in p.description_text or "What You'll Do" in p.description_text
    # first fixture posting only has HTML description → converted
    first = ps[0]
    assert first.description_text and "<div>" not in first.description_text


def test_lever_error_payload():
    with pytest.raises(FetchError, match="Document not found"):
        lever.parse({"ok": False, "error": "Document not found"}, "plaid")


def test_lever_eu_fallback():
    s = FakeSession({
        "api.lever.co/v0/postings/acme": FakeResponse(404, {"ok": False, "error": "Document not found"}),
        "api.eu.lever.co/v0/postings/acme": json_route(load_fixture("lever_spotify.json")),
    })
    assert len(lever.fetch("acme", s)) == 5


# ---------------------------------------------------------------------------
#  Ashby
# ---------------------------------------------------------------------------

def test_ashby_parse():
    ps = ashby.parse(load_fixture("ashby_notion.json"), "notion")
    assert len(ps) == 5
    p = by_title(ps, "Software Engineer, Infrastructure")  # title had a trailing space
    assert p.location == "Hyderabad, India"
    assert p.employment_type == "Full-time"
    assert p.url == "https://jobs.ashbyhq.com/notion/42f18ccd-c4c8-4a85-8c1f-de12c575fe87"
    assert p.description_text
    multi = by_title(ps, "Software Engineer, Developer Platform")
    assert "San Francisco, California" in multi.locations and "New York, New York" in multi.locations


def test_ashby_skips_unlisted():
    data = {"jobs": [{"id": "1", "title": "Hidden", "isListed": False}, {"id": "2", "title": "Shown", "location": "Remote"}]}
    ps = ashby.parse(data, "x")
    assert [p.title for p in ps] == ["Shown"]
    assert ps[0].remote is True


# ---------------------------------------------------------------------------
#  Workday
# ---------------------------------------------------------------------------

def test_workday_identifier_and_urls():
    assert workday.api_base(WD_ID) == "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite"
    assert workday.public_url(WD_ID, "/job/X_1") == "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/X_1"
    assert workday.public_url("wd1.myworkdaysite.com/acme/Careers", "/job/Y") == \
        "https://wd1.myworkdaysite.com/recruiting/acme/Careers/job/Y"
    with pytest.raises(FetchError):
        workday.split_identifier("nvidia")


def test_workday_parse_listing():
    ps = workday.parse_listing(load_fixture("workday_nvidia.json"), WD_ID)
    assert len(ps) == 5
    nvex = by_title(ps, "Senior Software Engineer - NVEX")
    assert nvex.external_id.startswith("/job/India-Bengaluru/")
    assert nvex.url == workday.public_url(WD_ID, nvex.external_id)
    assert nvex.locations == ["India, Bengaluru"]
    multi = by_title(ps, "Senior Software Engineer, Security")
    assert multi.location == "2 Locations" and multi.locations == []  # unknown until enriched


def test_workday_posted_ago(monkeypatch):
    from job_radar.text import parse_posted_ago

    now = datetime(2026, 9, 27, 8, 0, tzinfo=timezone.utc)
    today = datetime(2026, 9, 27, tzinfo=timezone.utc)
    assert parse_posted_ago("Posted Today", now) == today
    assert parse_posted_ago("Posted Yesterday", now) == today - timedelta(days=1)
    assert parse_posted_ago("Posted 6 Days Ago", now) == today - timedelta(days=6)
    assert parse_posted_ago("Posted 30+ Days Ago", now) == today - timedelta(days=30)
    assert parse_posted_ago("", now) is None


def test_workday_fetch_searches_each_role_and_paginates():
    listing = load_fixture("workday_nvidia.json")
    pages = []

    def route(method, url, kw):
        body = kw["json"]
        pages.append((body["searchText"], body["offset"]))
        rows = listing["jobPostings"]
        if body["searchText"] == "Software Engineer":
            # 25 results: page 1 has 20 (total only on first page), page 2 has 5
            fake = [dict(rows[i % 5], externalPath=f"/job/p{i}") for i in range(25)]
            chunk = fake[body["offset"]: body["offset"] + 20]
            return json_route({"total": 25 if body["offset"] == 0 else 0, "jobPostings": chunk})
        return json_route({"total": len(rows), "jobPostings": rows})

    s = FakeSession({"/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs": route})
    c = default_criteria()
    c.target_roles = ["Software Engineer", "SDE 2", "SDE II"]  # SDE 2 / SDE II are one search
    ps = workday.fetch(WD_ID, s, c)
    assert isinstance(ps, Postings) and ps.complete is False
    # ("", 0) = one board-wide lookup for location facets (none in this fixture → plain search)
    assert pages == [("Software Engineer", 0), ("", 0), ("Software Engineer", 20), ("SDE 2", 0)]
    assert len(ps) == 25 + 5  # de-duplicated by externalPath


def test_workday_enrich_and_is_open():
    ps = workday.parse_listing(load_fixture("workday_nvidia.json"), WD_ID)
    nvex = by_title(ps, "Senior Software Engineer - NVEX")
    s = FakeSession({nvex.external_id: json_route(load_fixture("workday_detail.json"))})
    workday.enrich(nvex, WD_ID, s)
    assert "NVIDIA" in nvex.description_text
    assert nvex.employment_type == "Full-time"  # "Full time" normalised like every other ATS
    assert nvex.posted_at == datetime(2026, 9, 20, tzinfo=timezone.utc)  # startDate beats "6 days ago"
    assert nvex.locations[0] == "India, Bengaluru"

    multi = workday.apply_detail(by_title(ps, "Senior Software Engineer, Security"),
                                 load_fixture("workday_detail_multi.json")["jobPostingInfo"])
    assert multi.locations[:2] == ["Israel, Raanana", "Israel, Tel Aviv"]
    assert multi.location.startswith("Israel, Raanana; Israel, Tel Aviv")

    s = FakeSession({"/job/gone": FakeResponse(404, {}), "/job/live": json_route(load_fixture("workday_detail.json"))})
    assert workday.is_open(WD_ID, "/job/gone", s) is False
    assert workday.is_open(WD_ID, "/job/live", s) is True


def test_workday_422_is_explained():
    s = FakeSession({"/wday/cxs/": FakeResponse(422, {"errorCode": "HTTP_422"})})
    with pytest.raises(FetchError, match="422"):
        workday.fetch("walmart.wd5.myworkdayjobs.com/walmart/WalmartExternal", s, default_criteria())


# ---------------------------------------------------------------------------
#  SmartRecruiters
# ---------------------------------------------------------------------------

def test_smartrecruiters_parse():
    ps = smartrecruiters.parse(load_fixture("smartrecruiters_servicenow.json"), "ServiceNow")
    assert len(ps) == 5
    hyd = by_title(ps, "Sr Software Engineer")
    assert hyd.location == "Hyderabad, India"  # "Hyderabad, , India" cleaned
    assert hyd.url == "https://jobs.smartrecruiters.com/ServiceNow/744000151797409"
    assert hyd.employment_type == "Full-time"
    assert by_title(ps, "Software Engineer").location == "Santa Clara, California, United States"  # CALIFORNIA → California
    assert by_title(ps, "Client Director - Strategic Tech").remote is True


def test_smartrecruiters_paginates_and_enriches():
    content = load_fixture("smartrecruiters_servicenow.json")["content"]

    def route(method, url, kw):
        offset = int(url.split("offset=")[1].split("&")[0])
        rows = [dict(content[i % 5], id=str(1000 + i)) for i in range(130)][offset: offset + 100]
        return json_route({"offset": offset, "limit": 100, "totalFound": 130, "content": rows})

    s = FakeSession({"/companies/ServiceNow/postings?": route})
    ps = smartrecruiters.fetch("ServiceNow", s, default_criteria())
    assert len(ps) == 130 and ps.complete is True
    assert len(s.calls) == 2

    p = ps[0]
    s2 = FakeSession({f"/postings/{p.external_id}": json_route(load_fixture("smartrecruiters_detail.json"))})
    smartrecruiters.enrich(p, "ServiceNow", s2)
    assert "Qualifications" in p.description_text
    assert p.url.startswith("https://jobs.smartrecruiters.com/ServiceNow/744000149918201-")


def test_smartrecruiters_big_board_searches_per_role():
    def route(method, url, kw):
        if "&q=" in url:
            q = url.split("&q=")[1]
            return json_route({"totalFound": 1, "content": [{"id": q[:10], "name": f"Role {q}", "location": {}}]})
        return json_route({"totalFound": 5000, "content": [{"id": "x", "name": "Something", "location": {}}] * 100})

    c = default_criteria()
    c.target_roles = ["Backend Engineer", "Java Developer"]
    ps = smartrecruiters.fetch("BigCo", FakeSession({"/companies/BigCo/postings": route}), c)
    assert ps.complete is False
    assert sorted(p.title for p in ps) == ["Role Backend%20Engineer", "Role Java%20Developer"]


# ---------------------------------------------------------------------------
#  Recruitee
# ---------------------------------------------------------------------------

def test_recruitee_parse():
    ps = recruitee.parse(load_fixture("recruitee_bunq.json"), "bunq")
    assert len(ps) == 5
    p = ps[0]
    assert p.title == "(Senior) Legal Counsel"
    assert p.url == "https://careers.bunq.com/o/senior-legal-counsel-3"
    assert p.employment_type == "Full-time"
    assert p.posted_at == datetime(2026, 9, 25, 15, 46, 7, tzinfo=timezone.utc)
    assert "Netherlands" in p.location
    assert by_title(ps, "Branch Manager, Belgium & Ireland").location == "Brussels, Belgium"
    assert p.description_text and "<p" not in p.description_text


# ---------------------------------------------------------------------------
#  Workable
# ---------------------------------------------------------------------------

def test_workable_parse():
    ps = workable.parse(load_fixture("workable_huggingface.json"), "huggingface")
    assert len(ps) == 5
    p = ps[0]
    assert p.external_id == "DB4D7C0EC8"
    assert p.url == "https://apply.workable.com/huggingface/j/DB4D7C0EC8/"
    assert p.remote is True and p.location == "Remote (France)"
    assert p.employment_type == "Full-time"
    assert p.department == "Product"


def test_workable_follows_next_page_token():
    p1, p2 = load_fixture("workable_page1.json"), load_fixture("workable_page2.json")
    bodies = []

    def route(method, url, kw):
        bodies.append(kw["json"])
        return json_route(p2 if kw["json"].get("token") else p1)

    ps = workable.fetch("skroutz", FakeSession({"/accounts/skroutz/jobs": route}))
    assert len(ps) == 3
    assert "token" not in bodies[0] and bodies[1]["token"] == p1["nextPage"]


def test_workable_enrich():
    ps = workable.parse(load_fixture("workable_huggingface.json"), "huggingface")
    s = FakeSession({"/api/v2/accounts/huggingface/jobs/DB4D7C0EC8": json_route(load_fixture("workable_detail.json"))})
    workable.enrich(ps[0], "huggingface", s)
    assert "Hugging Face" in ps[0].description_text


# ---------------------------------------------------------------------------
#  Workday location facets (fixture: trimmed live NVIDIA facets)
# ---------------------------------------------------------------------------

def _india_ids(data, param):
    for group in data["facets"]:
        for g in group.get("values", []):
            if g.get("facetParameter") == param:
                return [v["id"] for v in g["values"] if v["descriptor"].startswith("India")]
    return []


def test_workday_location_facet_picks_india_values():
    data = load_fixture("workday_facets.json")
    facet = workday.location_facet(data, default_criteria())
    assert list(facet) in (["locations"], ["locationHierarchy1"])  # one facet only: Workday ANDs facets
    param, ids = next(iter(facet.items()))
    assert ids == _india_ids(data, param) and ids
    # the site facet ("India, Bengaluru" …) covers more postings than the country one here
    assert param == "locations" and len(ids) == 6  # includes "India, Remote"

    c = default_criteria()
    c.locations = ["Remote"]  # no place → nothing to facet on
    assert workday.location_facet(data, c) is None
    c.locations = ["Bangalore"]  # aliases work: Bangalore = Bengaluru
    assert list(workday.location_facet(data, c).values()) == [
        [v for v in _india_ids(data, "locations")][:1]]
    c.locations = ["Tokyo"]  # no matching value
    assert workday.location_facet(data, c) is None
    assert workday.location_facet({"facets": "junk"}, default_criteria()) is None


def _faceted_route(calls, reject_facets=False, per_term=45):
    first = load_fixture("workday_facets.json")
    rows = load_fixture("workday_nvidia.json")["jobPostings"]

    def route(method, url, kw):
        body = kw["json"]
        calls.append((body["searchText"], body["offset"], dict(body["appliedFacets"])))
        if not body["appliedFacets"]:
            if body["offset"] == 0 and body["searchText"] == calls[0][0]:
                return json_route({**first, "jobPostings": [dict(rows[0], externalPath="/job/global_0")]})
            return json_route({"total": 0, "jobPostings": []})
        if reject_facets:
            return FakeResponse(400, {"errorCode": "HTTP_400"})
        fake = [dict(rows[i % 5], externalPath=f"/job/{body['searchText'][:3]}_{i}") for i in range(per_term)]
        chunk = fake[body["offset"]: body["offset"] + 20]
        return json_route({"total": per_term if body["offset"] == 0 else 0, "jobPostings": chunk})

    return route


def test_workday_fetch_applies_location_facet_to_every_term():
    calls = []
    s = FakeSession({"/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs": _faceted_route(calls, per_term=45)})
    c = default_criteria()
    c.target_roles = ["Software Engineer", "Backend Engineer"]
    ps = workday.fetch(WD_ID, s, c)
    assert ps.complete is False and list(ps.facets) == ["locations"]
    faceted = [(t, o) for t, o, f in calls if f]
    assert faceted == [("Software Engineer", 0), ("Software Engineer", 20), ("Software Engineer", 40),
                       ("Backend Engineer", 0), ("Backend Engineer", 20), ("Backend Engineer", 40)]
    assert all(f == {"locations": ps.facets["locations"]} for _t, _o, f in calls[1:])
    assert len(ps) == 90 and "/job/global_0" not in {p.external_id for p in ps}  # worldwide page 1 is dropped
    assert all(p.in_region for p in ps)


def test_workday_faceted_search_is_not_capped_at_200():
    calls = []
    s = FakeSession({"/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs": _faceted_route(calls, per_term=330)})
    c = default_criteria()
    c.target_roles = ["Software Engineer"]
    assert len(workday.fetch(WD_ID, s, c)) == 330


def test_workday_falls_back_to_plain_search_when_facet_rejected():
    calls = []
    s = FakeSession({"/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs": _faceted_route(calls, reject_facets=True)})
    c = default_criteria()
    c.target_roles = ["Software Engineer", "Backend Engineer"]
    ps = workday.fetch(WD_ID, s, c)
    assert [p.external_id for p in ps] == ["/job/global_0"] and not ps[0].in_region
    plain = [(t, o) for t, o, f in calls if not f]
    assert plain == [("Software Engineer", 0), ("Backend Engineer", 0)]  # page 1 of term 1 is reused

    # facets missing from the first term's results → one board-wide lookup finds them
    calls = []
    board = load_fixture("workday_facets.json")

    def narrow_first(method, url, kw):
        body = kw["json"]
        calls.append((body["searchText"], dict(body["appliedFacets"])))
        if not body["appliedFacets"]:
            return json_route(board if body["searchText"] == "" else {"total": 0, "jobPostings": [], "facets": []})
        return json_route({"total": 0, "jobPostings": []})

    c.target_roles = ["SDE 2"]
    ps = workday.fetch(WD_ID, FakeSession({"/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs": narrow_first}), c)
    assert [t for t, _f in calls] == ["SDE 2", "", "SDE 2"] and list(calls[-1][1]) == ["locations"]


def test_workday_without_location_criteria_searches_worldwide():
    calls = []
    s = FakeSession({"/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs": _faceted_route(calls)})
    c = default_criteria()
    c.target_roles, c.locations = ["Software Engineer"], []
    ps = workday.fetch(WD_ID, s, c)
    assert [f for _t, _o, f in calls] == [{}] and not hasattr(ps, "facets")


# ---------------------------------------------------------------------------
#  Truncated listings are not "complete"
# ---------------------------------------------------------------------------

def test_workable_page_cap_marks_listing_incomplete(monkeypatch):
    p1 = load_fixture("workable_page1.json")
    monkeypatch.setattr(workable, "MAX_PAGES", 2)

    def endless(method, url, kw):
        n = len(kw["json"].get("token") or "")
        rows = [dict(r, shortcode=f"{r['shortcode']}{n}") for r in p1["results"]]
        return json_route({**p1, "results": rows, "nextPage": "t" * (n + 1)})

    ps = workable.fetch("big", FakeSession({"/accounts/big/jobs": endless}))
    assert isinstance(ps, Postings) and ps.complete is False

    p2 = load_fixture("workable_page2.json")
    done = workable.fetch("small", FakeSession({"/accounts/small/jobs": json_route({**p2, "nextPage": None})}))
    assert done.complete is True


def test_smartrecruiters_bad_row_does_not_end_paging():
    content = load_fixture("smartrecruiters_servicenow.json")["content"]

    def route(method, url, kw):
        offset = int(url.split("offset=")[1].split("&")[0])
        rows = [dict(content[i % 5], id=str(1000 + i)) for i in range(150)][offset: offset + 100]
        if offset == 0:
            rows[3] = {"id": None, "name": ""}  # one unparseable row on a full page
        return json_route({"totalFound": 150, "content": rows})

    s = FakeSession({"/companies/ServiceNow/postings?": route})
    ps = smartrecruiters.fetch("ServiceNow", s, default_criteria())
    assert len(s.calls) == 2 and len(ps) == 149 and ps.complete is True
