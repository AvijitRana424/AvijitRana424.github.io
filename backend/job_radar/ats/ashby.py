"""Ashby public job board API — https://developers.ashbyhq.com/docs/public-job-posting-api"""

from __future__ import annotations

from typing import Any, List, Optional
from urllib.parse import quote

from ..models import FetchError, Posting
from ..net import get_json
from ..text import clean_ws, display_locations, employment_label, html_to_text, looks_remote, parse_datetime

COMPLETE_LISTING = True


def _loc_text(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        value = value.get("location") or value.get("locationName")
    return clean_ws(value) if isinstance(value, str) and value.strip() else None


def parse(data: Any, identifier: str) -> List[Posting]:
    jobs = data.get("jobs") if isinstance(data, dict) else None
    if not isinstance(jobs, list):
        raise FetchError("unexpected Ashby response (no 'jobs' list)")
    out: List[Posting] = []
    for j in jobs:
        if not isinstance(j, dict) or not j.get("id") or not j.get("title"):
            continue
        if j.get("isListed") is False:
            continue
        primary = _loc_text(j.get("location") or j.get("locationName"))
        locations = [primary] if primary else []
        for sec in j.get("secondaryLocations") or []:
            loc = _loc_text(sec)
            if loc and loc not in locations:
                locations.append(loc)
        country = ((j.get("address") or {}).get("postalAddress") or {}).get("addressCountry")
        if country and locations and not any(str(country).lower() in loc.lower() for loc in locations):
            locations.append(str(country))
        workplace = (j.get("workplaceType") or "").lower()
        if j.get("isRemote") is True or workplace == "remote":
            remote: Optional[bool] = True
        elif workplace in ("onsite", "on-site", "hybrid"):
            remote = False
        else:
            remote = True if looks_remote(primary) else None
        department = clean_ws(j.get("department") or j.get("departmentName") or j.get("team")) or None
        out.append(
            Posting(
                external_id=str(j["id"]),
                title=clean_ws(j["title"]),
                url=j.get("jobUrl") or f"https://jobs.ashbyhq.com/{quote(identifier)}/{j['id']}",
                location=display_locations(locations),
                department=department,
                employment_type=employment_label(j.get("employmentType")),
                remote=remote,
                posted_at=parse_datetime(j.get("publishedAt") or j.get("publishedDate")),
                description_text=(j.get("descriptionPlain") or html_to_text(j.get("descriptionHtml")))[:20000],
                locations=locations,
            )
        )
    return out


def fetch(identifier: str, session, criteria=None) -> List[Posting]:
    url = f"https://api.ashbyhq.com/posting-api/job-board/{quote(identifier)}?includeCompensation=true"
    return parse(get_json(session, url, what="Ashby job board"), identifier)
