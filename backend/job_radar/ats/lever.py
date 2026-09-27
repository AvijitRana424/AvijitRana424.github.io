"""Lever postings API — https://github.com/lever/postings-api"""

from __future__ import annotations

from typing import Any, List, Optional

from ..models import FetchError, Posting
from ..net import get_json
from ..text import clean_ws, country_name, display_locations, employment_label, html_to_text, looks_remote, parse_datetime

API_HOSTS = ("https://api.lever.co", "https://api.eu.lever.co")
COMPLETE_LISTING = True


def _description(p: dict) -> str:
    parts = [p.get("descriptionPlain") or html_to_text(p.get("description"))]
    for block in p.get("lists") or []:
        if not isinstance(block, dict):
            continue
        heading = clean_ws(block.get("text"))
        body = html_to_text(block.get("content"))
        parts.append(f"{heading}\n{body}" if heading else body)
    parts.append(p.get("additionalPlain") or html_to_text(p.get("additional")))
    return "\n\n".join(x.strip() for x in parts if x and x.strip())[:20000]


def parse(data: Any, identifier: str) -> List[Posting]:
    if isinstance(data, dict) and data.get("ok") is False:
        raise FetchError(f"Lever: {data.get('error') or 'board not found'}")
    if not isinstance(data, list):
        raise FetchError("unexpected Lever response (expected a list of postings)")
    out: List[Posting] = []
    for p in data:
        if not isinstance(p, dict) or not p.get("id") or not p.get("text"):
            continue
        cats = p.get("categories") or {}
        primary = clean_ws(cats.get("location"))
        all_locs = [clean_ws(x) for x in (cats.get("allLocations") or []) if x]
        locations = [primary] if primary else []
        locations += [x for x in all_locs if x and x not in locations]
        country = country_name(p.get("country"))
        if country and locations and not any(country.lower() in loc.lower() for loc in locations):
            locations.append(country)
        workplace = (p.get("workplaceType") or "").lower()
        remote: Optional[bool]
        if workplace == "remote":
            remote = True
        elif workplace in ("on-site", "onsite", "hybrid"):
            remote = False
        else:
            remote = True if looks_remote(primary) else None
        out.append(
            Posting(
                external_id=str(p["id"]),
                title=clean_ws(p["text"]),
                url=p.get("hostedUrl") or f"https://jobs.lever.co/{identifier}/{p['id']}",
                location=display_locations(locations),
                department=clean_ws(cats.get("team") or cats.get("department")) or None,
                employment_type=employment_label(cats.get("commitment")),
                remote=remote,
                posted_at=parse_datetime(p.get("createdAt")),
                description_text=_description(p),
                locations=locations,
            )
        )
    return out


def fetch(identifier: str, session, criteria=None) -> List[Posting]:
    last_error: Optional[FetchError] = None
    for host in API_HOSTS:
        try:
            data = get_json(session, f"{host}/v0/postings/{identifier}?mode=json", what="Lever board")
            return parse(data, identifier)
        except FetchError as exc:
            last_error = exc
            if "404" not in str(exc) and "not found" not in str(exc).lower():
                raise
    raise last_error or FetchError("Lever board not found")
