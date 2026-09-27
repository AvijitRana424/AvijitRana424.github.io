"""`python -m job_radar run|probe` end to end with a fake database, fake HTTP and a fake SMTP server."""

import argparse

import pytest

from conftest import FakeClient, FakeSession, json_route, load_fixture
from job_radar import main as cli
from job_radar import notify
from job_radar.config import Settings
from job_radar.db import JobRadarDB
from test_notify import FakeSMTP


def routes():
    return FakeSession({
        "boards-api.greenhouse.io/v1/boards/stripe/jobs": json_route(load_fixture("greenhouse_stripe.json")),
        "api.ashbyhq.com/posting-api/job-board/notion": json_route(load_fixture("ashby_notion.json")),
    })


class FakePool:
    session = None

    def __init__(self, timeout=20.0):
        pass

    def get(self):
        return FakePool.session


def tables():
    return {
        "search_criteria": [{
            "id": "sc1", "target_roles": ["Software Engineer", "Backend Engineer"], "experience_level": "mid",
            "min_years": 2, "max_years": 6, "include_keywords": ["java", "distributed"],
            "exclude_keywords": ["intern", "staff"], "locations": ["Bengaluru", "Hyderabad"], "remote_ok": True,
            "email_enabled": True, "email_to": "me@example.com", "updated_at": "2026-09-01T00:00:00+00:00"}],
        "companies": [
            {"id": "c1", "name": "Stripe", "career_url": "https://boards.greenhouse.io/stripe", "ats_type": "auto", "active": True},
            {"id": "c2", "name": "Notion", "career_url": "https://jobs.ashbyhq.com/notion", "ats_type": "ashby",
             "ats_identifier": "notion", "active": True},
            {"id": "c3", "name": "Broken", "career_url": "https://jobs.lever.co/does-not-exist", "ats_type": "auto", "active": True},
            {"id": "c4", "name": "Paused", "career_url": "https://jobs.lever.co/paused", "ats_type": "auto", "active": False},
        ],
        "jobs": [],
        "fetch_runs": [],
    }


@pytest.fixture
def env(monkeypatch, tmp_path):
    client = FakeClient(tables())
    monkeypatch.setattr("job_radar.db.connect", lambda settings: JobRadarDB(client))
    monkeypatch.setattr(cli, "SessionPool", FakePool)
    FakePool.session = routes()
    FakeSMTP.sent, FakeSMTP.instances = [], []
    monkeypatch.setattr(notify.smtplib, "SMTP_SSL", FakeSMTP)
    settings = Settings(supabase_url="https://p.supabase.co", supabase_key="k", email_provider="smtp",
                        smtp_user="me@gmail.com", smtp_password="pw", email_from="Job Radar <me@gmail.com>",
                        site_url="https://me.github.io/Portfolio/", run_trigger="manual", max_workers=3)
    return client, settings


def args(**kw):
    base = dict(dry_run=False, company=None, no_email=False, email_preview=None)
    base.update(kw)
    return argparse.Namespace(**base)


def test_run_scans_stores_emails_and_records_run(env, capsys, monkeypatch, tmp_path):
    client, settings = env
    settings.log_details = True  # LOG_DETAILS=true: names in the log / summary (opt-in)
    summary = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))

    code = cli.cmd_run(args(), settings)
    assert code == 0  # one company failed → partial, not a failed run

    run = client.tables["fetch_runs"][0]
    assert run["status"] == "partial" and run["trigger"] == "manual"
    assert run["companies_checked"] == 3  # the inactive company is skipped
    assert run["jobs_scanned"] == 10 and run["new_matches"] == 2 and run["email_sent"] is True
    assert run["errors"] == [{"company": "Broken", "message": "Lever board not found (HTTP 404) — check the career URL / identifier"}]
    assert run["finished_at"]

    jobs = client.tables["jobs"]
    assert sorted(j["title"] for j in jobs) == ["Software Engineer, Infrastructure", "Software Engineer, Stripe Data Pipeline"]
    assert all(j["notified"] is True for j in jobs)

    msg = FakeSMTP.sent[0]
    assert msg["To"] == "me@example.com"
    assert msg["Subject"] in ("Job Radar: 2 new matches (Notion, Stripe)", "Job Radar: 2 new matches (Stripe, Notion)")

    companies = {c["name"]: c for c in client.tables["companies"]}
    assert companies["Stripe"]["ats_type"] == "greenhouse" and companies["Stripe"]["last_status"] == "ok"
    assert companies["Broken"]["last_status"] == "error"
    assert "last_checked_at" not in companies["Paused"]

    out = capsys.readouterr().out
    assert "::warning title=Job Radar · Broken::Lever board not found" in out
    assert "| Stripe | greenhouse:`stripe` | 5 | 1 | 1 | ✅ |" in summary.read_text()


