"""Scan one company: resolve its ATS → fetch → enrich → match → reconcile with the jobs table."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from . import matcher
from .ats import MODULES, detect_known, get_module, identifier_for
from .log import log
from .models import Criteria, FetchError, MatchResult, Posting
from .net import BudgetExceeded, make_session

MAX_CLOSE_CHECKS = 25  # per company, for search-based listings
UNENRICHED_REASON = "years not checked"  # a match whose details page was not read (enrich budget)


# ---------------------------------------------------------------------------
#  Resolve which ATS to use
# ---------------------------------------------------------------------------

def resolve_source(company: dict) -> Tuple[str, Optional[str]]:
    """(ats_type, identifier) to fetch with. 'custom' means scrape ``career_url`` (identifier = URL).

    * ``auto`` / ``custom`` / an unknown type: a career URL of a known ATS uses that ATS' API.
    * a known type with a usable ``ats_identifier`` uses it; a missing or unparseable identifier is
      derived from the career URL (the tracker sends null and lets the scanner work it out).
    * otherwise the page is scraped, which also finds ATS boards embedded on a company's own domain."""
    ats = str(company.get("ats_type") or "auto").strip().lower()
    url = str(company.get("career_url") or "").strip()
    stored = str(company.get("ats_identifier") or "").strip()
    if ats not in MODULES or ats == "custom":
        found = detect_known(url)
        return found if found else ("custom", url)
    ident = identifier_for(ats, stored) if stored else None
    if ident:
        return ats, ident
    found = detect_known(url)
    if found:
        return found  # same ATS → its identifier; a different known ATS → the URL is more trustworthy
    return "custom", url


# ---------------------------------------------------------------------------
#  Sessions (one per worker thread)
# ---------------------------------------------------------------------------

class SessionPool:
    def __init__(self, timeout: float = 20.0):
        self.timeout = timeout
        self._local = threading.local()

    def get(self):
        s = getattr(self._local, "session", None)
        if s is None:
            s = make_session(self.timeout)
            self._local.session = s
        return s


# ---------------------------------------------------------------------------
#  Fetch + match (no database)
# ---------------------------------------------------------------------------

@dataclass
class FetchOutcome:
    ats_type: str
    identifier: Optional[str]
    postings: List[Posting]
    complete: bool
    detected: Optional[Tuple[str, str]] = None  # set when a custom page revealed a real ATS
    enriched: int = 0
    enrichable: bool = False  # the listing has no descriptions; details come from enrich()


def enrich_candidates(items: Sequence[Posting], criteria: Criteria, known_ids=()) -> List[Posting]:
    """Postings worth a details request, best first.

    Skips postings that already have a description, cannot match on title/level/listed location, or are
    already stored (plan_sync only uses match results of *new* postings). Postings whose listing already
    names an accepted location go before the ones with no location ("2 Locations" on Workday)."""
    known = set(known_ids or ())
    picked = [p for p in items
              if not p.description_text and p.external_id not in known and matcher.title_prefilter(p, criteria)]
    return sorted(picked, key=lambda p: 0 if p.locations else 1)  # stable: listing order within each group


def fetch_postings(company: dict, criteria: Criteria, session, enrich_limit: int = 40,
                   known_ids=()) -> FetchOutcome:
    ats, ident = resolve_source(company)
    module = get_module(ats)
    if not ident:
        raise FetchError("no career URL / identifier to scan")
    postings = module.fetch(ident, session, criteria)
    detected = getattr(postings, "detected", None)
    complete = bool(getattr(postings, "complete", getattr(module, "COMPLETE_LISTING", True)))
    if detected:
        ats, ident = detected
        module = get_module(ats)

    unique: Dict[str, Posting] = {}
    for p in postings:
        if p.external_id and p.title and p.external_id not in unique:
            unique[p.external_id] = p
    items = list(unique.values())

    enriched = 0
    enrich = getattr(module, "enrich", None)
    limit = enrich_limit * max(1, int(getattr(module, "ENRICH_MULTIPLIER", 1)))
    if enrich and limit > 0:
        for p in enrich_candidates(items, criteria, known_ids)[:limit]:
            try:
                enrich(p, ident, session)
                enriched += 1
            except BudgetExceeded:
                break  # out of time: match what we have
            except Exception as exc:  # one bad posting page must not sink the company
                log.debug("enrich failed: %s", type(exc).__name__)
    return FetchOutcome(ats, ident, items, complete, detected, enriched, enrichable=bool(enrich))


