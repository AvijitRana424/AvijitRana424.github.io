"""PostgREST client request shapes + job reconciliation rules (with an in-memory fake client)."""

from datetime import datetime, timezone

import pytest

from conftest import FakeClient, FakeResponse, FakeSession, json_route, load_fixture
from job_radar.db import USER_MANAGED_JOB_FIELDS, DBError, JobRadarDB, PostgrestClient, encode_filters
from job_radar.matcher import score
from job_radar.models import Posting, default_criteria
from job_radar.ats import workday
from job_radar.scanner import SessionPool, company_updates, plan_sync, resolve_source, scan_company

NOW = datetime(2026, 9, 27, 3, 30, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
#  PostgREST client
# ---------------------------------------------------------------------------

def test_encode_filters():
    assert encode_filters([("id", "eq", "a1"), ("active", "eq", True), ("url", "eq", None)]) == [
        ("id", "eq.a1"), ("active", "eq.true"), ("url", "is.null")]
    assert encode_filters([("id", "in", ["a", 'b"c', "d,e"])]) == [("id", 'in.("a","b\\"c","d,e")')]
    assert encode_filters({"company_id": "x"}) == [("company_id", "eq.x")]
    assert encode_filters([("date_found", "gte", NOW)]) == [("date_found", "gte.2026-09-27T03:30:00+00:00")]
    with pytest.raises(ValueError):
        encode_filters([("a", "regex", "x")])


def _client_with(session):
    c = PostgrestClient("https://proj.supabase.co", "service-key")
    c._local.session = session
    return c


def test_client_select_paginates_and_sends_filters():
    pages = [[{"id": i} for i in range(1000)], [{"id": 1000}]]

    def route(method, url, kw):
        offset = int(dict(kw["params"])["offset"])
        return json_route(pages[0] if offset == 0 else pages[1])

    s = FakeSession({"/rest/v1/jobs": route})
    rows = _client_with(s).select("jobs", "id", filters=[("company_id", "eq", "c1")], order="id.asc")
    assert len(rows) == 1001
    params = dict(s.calls[0][2]["params"])
    assert params["company_id"] == "eq.c1" and params["select"] == "id" and params["order"] == "id.asc"
    assert s.calls[0][1] == "https://proj.supabase.co/rest/v1/jobs"


def test_client_insert_uses_on_conflict_and_prefer():
    s = FakeSession({"/rest/v1/jobs": json_route([{"id": "j1"}], 201)})
    out = _client_with(s).insert("jobs", [{"title": "x"}], on_conflict="company_id,external_id", ignore_duplicates=True)
    method, _url, kw = s.calls[0]
    assert method == "POST" and out == [{"id": "j1"}]
    assert kw["params"] == [("on_conflict", "company_id,external_id")]
    assert kw["headers"]["Prefer"] == "return=representation,resolution=ignore-duplicates"


def test_client_update_requires_filter_and_reports_errors():
    c = _client_with(FakeSession({"/rest/v1/jobs": FakeResponse(400, {"message": "column \"nope\" does not exist",
                                                                       "hint": "check spelling"})}))
    with pytest.raises(DBError, match="refusing"):
        c.update("jobs", {"is_active": False}, [])
    with pytest.raises(DBError, match='column "nope" does not exist; check spelling'):
        c.update("jobs", {"nope": 1}, [("id", "eq", "1")])


def test_client_sets_auth_headers():
    c = PostgrestClient("https://proj.supabase.co/", "k")
    assert c.base == "https://proj.supabase.co/rest/v1"
    assert c.session.headers["apikey"] == "k" and c.session.headers["Authorization"] == "Bearer k"


def test_insert_refuses_user_managed_fields():
    db = JobRadarDB(FakeClient())
    for field in USER_MANAGED_JOB_FIELDS:
        with pytest.raises(DBError):
            db.insert_jobs([{"title": "x", field: "y"}])


# ---------------------------------------------------------------------------
#  plan_sync (pure)
# ---------------------------------------------------------------------------

def _posting(ext, title="Software Engineer", location="Bengaluru"):
    return Posting(external_id=ext, title=title, location=location, locations=[location])


def _matches(postings):
    c = default_criteria()
    return [(p, score(p, c)) for p in postings]


def test_plan_sync_inserts_touches_and_closes():
    existing = [
        {"id": "j1", "external_id": "A", "is_active": True, "source": "scraper"},   # still listed
        {"id": "j2", "external_id": "B", "is_active": True, "source": "scraper"},   # disappeared
        {"id": "j3", "external_id": "C", "is_active": False, "source": "scraper"},  # re-listed → reactivate
        {"id": "j4", "external_id": None, "is_active": True, "source": "manual"},   # manual: never touched
    ]
    postings = [_posting("A"), _posting("C"), _posting("D"), _posting("E", "Product Designer")]
    plan = plan_sync("co", existing, postings, _matches(postings), complete=True, now=NOW)
    assert [r["external_id"] for r in plan.new_rows] == ["D"]  # E does not match, A/C exist
    assert sorted(plan.touch_ids) == ["j1", "j3"]
    assert plan.close_ids == ["j2"]
    row = plan.new_rows[0]
    assert not (set(row) & USER_MANAGED_JOB_FIELDS)
    assert row["company_id"] == "co" and row["source"] == "scraper" and row["match_score"] >= 50
    assert row["match_reasons"][0] == "title ≈ Software Engineer"


def test_plan_sync_empty_listing_does_not_close_everything():
    existing = [{"id": "j1", "external_id": "A", "is_active": True, "source": "scraper"}]
    plan = plan_sync("co", existing, [], [], complete=True, now=NOW)
    assert plan.close_ids == [] and plan.verify == []


def test_plan_sync_partial_listing_verifies_instead_of_closing():
    existing = [{"id": "j1", "external_id": "A", "is_active": True, "source": "scraper"}]
    plan = plan_sync("co", existing, [_posting("Z")], [], complete=False, now=NOW)
    assert plan.close_ids == [] and [r["id"] for r in plan.verify] == ["j1"]


def test_plan_sync_dedupes_within_run():
    p1, p2 = _posting("A"), _posting("A")
    plan = plan_sync("co", [], [p1, p2], _matches([p1, p2]), complete=True, now=NOW)
    assert len(plan.new_rows) == 1


# ---------------------------------------------------------------------------
#  scan_company end-to-end (fake HTTP + fake DB)
# ---------------------------------------------------------------------------

class Pool(SessionPool):
    def __init__(self, session):
        super().__init__()
        self._s = session

    def get(self):
        return self._s


def _gh_session():
    return FakeSession({"boards-api.greenhouse.io/v1/boards/stripe/jobs": json_route(load_fixture("greenhouse_stripe.json"))})


def test_scan_company_preserves_user_fields_and_updates_company():
    company = {"id": "c1", "name": "Stripe", "career_url": "https://boards.greenhouse.io/stripe", "ats_type": "auto",
               "ats_identifier": None}
    applied = {"id": "j-applied", "company_id": "c1", "external_id": "8209970", "title": "Software Engineer, Stripe Data Pipeline",
               "status": "applied", "notes": "Referred by Priya", "applied_at": "2026-09-22T10:00:00+00:00",
               "is_active": False, "source": "scraper", "notified": True, "last_seen_at": "2026-09-01T00:00:00+00:00"}
    gone = {"id": "j-gone", "company_id": "c1", "external_id": "999", "title": "Old role", "status": "saved",
            "notes": "keep me", "is_active": True, "source": "scraper"}
    manual = {"id": "j-manual", "company_id": "c1", "external_id": None, "title": "Referral", "status": "interview",
              "is_active": True, "source": "manual"}
    client = FakeClient({"companies": [company], "jobs": [applied, gone, manual]})
    db = JobRadarDB(client)

    r = scan_company(company, default_criteria(), Pool(_gh_session()), db, now_fn=lambda: NOW)
    assert r.error is None and r.postings == 5 and r.ats_type == "greenhouse" and r.identifier == "stripe"

    jobs = {j["id"]: j for j in client.tables["jobs"]}
    # the applied job was re-listed: reactivated + seen, user fields untouched
    assert jobs["j-applied"]["is_active"] is True
    assert jobs["j-applied"]["last_seen_at"] == NOW.isoformat()
    assert (jobs["j-applied"]["status"], jobs["j-applied"]["notes"], jobs["j-applied"]["applied_at"]) == \
        ("applied", "Referred by Priya", "2026-09-22T10:00:00+00:00")
    # disappeared → inactive, but status/notes kept
    assert jobs["j-gone"]["is_active"] is False and jobs["j-gone"]["status"] == "saved" and jobs["j-gone"]["notes"] == "keep me"
    # manual jobs are never touched
    assert jobs["j-manual"] == manual
    # no update ever carried a user-managed field
    for kind, table, payload in client.log:
        if kind == "update" and table == "jobs":
            assert not (set(payload[0]) & USER_MANAGED_JOB_FIELDS)
    # company row: auto → greenhouse, identifier stored, counts, status
    co = client.tables["companies"][0]
    assert co["ats_type"] == "greenhouse" and co["ats_identifier"] == "stripe"
    assert co["last_status"] == "ok" and co["last_error"] is None and co["jobs_seen_count"] == 5
    assert co["last_checked_at"] == NOW.isoformat()


def test_scan_company_inserts_new_matches_once():
    company = {"id": "c1", "name": "Stripe", "career_url": "https://boards.greenhouse.io/stripe", "ats_type": "greenhouse",
               "ats_identifier": "stripe"}
    client = FakeClient({"companies": [company], "jobs": []})
    db = JobRadarDB(client)
    first = scan_company(company, default_criteria(), Pool(_gh_session()), db, now_fn=lambda: NOW)
    assert [j["title"] for j in first.new_jobs] == ["Software Engineer, Stripe Data Pipeline"]
    new = client.tables["jobs"][0]
    assert new["status"] == "new" and new["notified"] is False and new["years_required"] == 7
    second = scan_company(company, default_criteria(), Pool(_gh_session()), db, now_fn=lambda: NOW)
    assert second.new_jobs == [] and len(client.tables["jobs"]) == 1


def test_scan_company_dry_run_writes_nothing():
    company = {"id": "c1", "name": "Stripe", "career_url": "https://boards.greenhouse.io/stripe", "ats_type": "auto"}
    client = FakeClient({"companies": [dict(company)], "jobs": []})
    r = scan_company(company, default_criteria(), Pool(_gh_session()), JobRadarDB(client), dry_run=True, now_fn=lambda: NOW)
    assert len(r.new_jobs) == 1
    assert [k for k, *_ in client.log if k != "select"] == []


def test_scan_company_error_is_isolated_and_recorded():
    company = {"id": "c9", "name": "Broken Co", "career_url": "https://boards.greenhouse.io/nope", "ats_type": "auto",
               "jobs_seen_count": 12}
    client = FakeClient({"companies": [dict(company)], "jobs": []})
    r = scan_company(company, default_criteria(), Pool(FakeSession()), JobRadarDB(client), now_fn=lambda: NOW)
    assert r.error and "not found" in r.error
    co = client.tables["companies"][0]
    assert co["last_status"] == "error" and "not found" in co["last_error"] and co["jobs_seen_count"] == 12


def test_scan_company_partial_listing_confirms_closures():
    wd = "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite"
    company = {"id": "c2", "name": "NVIDIA", "career_url": f"https://{wd.split('/')[0]}/NVIDIAExternalCareerSite",
               "ats_type": "workday", "ats_identifier": wd}
    jobs = [
        {"id": "closed", "company_id": "c2", "external_id": "/job/closed_1", "is_active": True, "source": "scraper"},
        {"id": "unsure", "company_id": "c2", "external_id": "/job/unsure_2", "is_active": True, "source": "scraper"},
    ]
    s = FakeSession({
        "/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs": json_route(load_fixture("workday_nvidia.json")),
        "/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/India": json_route(load_fixture("workday_detail.json")),
        "/job/closed_1": FakeResponse(404, {}),
        "/job/unsure_2": FakeResponse(503, {}),
    })
    client = FakeClient({"companies": [dict(company)], "jobs": jobs})
    r = scan_company(company, default_criteria(), Pool(s), JobRadarDB(client), now_fn=lambda: NOW)
    assert r.error is None and r.closed == 1
    state = {j["id"]: j["is_active"] for j in client.tables["jobs"] if j["id"] in ("closed", "unsure")}
    assert state == {"closed": False, "unsure": True}
    assert any("NVEX" in j["title"] for j in r.new_jobs)


# ---------------------------------------------------------------------------
#  ATS resolution + company updates
# ---------------------------------------------------------------------------

def test_resolve_source():
    assert resolve_source({"ats_type": "auto", "career_url": "https://jobs.lever.co/palantir"}) == ("lever", "palantir")
    assert resolve_source({"ats_type": "auto", "career_url": "https://acme.com/careers"}) == ("custom", "https://acme.com/careers")
    assert resolve_source({"ats_type": "greenhouse", "ats_identifier": "stripe", "career_url": "https://stripe.com/jobs"}) == \
        ("greenhouse", "stripe")
    # explicit ATS without identifier on a custom domain → scrape the page to find the board
    assert resolve_source({"ats_type": "greenhouse", "ats_identifier": None, "career_url": "https://stripe.com/jobs"}) == \
        ("custom", "https://stripe.com/jobs")
    # 'custom' (or an unknown type) with a URL of a known ATS → use that ATS' API
    assert resolve_source({"ats_type": "custom", "career_url": "https://jobs.lever.co/x"}) == ("lever", "x")
    assert resolve_source({"ats_type": "taleo", "career_url": "https://jobs.lever.co/x"}) == ("lever", "x")
    assert resolve_source({"ats_type": "custom", "career_url": "https://acme.com/careers"}) == ("custom", "https://acme.com/careers")
    # identifier null / blank / unparseable → derived from the career URL
    wd_url = "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite"
    wd_id = "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite"
    for bad in (None, "", "   ", "walmart.wd5/WalmartExternal", "https://example.com/not-workday"):
        assert resolve_source({"ats_type": "workday", "ats_identifier": bad, "career_url": wd_url}) == ("workday", wd_id)
    assert resolve_source({"ats_type": "greenhouse", "ats_identifier": None,
                           "career_url": "https://job-boards.greenhouse.io/stripe"}) == ("greenhouse", "stripe")
    # the type disagrees with the URL and no identifier is stored → the URL wins
    assert resolve_source({"ats_type": "greenhouse", "ats_identifier": None, "career_url": "https://jobs.ashbyhq.com/notion"}) == \
        ("ashby", "notion")


def test_company_updates_after_custom_detection():
    from job_radar.scanner import CompanyResult

    r = CompanyResult("c", "Acme", ats_type="greenhouse", identifier="acme", postings=3, detected=("greenhouse", "acme"))
    vals = company_updates({"ats_type": "custom", "ats_identifier": None}, r, NOW)
    assert vals["ats_type"] == "greenhouse" and vals["ats_identifier"] == "acme" and vals["jobs_seen_count"] == 3

    r = CompanyResult("c", "Acme", ats_type="custom", identifier="https://acme.com/careers", postings=4)
    vals = company_updates({"ats_type": "auto", "ats_identifier": None}, r, NOW)
    assert vals["ats_type"] == "custom" and "ats_identifier" not in vals

    r = CompanyResult("c", "Acme", ats_type="lever", identifier="acme", postings=1)
    vals = company_updates({"ats_type": "lever", "ats_identifier": "acme"}, r, NOW)
    assert "ats_type" not in vals and "ats_identifier" not in vals

    # identifier derived from the URL is stored; a 'custom' company on a known ATS URL is switched over
    vals = company_updates({"ats_type": "lever", "ats_identifier": None}, r, NOW)
    assert "ats_type" not in vals and vals["ats_identifier"] == "acme"
    vals = company_updates({"ats_type": "custom", "ats_identifier": None}, r, NOW)
    assert vals["ats_type"] == "lever" and vals["ats_identifier"] == "acme"
    # a wrong type is corrected when the URL resolved to another known ATS
    vals = company_updates({"ats_type": "greenhouse", "ats_identifier": None}, r, NOW)
    assert vals["ats_type"] == "lever" and vals["ats_identifier"] == "acme"
    # …but a failed embed lookup never downgrades an explicit type to 'custom'
    custom = CompanyResult("c", "Acme", ats_type="custom", identifier="https://acme.com/jobs", postings=2)
    assert "ats_type" not in company_updates({"ats_type": "greenhouse", "ats_identifier": None}, custom, NOW)


# ---------------------------------------------------------------------------
#  fetch_runs lifecycle + query shapes
# ---------------------------------------------------------------------------

def test_fail_stale_runs_closes_only_old_running_rows():
    from datetime import timedelta

    rows = [
        {"id": "old", "status": "running", "started_at": (NOW - timedelta(hours=3)).isoformat(), "errors": []},
        {"id": "fresh", "status": "running", "started_at": (NOW - timedelta(minutes=30)).isoformat(), "errors": []},
        {"id": "done", "status": "success", "started_at": (NOW - timedelta(days=1)).isoformat(), "errors": []},
    ]
    client = FakeClient({"fetch_runs": rows})
    assert JobRadarDB(client).fail_stale_runs(NOW) == 1
    state = {r["id"]: r for r in client.tables["fetch_runs"]}
    assert state["old"]["status"] == "failed" and state["old"]["finished_at"] == NOW.isoformat()
    assert state["old"]["errors"][0]["company"] == "(scanner)"
    assert state["fresh"]["status"] == "running" and state["done"]["status"] == "success"


def test_start_run_is_safe_to_retry():
    client = FakeClient({"fetch_runs": []})
    db = JobRadarDB(client)
    run_id = db.start_run("manual", NOW)
    kind, table, payload = client.log[-1]
    assert kind == "insert" and payload[0]["id"] == run_id
    # a retried POST carrying the same id is ignored instead of creating an orphan row
    client.insert("fetch_runs", payload, on_conflict="id", ignore_duplicates=True)
    assert [r["id"] for r in client.tables["fetch_runs"]] == [run_id]


def test_client_start_run_request_uses_on_conflict():
    s = FakeSession({"/rest/v1/fetch_runs": json_route([], 201)})  # duplicate ignored → empty representation
    run_id = JobRadarDB(_client_with(s)).start_run("schedule", NOW)
    method, _url, kw = s.calls[0]
    assert method == "POST" and kw["params"] == [("on_conflict", "id")] and kw["json"][0]["id"] == run_id
    assert "resolution=ignore-duplicates" in kw["headers"]["Prefer"]


def test_pending_digest_skips_archived_and_orders_stably():
    jobs = [
        {"id": "b", "company_id": "c", "title": "B", "match_score": 70, "notified": False, "source": "scraper",
         "is_active": True, "status": "new", "date_found": NOW.isoformat()},
        {"id": "a", "company_id": "c", "title": "A", "match_score": 70, "notified": False, "source": "scraper",
         "is_active": True, "status": "saved", "date_found": NOW.isoformat()},
        {"id": "z", "company_id": "c", "title": "Dismissed", "match_score": 99, "notified": False, "source": "scraper",
         "is_active": True, "status": "archived", "date_found": NOW.isoformat()},
    ]
    client = FakeClient({"jobs": jobs})
    rows = JobRadarDB(client).pending_digest_jobs(NOW)
    assert [r["id"] for r in rows] == ["a", "b"]
    _kind, _table, filters = client.log[-1]
    assert ("status", "neq", "archived") in filters


def test_query_orders_have_unique_tiebreakers():
    s = FakeSession({"/rest/v1/jobs": json_route([])})
    db = JobRadarDB(_client_with(s))
    db.jobs_for_company("c1")
    db.pending_digest_jobs(NOW)
    orders = [dict(kw["params"])["order"] for _m, _u, kw in s.calls]
    assert orders == ["id.asc", "match_score.desc,id.asc"]
    assert dict(s.calls[1][2]["params"])["status"] == "neq.archived"


def test_client_select_is_not_truncated_by_a_lower_max_rows():
    table = [{"id": i} for i in range(1234)]

    def route(method, url, kw):  # a project with max-rows = 500
        params = dict(kw["params"])
        offset, limit = int(params["offset"]), min(int(params["limit"]), 500)
        page = table[offset: offset + limit]
        headers = {"content-type": "application/json",
                   "Content-Range": f"{offset}-{offset + len(page) - 1}/{len(table)}" if page else f"*/{len(table)}"}
        return FakeResponse(200, page, headers=headers)

    s = FakeSession({"/rest/v1/jobs": route})
    rows = _client_with(s).select("jobs", "id", order="id.asc")
    assert len(rows) == 1234 and rows[-1] == {"id": 1233}
    assert s.calls[0][2]["headers"]["Prefer"] == "count=exact"


def test_encode_neq_and_lt():
    assert encode_filters([("status", "neq", "archived"), ("started_at", "lt", NOW), ("x", "neq", None)]) == [
        ("status", "neq.archived"), ("started_at", "lt.2026-09-27T03:30:00+00:00"), ("x", "not.is.null")]


# ---------------------------------------------------------------------------
#  Archived jobs, enrich budget, time budgets
# ---------------------------------------------------------------------------

def test_plan_sync_does_not_spend_checks_on_archived_jobs():
    existing = [{"id": "j1", "external_id": "A", "is_active": True, "source": "scraper", "status": "archived"},
                {"id": "j2", "external_id": "B", "is_active": True, "source": "scraper", "status": "new"}]
    plan = plan_sync("co", existing, [_posting("Z")], [], complete=False, now=NOW)
    assert [r["id"] for r in plan.verify] == ["j2"]
    # a re-listed archived job is only touched (last_seen_at), never re-inserted
    listed = [_posting("A")]
    plan = plan_sync("co", existing, listed, _matches(listed), complete=True, now=NOW)
    assert plan.new_rows == [] and plan.touch_ids == ["j1"]


def test_archived_job_keeps_its_status_after_rescan():
    company = {"id": "c1", "name": "Stripe", "career_url": "https://boards.greenhouse.io/stripe", "ats_type": "greenhouse",
               "ats_identifier": "stripe"}
    archived = {"id": "j1", "company_id": "c1", "external_id": "8209970", "title": "Software Engineer, Stripe Data Pipeline",
                "status": "archived", "is_active": True, "source": "scraper", "notified": False}
    client = FakeClient({"companies": [company], "jobs": [archived]})
    r = scan_company(company, default_criteria(), Pool(_gh_session()), JobRadarDB(client), now_fn=lambda: NOW)
    assert r.new_jobs == []
    job = client.tables["jobs"][0]
    assert job["status"] == "archived" and job["notified"] is False and len(client.tables["jobs"]) == 1


def _wd_listing_session(details):
    listing = load_fixture("workday_nvidia.json")
    routes = {"/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs": json_route(listing)}
    for path in details:
        routes[path] = json_route(load_fixture("workday_detail.json"))
    return FakeSession(routes), listing


def test_enrich_skips_stored_postings_and_prefers_known_locations():
    from job_radar.scanner import enrich_candidates, fetch_postings

    wd = "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite"
    s, listing = _wd_listing_session([r["externalPath"] for r in load_fixture("workday_nvidia.json")["jobPostings"]])
    company = {"career_url": "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite", "ats_type": "workday",
               "ats_identifier": wd}
    c = default_criteria()
    rows = listing["jobPostings"]
    stored = rows[0]["externalPath"]
    out = fetch_postings(company, c, s, enrich_limit=10, known_ids={stored})
    detail_calls = [u for m, u, _kw in s.calls if m == "GET"]
    assert all(not u.endswith(stored) for u in detail_calls)  # already in the jobs table → not re-enriched
    assert out.enrichable is True

    ps = workday.parse_listing(listing, wd)
    order = [p.external_id for p in enrich_candidates(ps, c)]
    multi = next(p.external_id for p in ps if p.location == "2 Locations")
    assert order[-1] == multi  # "2 Locations" (unknown place) goes after postings listed in India


def test_unenriched_matches_say_so():
    from job_radar.scanner import match_postings

    p = Posting(external_id="x", title="Senior Software Engineer", location="India, Bengaluru", locations=["India, Bengaluru"])
    (_, m), = match_postings([p], default_criteria(), enrichable=True)
    assert m.matched and m.reasons[-1] == "years not checked"
    (_, m2), = match_postings([p], default_criteria(), enrichable=False)
    assert "years not checked" not in m2.reasons


def test_company_time_budget_gives_up_cleanly():
    import time as _time

    from job_radar.net import BudgetExceeded

    class SlowSession(FakeSession):
        deadline = None

        def request(self, method, url, **kwargs):
            if self.deadline is not None and _time.monotonic() >= self.deadline:
                raise BudgetExceeded("time budget exceeded")
            return super().request(method, url, **kwargs)

    company = {"id": "c1", "name": "Slow", "career_url": "https://boards.greenhouse.io/stripe", "ats_type": "auto"}
    client = FakeClient({"companies": [dict(company)], "jobs": []})
    s = SlowSession()
    r = scan_company(company, default_criteria(), Pool(s), JobRadarDB(client), now_fn=lambda: NOW, budget=1e-9)
    assert r.error.startswith("gave up after 0s (per-company time budget)")
    assert s.deadline is None  # reset for the next company on this worker
    assert client.tables["companies"][0]["last_status"] == "error"


def test_run_deadline_skips_companies_without_touching_them():
    import time as _time

    company = {"id": "c1", "name": "Late", "career_url": "https://boards.greenhouse.io/stripe", "ats_type": "auto"}
    client = FakeClient({"companies": [dict(company)], "jobs": []})
    r = scan_company(company, default_criteria(), Pool(_gh_session()), JobRadarDB(client), now_fn=lambda: NOW,
                     run_deadline=_time.monotonic() - 1)
    assert r.skipped and "time budget" in r.error
    assert client.log == [] and "last_checked_at" not in client.tables["companies"][0]