def test_second_run_sends_nothing_new(env):
    client, settings = env
    cli.cmd_run(args(), settings)
    FakeSMTP.sent = []
    cli.cmd_run(args(), settings)
    assert FakeSMTP.sent == []
    assert client.tables["fetch_runs"][1]["new_matches"] == 0 and client.tables["fetch_runs"][1]["email_sent"] is False


def test_failed_email_is_retried_next_run(env, monkeypatch):
    client, settings = env

    class Boom(FakeSMTP):
        def login(self, user, password):
            raise notify.smtplib.SMTPAuthenticationError(535, b"bad creds")

    monkeypatch.setattr(notify.smtplib, "SMTP_SSL", Boom)
    cli.cmd_run(args(company="Stripe"), settings)
    run = client.tables["fetch_runs"][0]
    assert run["email_sent"] is False and run["status"] == "partial"
    assert run["errors"][0]["company"] == "(email)" and "App Password" in run["errors"][0]["message"]
    assert client.tables["jobs"][0]["notified"] is False

    monkeypatch.setattr(notify.smtplib, "SMTP_SSL", FakeSMTP)
    FakeSMTP.sent = []
    cli.cmd_run(args(company="Stripe"), settings)
    assert len(FakeSMTP.sent) == 1 and client.tables["jobs"][0]["notified"] is True


def test_run_single_company_and_no_email(env):
    client, settings = env
    assert cli.cmd_run(args(company="notion", no_email=True), settings) == 0
    run = client.tables["fetch_runs"][0]
    assert run["companies_checked"] == 1 and run["status"] == "success" and run["email_sent"] is False
    assert FakeSMTP.sent == []


def test_dry_run_writes_nothing(env, tmp_path):
    client, settings = env
    preview = tmp_path / "digest.html"
    assert cli.cmd_run(args(dry_run=True, email_preview=str(preview)), settings) == 0
    assert client.tables["fetch_runs"] == [] and client.tables["jobs"] == []
    assert [k for k, *_ in client.log if k != "select"] == []
    assert "Software Engineer, Stripe Data Pipeline" in preview.read_text()


def test_all_companies_failing_exits_nonzero(env):
    client, settings = env
    FakePool.session = FakeSession()  # everything 404s
    assert cli.cmd_run(args(), settings) == 1
    assert client.tables["fetch_runs"][0]["status"] == "failed"


def test_run_without_supabase_config():
    assert cli.cmd_run(args(), Settings()) == 2


def test_probe_prints_matches_without_database(monkeypatch, capsys):
    monkeypatch.setattr(cli, "SessionPool", FakePool)
    FakePool.session = routes()
    code = cli.main(["probe", "https://boards.greenhouse.io/stripe"])
    out = capsys.readouterr().out
    assert code == 0
    assert "greenhouse (stripe)" in out and "5 in" in out and "Matches    1 with score ≥ 50" in out
    assert "Software Engineer, Stripe Data Pipeline — Bangalore" in out
    assert "Software Engineer, Internal Systems — Bengaluru, India   ✗ needs 8+ yrs" in out


def test_probe_role_override_and_json(monkeypatch, capsys):
    import json

    monkeypatch.setattr(cli, "SessionPool", FakePool)
    FakePool.session = routes()
    cli.main(["probe", "https://jobs.ashbyhq.com/notion", "--role", "Software Engineer", "--anywhere", "--json"])
    data = json.loads(capsys.readouterr().out)
    assert data["ats_type"] == "ashby" and data["postings"] == 5
    assert {m["title"] for m in data["matches"]} >= {"Software Engineer, Infrastructure", "Software Engineer, Developer Platform"}


def test_unknown_company_name_fails(env):
    client, settings = env
    assert cli.cmd_run(args(company="Nope Corp"), settings) == 1
    run = client.tables["fetch_runs"][0]
    assert run["status"] == "failed" and run["errors"] == [{"company": "Nope Corp", "message": "no company with this name"}]


