"""Recruitee careers-site API — GET https://<company>.recruitee.com/api/offers/"""

from __future__ import annotations

from typing import Any, List, Optional

from ..models import FetchError, Posting
from ..net import get_json
from ..text import clean_ws, display_locations, employment_label, html_to_text, join_nonempty, looks_remote, parse_datetime

COMPLETE_LISTING = True


def parse(data: Any, identifier: str) -> List[Posting]:
    offers = data.get("offers") if isinstance(data, dict) else None
    if not isinstance(offers, list):
        raise FetchError("unexpected Recruitee response (no 'offers')")
    out: List[Posting] = []
    for o in offers:
        if not isinstance(o, dict) or not o.get("id") or not o.get("title"):
            continue
        if o.get("status") and o.get("status") != "published":
            continue
        locations: List[str] = []
        for loc in o.get("locations") or []:
            if isinstance(loc, dict):
                text = join_nonempty([loc.get("city") or loc.get("name"), loc.get("state"), loc.get("country")])
                if text and text not in locations:
                    locations.append(text)
        # "Brussels, Brussels, Belgium" → "Brussels, Belgium" (city == state is common)
        primary = join_nonempty((o.get("location") or "").split(",")) or join_nonempty([o.get("city"), o.get("country")])
        if primary and primary.lower() not in (l.lower() for l in locations):
            locations.insert(0, primary)
        remote: Optional[bool] = True if (o.get("remote") or looks_remote(primary)) else (False if o.get("on_site") else None)
        desc = "\n\n".join(t for t in (html_to_text(o.get("description")), html_to_text(o.get("requirements"))) if t)
        out.append(
            Posting(
                external_id=str(o["id"]),
                title=clean_ws(o["title"]),
                url=o.get("careers_url") or f"https://{identifier}.recruitee.com/o/{o.get('slug') or o['id']}",
                location=display_locations(locations),
                department=clean_ws(o.get("department")) or None,
                employment_type=employment_label(o.get("employment_type_code")),
                remote=remote,
                posted_at=parse_datetime(o.get("published_at") or o.get("created_at")),
                description_text=desc[:20000],
                locations=locations,
            )
        )
    return out


def fetch(identifier: str, session, criteria=None) -> List[Posting]:
    return parse(get_json(session, f"https://{identifier}.recruitee.com/api/offers/", what="Recruitee site"), identifier)