def match_postings(postings: Sequence[Posting], criteria: Criteria,
                   enrichable: bool = False) -> List[Tuple[Posting, MatchResult]]:
    """Score every posting. With ``enrichable``, a match whose details were never read (so years and
    description keywords were not checked) says so in its reasons."""
    out = []
    for p in postings:
        m = matcher.score(p, criteria)
        if enrichable and m.matched and not p.description_text:
            m = m._replace(reasons=[*m.reasons, UNENRICHED_REASON])
        out.append((p, m))
    return out


# ---------------------------------------------------------------------------
#  Reconcile with the jobs table
# ---------------------------------------------------------------------------

@dataclass
class SyncPlan:
    new_rows: List[dict] = field(default_factory=list)
    touch_ids: List[str] = field(default_factory=list)       # still listed → last_seen_at = now, is_active = true
    close_ids: List[str] = field(default_factory=list)       # gone → is_active = false
    verify: List[dict] = field(default_factory=list)         # missing from a partial listing → confirm first


def new_job_row(company_id: str, posting: Posting, result: MatchResult, now: datetime) -> dict:
    row = posting.to_job_row()
    row.update(
        {
            "company_id": company_id,
            "match_score": int(result.score),
            "match_reasons": list(result.reasons),
            "years_required": result.years_required,
            "source": "scraper",
            "is_active": True,
            "date_found": now.isoformat(),
            "last_seen_at": now.isoformat(),
        }
    )
    return row


def plan_sync(company_id: str, existing: Sequence[dict], postings: Sequence[Posting],
              matches: Sequence[Tuple[Posting, MatchResult]], complete: bool, now: datetime) -> SyncPlan:
    """Pure function: what to insert / touch / close. Never touches user-managed fields."""
    plan = SyncPlan()
    by_ext = {row["external_id"]: row for row in existing if row.get("external_id")}
    listed = {p.external_id for p in postings}

    for posting, result in matches:
        if result.matched and posting.external_id not in by_ext:
            plan.new_rows.append(new_job_row(company_id, posting, result, now))
            by_ext[posting.external_id] = {"external_id": posting.external_id}  # guard duplicates

    for ext, row in by_ext.items():
        if not row.get("id"):
            continue
        if ext in listed:
            plan.touch_ids.append(row["id"])  # last_seen_at / is_active only — status (e.g. archived) is kept
        elif row.get("is_active", True) and row.get("source", "scraper") == "scraper":
            if complete:
                if postings:  # an empty listing is more likely a glitch than every job closing at once
                    plan.close_ids.append(row["id"])
            elif row.get("status") != "archived":  # the owner dismissed it: not worth an is_open check
                plan.verify.append(row)
    return plan


# ---------------------------------------------------------------------------
#  One company end-to-end
# ---------------------------------------------------------------------------

@dataclass
class CompanyResult:
    company_id: Optional[str]
    name: str
    ats_type: str = "custom"
    identifier: Optional[str] = None
    postings: int = 0
    matched: int = 0
    new_jobs: List[dict] = field(default_factory=list)
    touched: int = 0
    closed: int = 0
    error: Optional[str] = None
    detected: Optional[Tuple[str, str]] = None
    seconds: float = 0.0
    matches: List[Tuple[Posting, MatchResult]] = field(default_factory=list)
    skipped: bool = False  # not scanned at all (the run ran out of time)

    @property
    def ok(self) -> bool:
        return self.error is None


def company_updates(company: dict, result: CompanyResult, now: datetime) -> dict:
    values: dict = {"last_checked_at": now.isoformat()}
    if result.error:
        values.update({"last_status": "error", "last_error": result.error[:500]})
        return values
    values.update({"last_status": "ok", "last_error": None, "jobs_seen_count": int(result.postings)})
    stored_type = str(company.get("ats_type") or "auto").lower()
    ident = result.identifier if result.ats_type != "custom" else None
    switched = result.ats_type != "custom" and result.ats_type != stored_type  # URL / page named another ATS
    if stored_type == "auto" or result.detected or switched:
        if result.ats_type != stored_type:
            values["ats_type"] = result.ats_type
        if ident != company.get("ats_identifier"):
            values["ats_identifier"] = ident
    elif stored_type == result.ats_type and ident and ident != company.get("ats_identifier"):
        values["ats_identifier"] = ident
    return values