def test_inactive_company_can_be_scanned_by_name(env):
    client, settings = env
    FakePool.session.add("api.lever.co/v0/postings/paused", json_route(load_fixture("lever_spotify.json")))
    assert cli.cmd_run(args(company="Paused", no_email=True), settings) == 0
    assert client.tables["fetch_runs"][0]["jobs_scanned"] == 5


# ---------------------------------------------------------------------------
#  Public CI logs stay anonymous
# ---------------------------------------------------------------------------

PRIVATE = ("Stripe", "Notion", "Broken", "Software Engineer", "Infrastructure", "me@example.com", "me@gmail.com",
           "Bengaluru", "Hyderabad", "java", "greenhouse:", "does-not-exist", "p.supabase.co")


def test_ci_logs_and_summary_are_anonymised_by_default(env, capsys, caplog, monkeypatch, tmp_path):
    import logging

    from job_radar.log import log as radar_log

    client, settings = env
    assert settings.log_details is False
    summary = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    monkeypatch.setattr(radar_log, "propagate", True)
    caplog.set_level(logging.INFO, logger="job_radar")

    assert cli.cmd_run(args(), settings) == 0
    out = capsys.readouterr().out
    masks = [line for line in out.splitlines() if line.startswith("::add-mask::")]
    assert "::add-mask::me@example.com" in masks and "::add-mask::me@gmail.com" in masks
    public = "\n".join(line for line in out.splitlines() if not line.startswith("::add-mask::"))
    public += "\n" + caplog.text + "\n" + summary.read_text()
    for secret in PRIVATE:
        assert secret not in public, secret
    # …but the useful numbers are there
    assert "company #1: failed — Lever board not found (HTTP 404)" in caplog.text
    assert "company #3: 5 postings, 1 match, 1 new, ok" in caplog.text
    assert "::warning title=Job Radar::1 of 3 companies failed" in out
    assert "email: digest with 2 matches sent via smtp" in caplog.text
    assert "criteria: 2 target roles · 2 locations · 2 include / 2 exclude keywords" in caplog.text
    assert "| #3 | 5 | 1 | 1 | ✅ |" in summary.read_text()
    # full detail still lands in the database, which only the owner can read
    assert client.tables["fetch_runs"][0]["errors"][0]["company"] == "Broken"
    assert client.tables["companies"][2]["last_error"].startswith("Lever board not found")


def test_log_details_setting():
    ci = {"GITHUB_ACTIONS": "true", "RUN_TRIGGER": "schedule"}
    assert Settings.from_env(ci).log_details is False
    assert Settings.from_env({**ci, "LOG_DETAILS": "true"}).log_details is True
    assert Settings.from_env({"RUN_TRIGGER": "local"}).log_details is True
    assert Settings.from_env({"RUN_TRIGGER": "local", "LOG_DETAILS": "false"}).log_details is False
    assert Settings.from_env({"GITHUB_ACTIONS": "true", "RUN_TRIGGER": "local"}).log_details is False
    anon = Settings(supabase_url="https://p.supabase.co", email_to="me@x.com", email_from="Me <me@x.com>").redacted()
    assert "me@x.com" not in str(anon) and "p.supabase.co" not in str(anon) and anon["email_to"] == "set"
    assert Settings(email_to="me@x.com").redacted(details=True)["email_to"] == "me@x.com"


def test_verbose_enables_details_only_outside_ci(monkeypatch):
    seen = {}
    monkeypatch.setattr(cli, "cmd_run", lambda a, s: seen.setdefault("details", s.log_details) and 0)
    monkeypatch.setenv("RUN_TRIGGER", "schedule")
    monkeypatch.delenv("LOG_DETAILS", raising=False)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    cli.main(["-v", "run"])
    assert seen.pop("details") is True
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    cli.main(["-v", "run"])
    assert seen.pop("details") is False


# ---------------------------------------------------------------------------
#  fetch_runs lifecycle
# ---------------------------------------------------------------------------

