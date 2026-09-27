"""Command line entry point.

    python -m job_radar run [--dry-run] [--company NAME] [--no-email] [--email-preview FILE]
    python -m job_radar probe <career_url> [--role "Backend Engineer"] [--anywhere] [--show 15] [--all]
    python -m job_radar email-test [--to you@example.com]
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from . import __version__
from .config import Settings
from .log import annotate, in_github_actions, log, mask, redact, setup, step_summary
from .models import Criteria, DigestItem, default_criteria
from .scanner import CompanyResult, SessionPool, fetch_postings, match_postings, scan_company
from .text import utcnow

DIGEST_LOOKBACK = timedelta(days=3)  # un-notified matches from a failed send are retried for this long


# ---------------------------------------------------------------------------
#  run — reporting
#
#  The repository is public, so GitHub Actions logs and job summaries are public too. Unless detail
#  logging is on (LOG_DETAILS=true, or a local run), only counts and anonymised company lines
#  ("company #3: …") are printed; names, titles, criteria and addresses stay in the database.
# ---------------------------------------------------------------------------

class Reporter:
    """Formats what the run prints, with or without identifying details."""

    def __init__(self, details: bool, companies: Sequence[dict] = ()):
        self.details = details
        self._index: Dict[str, int] = {}
        for i, c in enumerate(companies, 1):
            self._index.setdefault(str(c.get("id") or c.get("name")), i)

    def label(self, r: CompanyResult) -> str:
        if self.details:
            return r.name
        n = self._index.get(str(r.company_id or r.name))
        return f"company #{n}" if n else "company"

    def text(self, message: str) -> str:
        return message if self.details else redact(message)

    def result_line(self, r: CompanyResult) -> str:
        if self.details:
            src = f"{r.ats_type}:{r.identifier}" if r.ats_type != "custom" else "custom page"
            if r.detected:
                src += " (detected)"
            if r.error:
                return f"✗ {r.name} · {src} · {r.error} ({r.seconds:.1f}s)"
            extra = f" · {r.closed} closed" if r.closed else ""
            zero = " · 0 postings — double-check the career URL if this company is hiring" if r.postings == 0 else ""
            return (f"✓ {r.name} · {src} · {r.postings} postings → {r.matched} match · {len(r.new_jobs)} new"
                    f"{extra}{zero} ({r.seconds:.1f}s)")
        if r.skipped:
            return f"{self.label(r)}: skipped (run time budget)"
        if r.error:
            return f"{self.label(r)}: failed — {redact(r.error, 120)} ({r.seconds:.1f}s)"
        extra = f", {r.closed} closed" if r.closed else ""
        zero = " (0 postings — check the career URL)" if r.postings == 0 else ""
        return (f"{self.label(r)}: {r.postings} postings, {_plural(r.matched, 'match', 'matches')}, "
                f"{len(r.new_jobs)} new{extra}, ok{zero} ({r.seconds:.1f}s)")

    def criteria_line(self, c: Criteria) -> str:
        if self.details:
            return (f"criteria: roles={c.target_roles} level={c.experience_level} years={c.min_years}-{c.max_years} "
                    f"locations={c.locations}")
        return (f"criteria: {_plural(len(c.target_roles), 'target role')} · {_plural(len(c.locations), 'location')} · "
                f"{len(c.include_keywords)} include / {len(c.exclude_keywords)} exclude keywords")

    def summary_markdown(self, results: Sequence[CompanyResult], status: str, new_total: int, email_sent: bool,
                         dry_run: bool) -> str:
        failed = sum(1 for r in results if r.error)
        lines = [
            f"### Job Radar scan — {status}{' (dry run)' if dry_run else ''}",
            "",
            f"**{len(results)}** companies · **{sum(r.postings for r in results)}** postings · "
            f"**{new_total}** new matches · **{failed}** failed · email {'sent' if email_sent else 'not sent'}",
            "",
        ]
        if self.details:
            lines += ["| Company | Source | Postings | Matches | New | Status |", "|---|---|---:|---:|---:|---|"]
            for r in sorted(results, key=lambda x: x.name.lower()):
                src = r.ats_type if r.ats_type == "custom" else f"{r.ats_type}:`{r.identifier}`"
                state = "✅" if r.ok else f"❌ {r.error[:120].replace('|', '/')}"
                lines.append(f"| {r.name.replace('|', '/')} | {src} | {r.postings} | {r.matched} | {len(r.new_jobs)} | {state} |")
        else:
            lines += ["| Company | Postings | Matches | New | Status |", "|---|---:|---:|---:|---|"]
            for r in sorted(results, key=lambda x: self._index.get(str(x.company_id or x.name), 0)):
                state = "✅" if r.ok else ("⏭️ skipped" if r.skipped else "❌")
                lines.append(f"| {self.label(r).replace('company ', '')} | {r.postings} | {r.matched} | {len(r.new_jobs)} | {state} |")
            lines += ["", "_Company names and errors are in the tracker (Companies / History). "
                          "Set the repository variable `LOG_DETAILS=true` to print them here — this log is public._"]
        return "\n".join(lines) + "\n"


def _plural(n: int, one: str, many: Optional[str] = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


def _fmt_result(r: CompanyResult, details: bool = True) -> str:
    return Reporter(details).result_line(r)


def _summary_markdown(results: Sequence[CompanyResult], status: str, new_total: int, email_sent: bool, dry_run: bool,
                      details: bool = True) -> str:
    return Reporter(details).summary_markdown(results, status, new_total, email_sent, dry_run)


def _addresses(*values: Optional[str]) -> List[str]:
    from .notify import recipients

    out: List[str] = []
    for v in values:
        for addr in recipients(v or ""):
            if addr not in out:
                out.append(addr)
    return out


def _digest_items_from_rows(rows: Sequence[dict], names: dict) -> List[DigestItem]:
    items = []
    for row in rows:
        items.append(
            DigestItem(
                company=names.get(row.get("company_id"), "Unknown company"),
                title=row.get("title") or "(untitled)",
                url=row.get("url"),
                location=row.get("location"),
                score=int(row.get("match_score") or 0),
                reasons=list(row.get("match_reasons") or []),
                posted_at=row.get("posted_at"),
                job_id=row.get("id"),
            )
        )
    return items


# ---------------------------------------------------------------------------
#  run
# ---------------------------------------------------------------------------

@dataclass
class RunState:
    started: datetime
    run_id: Optional[str] = None
    errors: List[dict] = field(default_factory=list)
    results: List[CompanyResult] = field(default_factory=list)
    email_sent: bool = False
    status: str = "failed"
    new_total: int = 0
    companies: List[dict] = field(default_factory=list)  # in scan order (numbers "company #N")

    def finish_values(self) -> dict:
        return {
            "finished_at": utcnow().isoformat(),
            "status": self.status,
            "companies_checked": sum(1 for r in self.results if not r.skipped),
            "jobs_scanned": sum(r.postings for r in self.results),
            "new_matches": self.new_total,
            "email_sent": self.email_sent,
            "errors": self.errors,
        }


def _raise_system_exit(signum, _frame):  # SIGTERM → SystemExit, so try/finally blocks still run
    raise SystemExit(128 + signum)


def _install_sigterm():
    if threading.current_thread() is not threading.main_thread():
        return None
    try:
        return signal.signal(signal.SIGTERM, _raise_system_exit)
    except (ValueError, OSError, AttributeError):  # pragma: no cover - platform specific
        return None


def _restore_sigterm(previous) -> None:
    if previous is None:
        return
    try:
        signal.signal(signal.SIGTERM, previous)
    except (ValueError, OSError, TypeError):  # pragma: no cover
        pass


def _hold_sigterm(previous) -> None:
    """While the fetch_runs row is written, a (second) SIGTERM must not cut the write short."""
    if previous is None:
        return
    try:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    except (ValueError, OSError):  # pragma: no cover
        pass


def cmd_run(args, settings: Settings) -> int:
    dry_run = bool(args.dry_run or settings.dry_run)
    if not settings.has_supabase:
        log.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see backend/.env.example). "
                  "Use `python -m job_radar probe <url>` to try the scanner without a database.")
        annotate("error", "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY secrets are missing", "Job Radar")
        return 2

    from .db import connect

    details = settings.log_details
    mask(_addresses(settings.email_to, settings.email_from, settings.smtp_user))  # no-op outside GitHub Actions
    log.info("Job Radar %s · %s", __version__, " · ".join(f"{k}={v}" for k, v in settings.redacted(details).items()))
    db = connect(settings)
    state = RunState(started=utcnow())
    previous_handler = _install_sigterm()

    try:
        _scan_and_notify(args, settings, db, state, dry_run, details)
    except BaseException as exc:  # noqa: B902 — KeyboardInterrupt / SystemExit (cancel, timeout) must close the run too
        if isinstance(exc, Exception):
            message = f"{type(exc).__name__}: {exc}"
        else:
            message = "interrupted — the run was cancelled or hit the job timeout"
        report = Reporter(details, state.companies)
        log.error("run aborted: %s", report.text(message))
        annotate("error", report.text(message), "Job Radar run aborted")
        state.errors.append({"company": "(scanner)", "message": message[:500]})
        state.status = "failed"
        if not isinstance(exc, Exception):
            raise
    else:
        company_errors = [r for r in state.results if r.error]
        if (state.results and len(company_errors) == len(state.results)) or (not state.results and state.errors):
            state.status = "failed"
        elif state.errors:
            state.status = "partial"
        else:
            state.status = "success"
    finally:
        _hold_sigterm(previous_handler)
        report = Reporter(details, state.companies)
        if state.run_id:
            try:
                db.finish_run(state.run_id, state.finish_values())
            except Exception as exc:
                log.error("could not finish the fetch_runs row: %s", report.text(str(exc)))
        _restore_sigterm(previous_handler)
        took = (utcnow() - state.started).total_seconds()
        log.info("done: %s · %d companies · %d postings · %d new · email %s · %d error(s) · %.1fs",
                 state.status, len(state.results), sum(r.postings for r in state.results), state.new_total,
                 "sent" if state.email_sent else "not sent", len(state.errors), took)
        step_summary(report.summary_markdown(state.results, state.status, state.new_total, state.email_sent, dry_run))
    return 1 if state.status == "failed" else 0


def _scan_and_notify(args, settings: Settings, db, state: RunState, dry_run: bool, details: bool) -> None:
    criteria_row = db.load_criteria_row()
    criteria = Criteria.from_row(criteria_row)
    mask(_addresses(criteria.email_to))
    if not criteria_row:
        log.warning("no search_criteria row found — using the default criteria")
    report = Reporter(details)
    log.info(report.criteria_line(criteria))

    companies = state.companies = db.load_companies(args.company)
    report = Reporter(details, companies)
    if args.company and not companies:
        log.error("no company matches %s", repr(args.company) if details else "the --company filter")
        state.errors.append({"company": args.company, "message": "no company with this name"})
    log.info("scanning %d compan%s with %d workers%s", len(companies), "y" if len(companies) == 1 else "ies",
             settings.max_workers, " — DRY RUN (no writes, no email)" if dry_run else "")

    if not dry_run:
        try:
            stale = db.fail_stale_runs(state.started)
            if stale:
                log.warning("closed %d fetch_runs row%s left 'running' by an earlier run that never finished",
                            stale, "" if stale == 1 else "s")
        except Exception as exc:  # housekeeping only — never blocks the scan
            log.warning("could not close stale fetch_runs rows: %s", report.text(str(exc)))
        state.run_id = db.start_run(settings.run_trigger, state.started)

    sessions = SessionPool(settings.request_timeout)
    workers = max(1, min(settings.max_workers, len(companies) or 1))
    run_deadline = time.monotonic() + settings.run_budget if settings.run_budget else None
    pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="scan")
    try:
        futures = {
            pool.submit(scan_company, c, criteria, sessions, db, dry_run=dry_run, enrich_limit=settings.enrich_limit,
                        budget=settings.company_budget, run_deadline=run_deadline): c
            for c in companies
        }
        for fut in as_completed(futures):
            company = futures[fut]
            try:
                r = fut.result()
            except Exception as exc:  # scan_company already isolates; this is belt and braces
                r = CompanyResult(company.get("id"), str(company.get("name")), error=f"{type(exc).__name__}: {exc}")
            state.results.append(r)
            if r.error:
                log.warning(report.result_line(r))
                if details:
                    annotate("warning", r.error, f"Job Radar · {r.name}")
                state.errors.append({"company": r.name, "message": r.error[:500]})
            else:
                log.info(report.result_line(r))
                if details:
                    for job in r.new_jobs:
                        log.info("    + %s [%s] %s", job.get("title"), job.get("match_score"), job.get("location") or "")
    except BaseException:
        pool.shutdown(wait=False, cancel_futures=True)  # do not wait for running scans: close the run row now
        raise
    pool.shutdown(wait=True)

    failed = [r for r in state.results if r.error]
    if failed and not details:
        annotate("warning", f"{len(failed)} of {len(state.results)} companies failed — see the tracker "
                            "(Companies tab) for the errors", "Job Radar")
    state.new_total = sum(len(r.new_jobs) for r in state.results)
    names = {c.get("id"): c.get("name") for c in companies}

    # ---- email digest ----
    email_to = criteria.email_to or settings.email_to
    if dry_run:
        items = _digest_items_from_rows([j for r in state.results for j in r.new_jobs], names)
        if items:
            from .notify import build_digest

            subject, html_body, _text = build_digest(items, settings.tracker_url)
            if details:
                log.info("dry run: would email %s → %r", email_to or "(no recipient)", subject)
            else:
                log.info("dry run: would email a digest of %s", _plural(len(items), "match", "matches"))
            if args.email_preview:
                Path(args.email_preview).write_text(html_body, encoding="utf-8")
                log.info("dry run: digest preview written to %s", args.email_preview)
    elif args.no_email:
        log.info("email: skipped (--no-email)")
    elif not criteria.email_enabled:
        log.info("email: disabled in search criteria")
    elif settings.email_provider == "none":
        log.info("email: no provider configured (set SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY)")
    else:
        state.email_sent = _send_pending_digest(db, settings, email_to, names, state.started, state.errors, report)


def _send_pending_digest(db, settings: Settings, email_to: Optional[str], names: dict, started: datetime,
                         errors: List[dict], report: Optional[Reporter] = None) -> bool:
    """E-mail every pending match once.

    The matches are marked ``notified`` *before* sending (and un-marked if the send fails), so a database
    error after a successful send can never mark the run failed or repeat the digest the next day."""
    from .notify import EmailError, send_digest

    report = report or Reporter(settings.log_details)
    try:
        rows = db.pending_digest_jobs(started - DIGEST_LOOKBACK)
    except Exception as exc:
        errors.append({"company": "(email)", "message": f"could not load pending matches: {exc}"[:500]})
        return False
    if not rows:
        log.info("email: nothing new to send")
        return False
    missing = {r.get("company_id") for r in rows} - set(names)
    if missing:
        try:
            for c in db.client.select("companies", "id,name", filters=[("id", "in", sorted(missing))]):
                names[c["id"]] = c["name"]
        except Exception:
            pass
    items = _digest_items_from_rows(rows, names)
    if not email_to:
        errors.append({"company": "(email)", "message": "no recipient — set email_to in search criteria or EMAIL_TO"})
        return False
    ids = [i.job_id for i in items if i.job_id]

    def release(reason: str) -> None:
        try:
            db.mark_notified(ids, False)
        except Exception as exc:
            errors.append({"company": "(email)", "message": (
                f"{reason}; {len(ids)} match(es) could not be queued again ({exc}) — they are still in the tracker")[:500]})

    try:
        db.mark_notified(ids)
    except Exception as exc:
        errors.append({"company": "(email)", "message": f"digest not sent: could not mark matches as notified: {exc}"[:500]})
        release("digest not sent")
        return False

    try:
        sent = send_digest(settings, email_to, items)
    except EmailError as exc:
        log.warning("email: %s", report.text(str(exc)))
        annotate("warning", report.text(str(exc)), "Job Radar · email")
        errors.append({"company": "(email)", "message": str(exc)[:500]})
        release("digest not sent")
        return False
    except BaseException:
        release("digest interrupted")
        raise
    if not sent:
        release("digest not sent")
        return False
    count = _plural(len(items), "match", "matches")
    if report.details:
        log.info("email: digest with %s sent to %s via %s", count, email_to, settings.email_provider)
    else:
        log.info("email: digest with %s sent via %s", count, settings.email_provider)
    return True


# ---------------------------------------------------------------------------
#  probe
# ---------------------------------------------------------------------------

def _probe_criteria(args, settings: Settings) -> Tuple[Criteria, str]:
    if args.role:
        c = default_criteria()
        c.target_roles = list(args.role)
        label = "--role " + ", ".join(repr(r) for r in args.role)
    else:
        c, label = default_criteria(), "default criteria (schema seed)"
        if settings.has_supabase:
            try:
                from .db import connect

                row = connect(settings).load_criteria_row()
                if row:
                    c, label = Criteria.from_row(row), "criteria from Supabase"
            except Exception as exc:
                log.warning("could not load criteria from Supabase (%s) — using defaults", exc)
    if args.anywhere:
        c.locations = []
        label += " · any location"
    if args.level:
        c.experience_level = args.level
    return c, label


def cmd_probe(args, settings: Settings) -> int:
    criteria, label = _probe_criteria(args, settings)
    company = {"name": args.url, "career_url": args.url, "ats_type": args.ats or "auto", "ats_identifier": args.identifier}
    sessions = SessionPool(settings.request_timeout)
    t0 = time.monotonic()
    try:
        outcome = fetch_postings(company, criteria, sessions.get(), settings.enrich_limit)
    except Exception as exc:
        print(f"\n  ✗ {args.url}\n    {type(exc).__name__}: {exc}\n")
        return 1
    took = time.monotonic() - t0
    scored = match_postings(outcome.postings, criteria, enrichable=outcome.enrichable)
    matched = sorted([(p, m) for p, m in scored if m.matched], key=lambda pm: -pm[1].score)

    if args.json:
        print(json.dumps({
            "ats_type": outcome.ats_type, "identifier": outcome.identifier, "detected": outcome.detected,
            "postings": len(outcome.postings), "complete": outcome.complete, "matches": [
                {"title": p.title, "url": p.url, "location": p.location, "score": m.score, "reasons": m.reasons,
                 "years_required": m.years_required} for p, m in matched],
        }, indent=2, ensure_ascii=False))
        return 0

    src = f"{outcome.ats_type} ({outcome.identifier})" if outcome.ats_type != "custom" else "custom page scrape"
    print()
    print(f"  Probe      {args.url}")
    print(f"  ATS        {src}{'  ← detected on the page' if outcome.detected else ''}")
    print(f"  Postings   {len(outcome.postings)} in {took:.1f}s ({'complete listing' if outcome.complete else 'search / partial listing'})"
          + (f", {outcome.enriched} enriched with details" if outcome.enriched else ""))
    print(f"  Criteria   {label}")
    print(f"  Matches    {len(matched)} with score ≥ 50")
    print()
    for p, m in matched[: args.show]:
        print(f"  {m.score:>3}  {p.title}" + (f" — {p.location}" if p.location else ""))
        print(f"       {' · '.join(m.reasons)}")
        if p.url:
            print(f"       {p.url}")
    if len(matched) > args.show:
        print(f"       … and {len(matched) - args.show} more (use --show N)")
    near = [(p, m) for p, m in scored if not m.matched and any(r.startswith(("title ≈", "title ~")) for r in m.reasons)]
    if near:
        print(f"\n  Title matched but filtered out: {len(near)}")
        for p, m in near[: min(8, args.show)]:
            print(f"       {p.title}" + (f" — {p.location}" if p.location else "") + f"   ✗ {m.reasons[-1]}")
    if args.all:
        print(f"\n  All postings ({len(outcome.postings)}):")
        for p in outcome.postings:
            print(f"       {p.title}" + (f" — {p.location}" if p.location else ""))
    print()
    return 0


# ---------------------------------------------------------------------------
#  email-test
# ---------------------------------------------------------------------------

def cmd_email_test(args, settings: Settings) -> int:
    from .notify import EmailError, build_digest, send_digest

    items = [
        DigestItem(company="Example Co", title="Senior Software Engineer, Backend", url="https://example.com/jobs/1",
                   location="Bengaluru, India", score=91, reasons=["title ≈ Senior Software Engineer", "level: senior",
                                                                   "3+ yrs", "📍 Bengaluru", "+java +kafka"],
                   posted_at=utcnow().isoformat()),
        DigestItem(company="Example Co", title="Software Engineer II", url="https://example.com/jobs/2",
                   location="Remote", score=72, reasons=["title ≈ SDE II", "level: mid", "🌐 remote"]),
        DigestItem(company="Sample Labs", title="Backend Engineer", url="https://example.com/jobs/3",
                   location="Hyderabad, India", score=64, reasons=["title ≈ Backend Engineer", "📍 Hyderabad"]),
    ]
    if args.preview:
        _s, html_body, _t = build_digest(items, settings.tracker_url)
        Path(args.preview).write_text(html_body, encoding="utf-8")
        print(f"preview written to {args.preview}")
        return 0
    to = args.to or settings.email_to
    if not to:
        print("set --to or EMAIL_TO")
        return 2
    if settings.email_provider == "none":
        print("no email provider configured — set SMTP_USER + SMTP_PASSWORD (Gmail app password) or RESEND_API_KEY")
        return 2
    try:
        send_digest(settings, to, items)
    except EmailError as exc:
        print(f"✗ {exc}")
        return 1
    print(f"✓ test digest sent to {to} via {settings.email_provider}")
    return 0


# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m job_radar", description="Job Radar — daily career-page scanner")
    p.add_argument("-v", "--verbose", action="store_true",
                   help="debug logging + full detail (in GitHub Actions only together with LOG_DETAILS=true)")
    p.add_argument("--version", action="version", version=f"job_radar {__version__}")
    sub = p.add_subparsers(dest="command")

    run = sub.add_parser("run", help="scan all active companies, store new matches, email the digest")
    run.add_argument("--dry-run", action="store_true", help="read only: no database writes, no email")
    run.add_argument("--company", metavar="NAME", help="scan only this company (case-insensitive name match)")
    run.add_argument("--no-email", action="store_true", help="store matches but do not send the digest")
    run.add_argument("--email-preview", metavar="FILE", help="with --dry-run: write the digest HTML to FILE")

    probe = sub.add_parser("probe", help="detect + fetch one career URL and show what would match (no database needed)")
    probe.add_argument("url")
    probe.add_argument("--role", action="append", help="target role (repeatable); default = criteria roles")
    probe.add_argument("--anywhere", action="store_true", help="ignore the location filter")
    probe.add_argument("--level", choices=["any", "entry", "mid", "senior", "lead"], help="override experience level")
    probe.add_argument("--ats", choices=["auto", "greenhouse", "lever", "ashby", "workday", "smartrecruiters",
                                         "recruitee", "workable", "custom"], help="force an ATS type")
    probe.add_argument("--identifier", help="ATS identifier (board token / slug) when forcing --ats")
    probe.add_argument("--show", type=int, default=15, help="how many matches to print (default 15)")
    probe.add_argument("--all", action="store_true", help="also list every posting title")
    probe.add_argument("--json", action="store_true", help="machine-readable output")

    et = sub.add_parser("email-test", help="send (or preview) a sample digest to check email settings")
    et.add_argument("--to", help="recipient (default EMAIL_TO)")
    et.add_argument("--preview", metavar="FILE", help="write the sample digest HTML to FILE instead of sending")
    return p


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.command:
        setup(verbose=False)
        parser.print_help()
        return 2
    settings = Settings.from_env()
    if args.verbose and not in_github_actions():
        settings.log_details = True  # locally, --verbose also means "show everything"
    # debug output can carry URLs, so in GitHub Actions it needs LOG_DETAILS=true as well
    setup(verbose=bool(args.verbose and settings.log_details))
    if args.command == "run":
        return cmd_run(args, settings)
    if args.command == "probe":
        return cmd_probe(args, settings)
    if args.command == "email-test":
        return cmd_email_test(args, settings)
    parser.print_help()
    return 2


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