def scan_company(company: dict, criteria: Criteria, sessions: SessionPool, db=None, *, dry_run: bool = False,
                 enrich_limit: int = 40, now_fn: Callable[[], datetime] = None, budget: Optional[float] = None,
                 run_deadline: Optional[float] = None) -> CompanyResult:
    """Scan one company. ``budget`` = seconds this company may take (enforced between HTTP requests);
    ``run_deadline`` = ``time.monotonic()`` after which the company is skipped without being scanned."""
    from .text import utcnow

    now_fn = now_fn or utcnow
    started = time.monotonic()
    name = str(company.get("name") or company.get("career_url") or "company")
    result = CompanyResult(company_id=company.get("id"), name=name)
    if run_deadline is not None and started >= run_deadline:
        result.skipped = True
        result.error = "skipped — the run reached its time budget before this company (it is scanned next run)"
        return result
    session = sessions.get()
    if budget:
        session.deadline = started + budget
    try:
        result.ats_type, result.identifier = resolve_source(company)  # so error lines name the right source
        existing: List[dict] = []
        if db is not None and company.get("id"):
            existing = db.jobs_for_company(company["id"])
        known = {row.get("external_id") for row in existing if row.get("external_id")}
        outcome = fetch_postings(company, criteria, session, enrich_limit, known_ids=known)
        result.ats_type, result.identifier, result.detected = outcome.ats_type, outcome.identifier, outcome.detected
        result.postings = len(outcome.postings)
        scored = match_postings(outcome.postings, criteria, enrichable=outcome.enrichable)
        result.matches = [(p, m) for p, m in scored if m.matched]
        result.matched = len(result.matches)

        if db is not None and company.get("id"):
            now = now_fn()
            plan = plan_sync(company["id"], existing, outcome.postings, result.matches, outcome.complete, now)
            if plan.verify:
                checker = getattr(get_module(outcome.ats_type), "is_open", None)
                for row in plan.verify[:MAX_CLOSE_CHECKS] if checker else []:
                    try:
                        still_open = checker(outcome.identifier, row["external_id"], session)
                    except BudgetExceeded:
                        break  # out of time: unchecked jobs simply stay active
                    except Exception:  # a failed check just means "unsure" — keep the job active
                        still_open = None
                    if still_open is False:
                        plan.close_ids.append(row["id"])
            result.touched, result.closed = len(plan.touch_ids), len(plan.close_ids)
            if dry_run:
                result.new_jobs = plan.new_rows
            else:
                result.new_jobs = db.insert_jobs(plan.new_rows) if plan.new_rows else []
                if plan.touch_ids:
                    db.touch_jobs(plan.touch_ids, now)
                if plan.close_ids:
                    db.deactivate_jobs(plan.close_ids)
        elif db is None:
            result.new_jobs = [new_job_row(company.get("id") or "", p, m, now_fn()) for p, m in result.matches]
    except FetchError as exc:
        out_of_time = isinstance(exc, BudgetExceeded) or (
            budget and getattr(session, "deadline", None) is not None and time.monotonic() >= session.deadline)
        if out_of_time:
            result.error = (f"gave up after {budget:.0f}s (per-company time budget) — the site is very slow or "
                            "rate limiting; it is retried next run")
        else:
            result.error = str(exc)
    except Exception as exc:  # isolation: nothing a single company does may stop the run
        result.error = f"{type(exc).__name__}: {exc}"
        log.debug("unexpected error while scanning a company", exc_info=True)
    finally:
        if budget:
            session.deadline = None

    if db is not None and company.get("id") and not dry_run:
        try:
            db.update_company(company["id"], company_updates(company, result, now_fn()))
        except Exception as exc:
            if not result.error:
                result.error = f"could not update company row: {exc}"
    result.seconds = time.monotonic() - started
    return result