def test_interrupted_run_still_closes_its_row(env, monkeypatch):
    client, settings = env

    def boom(*a, **kw):
        raise KeyboardInterrupt  # what a cancelled / timed-out GitHub job delivers

    monkeypatch.setattr(cli, "scan_company", boom)
    with pytest.raises(KeyboardInterrupt):
        cli.cmd_run(args(), settings)
    run = client.tables["fetch_runs"][0]
    assert run["status"] == "failed" and run["finished_at"]
    assert run["errors"][-1] == {"company": "(scanner)",
                                 "message": "interrupted — the run was cancelled or hit the job timeout"}


def test_sigterm_reaches_the_finally_block(env, monkeypatch):
    import os
    import signal
    import time as _time

    from job_radar.scanner import CompanyResult

    client, settings = env

    def terminated(company, *a, **kw):
        os.kill(os.getpid(), signal.SIGTERM)
        _time.sleep(0.2)
        return CompanyResult(company.get("id"), company["name"])

    before = signal.getsignal(signal.SIGTERM)
    monkeypatch.setattr(cli, "scan_company", terminated)
    with pytest.raises(SystemExit) as info:
        cli.cmd_run(args(company="Stripe"), settings)
    assert info.value.code == 128 + signal.SIGTERM
    assert client.tables["fetch_runs"][0]["status"] == "failed" and client.tables["fetch_runs"][0]["finished_at"]
    assert signal.getsignal(signal.SIGTERM) == before  # handler restored


def test_stale_running_rows_are_failed_at_start(env):
    client, settings = env
    client.tables["fetch_runs"].append({"id": "ghost", "status": "running", "started_at": "2026-01-01T00:00:00+00:00",
                                        "errors": []})
    cli.cmd_run(args(company="Stripe", no_email=True), settings)
    ghost = next(r for r in client.tables["fetch_runs"] if r["id"] == "ghost")
    assert ghost["status"] == "failed" and ghost["finished_at"]
    assert ghost["errors"][0]["message"].startswith("run did not finish")
    assert [r["status"] for r in client.tables["fetch_runs"] if r["id"] != "ghost"] == ["success"]


# ---------------------------------------------------------------------------
#  Digest idempotency
# ---------------------------------------------------------------------------

def test_matches_are_claimed_before_the_send(env, monkeypatch):
    client, settings = env
    at_send = []

    class Watch(FakeSMTP):
        def send_message(self, msg):
            at_send.append([j["notified"] for j in client.tables["jobs"]])
            super().send_message(msg)

    monkeypatch.setattr(notify.smtplib, "SMTP_SSL", Watch)
    cli.cmd_run(args(company="Stripe"), settings)
    assert at_send == [[True]]


def test_db_failure_after_send_never_repeats_the_digest(env, monkeypatch):
    client, settings = env
    monkeypatch.setattr(JobRadarDB, "finish_run", lambda self, run_id, values: (_ for _ in ()).throw(RuntimeError("blip")))
    assert cli.cmd_run(args(company="Stripe"), settings) == 0
    assert len(FakeSMTP.sent) == 1
    cli.cmd_run(args(company="Stripe"), settings)
    assert len(FakeSMTP.sent) == 1  # not sent again the next day


def test_claim_failure_skips_the_send_and_retries_later(env, monkeypatch):
    client, settings = env
    real = JobRadarDB.mark_notified
    calls = []

    def flaky(self, ids, value=True):
        calls.append(value)
        if len(calls) == 1:
            raise RuntimeError("Supabase blip")
        return real(self, ids, value)

    monkeypatch.setattr(JobRadarDB, "mark_notified", flaky)
    assert cli.cmd_run(args(company="Stripe"), settings) == 0
    run = client.tables["fetch_runs"][0]
    assert run["status"] == "partial" and run["email_sent"] is False
    assert run["errors"][0]["message"].startswith("digest not sent: could not mark matches as notified")
    assert FakeSMTP.sent == [] and client.tables["jobs"][0]["notified"] is False

    cli.cmd_run(args(company="Stripe"), settings)
    assert len(FakeSMTP.sent) == 1 and client.tables["jobs"][0]["notified"] is True


def test_archived_jobs_are_never_emailed(env):
    client, settings = env
    cli.cmd_run(args(company="Stripe", no_email=True), settings)
    client.tables["jobs"][0]["status"] = "archived"  # the owner dismissed it in the tracker
    cli.cmd_run(args(company="Stripe"), settings)
    assert FakeSMTP.sent == [] and client.tables["jobs"][0]["notified"] is False
    assert len(client.tables["jobs"]) == 1  # and it was not re-inserted as new
