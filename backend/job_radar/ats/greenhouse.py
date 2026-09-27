"""Greenhouse job board API — https://developers.greenhouse.io/job-board.html"""

from __future__ import annotations

from typing import Any, List, Optional

from ..models import FetchError, Posting
from ..net import get_json
from ..text import clean_ws, display_locations, employment_label, html_to_text, looks_remote, parse_datetime

API_HOSTS = ("https://boards-api.greenhouse.io", "https://boards-api.eu.greenhouse.io")
COMPLETE_LISTING = True


def _metadata_value(meta: Any, *names: str) -> Optional[str]:
    if not isinstance(meta, list):
        return None
    for item in meta:
        if not isinstance(item, dict):
            continue
        label = str(item.get("name") or "").lower()
        if any(n in label for n in names):
            value = item.get("value")
            if isinstance(value, list):
                value = ", ".join(str(v) for v in value if v)
            if value not in (None, ""):
                return clean_ws(str(value))
    return None


def parse(data: Any, identifier: str) -> List[Posting]:
    jobs = (data or {}).get("jobs") if isinstance(data, dict) else None
    if not isinstance(jobs, list):
        raise FetchError("unexpected Greenhouse response (no 'jobs' list)")
    out: List[Posting] = []
    for j in jobs:
        if not isinstance(j, dict) or not j.get("id") or not j.get("title"):
            continue
        loc_name = clean_ws((j.get("location") or {}).get("name"))
        offices = [clean_ws(o.get("name")) for o in (j.get("offices") or []) if isinstance(o, dict) and o.get("name")]
        locations = [loc_name] if loc_name else []
        # offices are often region buckets ("Ireland Locations"); only add ones that look like places
        for office in offices:
            low = office.lower()
            if "location" in low or any(l.lower() in low or low in l.lower() for l in locations):
                continue  # "IN-Bengaluru" next to "Bengaluru" adds nothing
            locations.append(office)
        meta = j.get("metadata")
        workplace = _metadata_value(meta, "workplace", "remote", "location type")
        departments = [d.get("name") for d in (j.get("departments") or []) if isinstance(d, dict) and d.get("name")]
        department = clean_ws(departments[0]) if departments else None
        emp = _metadata_value(meta, "employment type", "job type", "commitment", "time type")
        out.append(
            Posting(
                external_id=str(j["id"]),
                title=clean_ws(j["title"]),
                url=j.get("absolute_url") or f"https://boards.greenhouse.io/{identifier}/jobs/{j['id']}",
                location=display_locations(locations) or loc_name or None,
                department=department,
                employment_type=employment_label(emp),
                remote=True if looks_remote(loc_name, workplace) else None,
                posted_at=parse_datetime(j.get("first_published") or j.get("updated_at")),
                description_text=html_to_text(j.get("content"), escaped=True),
                locations=locations,
            )
        )
    return out


def fetch(identifier: str, session, criteria=None) -> List[Posting]:
    last_error: Optional[FetchError] = None
    for host in API_HOSTS:
        url = f"{host}/v1/boards/{identifier}/jobs?content=true"
        try:
            return parse(get_json(session, url, what="Greenhouse board"), identifier)
        except FetchError as exc:
            last_error = exc
            if "404" not in str(exc):
                raise
    raise last_error or FetchError("Greenhouse board not found")
