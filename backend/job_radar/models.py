"""Plain data objects shared by the fetchers, matcher, scanner and notifier."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, List, Mapping, NamedTuple, Optional


@dataclass
class Posting:
    """One job posting as read from a career site (before matching)."""

    external_id: str
    title: str
    url: Optional[str] = None
    location: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    remote: Optional[bool] = None
    posted_at: Optional[datetime] = None
    description_text: str = ""
    #: every location the posting lists (``location`` is a short display form of these)
    locations: List[str] = field(default_factory=list)
    #: True when the ATS search itself was restricted to the criteria locations (Workday location
    #: facet), so a listing that only says "3 Locations" is known to include one of them
    in_region: bool = False

    def all_locations_text(self) -> str:
        parts = [p for p in [self.location, *self.locations] if p]
        return " | ".join(parts)

    def to_job_row(self) -> dict:
        """Scraped columns of a ``jobs`` row. User-managed columns are never included."""
        return {
            "external_id": self.external_id,
            "title": self.title,
            "url": self.url,
            "location": self.location,
            "department": self.department,
            "employment_type": self.employment_type,
            "remote": self.remote,
            "posted_at": self.posted_at.isoformat() if self.posted_at else None,
        }


class Postings(list):
    """A list of postings plus whether it is the board's *complete* listing.

    Search-based fetchers (Workday, very large SmartRecruiters boards, custom pages) return
    ``complete=False``; the scanner then confirms a missing posting is really closed before
    marking it inactive, instead of assuming every job not returned has disappeared."""

    def __init__(self, items=(), complete: bool = True, detected: Optional[tuple] = None):
        super().__init__(items)
        self.complete = complete
        #: (ats_type, identifier) when a custom page turned out to embed a known ATS
        self.detected = detected


def _str_list(value: Any) -> List[str]:
    if not value:
        return []
    if isinstance(value, str):
        # tolerate a comma separated string or a Postgres array literal "{a,b}"
        value = value.strip().strip("{}")
        value = [v.strip().strip('"') for v in value.split(",")]
    return [str(v).strip() for v in value if str(v).strip()]


def _opt_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@dataclass
class Criteria:
    """Mirror of the single ``search_criteria`` row."""

    target_roles: List[str] = field(default_factory=list)
    experience_level: str = "any"
    min_years: Optional[int] = None
    max_years: Optional[int] = None
    include_keywords: List[str] = field(default_factory=list)
    exclude_keywords: List[str] = field(default_factory=list)
    locations: List[str] = field(default_factory=list)
    remote_ok: bool = True
    email_enabled: bool = True
    email_to: Optional[str] = None
    id: Optional[str] = None

    @classmethod
    def from_row(cls, row: Optional[Mapping[str, Any]]) -> "Criteria":
        if not row:
            return default_criteria()
        level = str(row.get("experience_level") or "any").lower()
        if level not in ("any", "entry", "mid", "senior", "lead"):
            level = "any"
        return cls(
            id=row.get("id"),
            target_roles=_str_list(row.get("target_roles")),
            experience_level=level,
            min_years=_opt_int(row.get("min_years")),
            max_years=_opt_int(row.get("max_years")),
            include_keywords=_str_list(row.get("include_keywords")),
            exclude_keywords=_str_list(row.get("exclude_keywords")),
            locations=_str_list(row.get("locations")),
            remote_ok=bool(row.get("remote_ok", True)),
            email_enabled=bool(row.get("email_enabled", True)),
            email_to=(row.get("email_to") or None),
        )


def default_criteria() -> Criteria:
    """Same values as the seed row in supabase/schema.sql (used by `probe` without a database)."""
    return Criteria(
        target_roles=["Software Engineer", "Senior Software Engineer", "Backend Engineer", "SDE 2", "SDE II", "Java Developer"],
        experience_level="mid",
        min_years=2,
        max_years=6,
        include_keywords=["java", "spring", "kafka", "microservices", "backend", "distributed"],
        exclude_keywords=["intern", "internship", "principal", "staff", "director", "manager", "head of"],
        locations=["Bengaluru", "Bangalore", "Gurugram", "Gurgaon", "Delhi", "Noida", "Hyderabad", "Pune", "Remote", "India"],
        remote_ok=True,
        email_enabled=True,
        email_to=None,
    )


class MatchResult(NamedTuple):
    """Unpacks as ``(matched, score, reasons, years_required)``."""

    matched: bool
    score: int
    reasons: List[str]
    years_required: Optional[int] = None


@dataclass
class DigestItem:
    """One job line in the email digest."""

    company: str
    title: str
    url: Optional[str] = None
    location: Optional[str] = None
    score: int = 0
    reasons: List[str] = field(default_factory=list)
    posted_at: Optional[str] = None
    job_id: Optional[str] = None


class FetchError(Exception):
    """A career site could not be read. The message is shown in the tracker, so keep it human."""
