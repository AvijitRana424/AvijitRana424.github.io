"""Workable careers-page API used by apply.workable.com/<account>."""

from __future__ import annotations

from typing import Any, List, Optional
from urllib.parse import quote

import requests

from ..models import FetchError, Posting, Postings
from ..net import get_json, post_json
from ..text import clean_ws, display_locations, employment_label, html_to_text, join_nonempty, parse_datetime

API_V3 = "https://apply.workable.com/api/v3/accounts"
API_V2 = "https://apply.workable.com/api/v2/accounts"
MAX_PAGES = 30
COMPLETE_LISTING = True


def _loc(loc: Any) -> Optional[str]:
    if not isinstance(loc, dict):
        return None
    return join_nonempty([loc.get("city"), loc.get("region"), loc.get("country")]) or None


def parse(data: Any, identifier: str) -> List[Posting]:
    rows = data.get("results") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise FetchError("unexpected Workable response (no 'results')")
    out: List[Posting] = []
    for r in rows:
        if not isinstance(r, dict) or not r.get("shortcode") or not r.get("title"):
            continue
        if r.get("state") and r.get("state") != "published":
            continue
        locations: List[str] = []
        for loc in [r.get("location"), *(r.get("locations") or [])]:
            text = _loc(loc)
            if text and text not in locations:
                locations.append(text)
        workplace = (r.get("workplace") or "").lower()
        remote: Optional[bool] = True if (r.get("remote") or workplace == "remote") else (False if workplace else None)
        if remote and locations:
            display = display_locations([f"Remote ({locations[0]})", *locations[1:]])
        else:
            display = display_locations(locations)
        dept = r.get("department")
        if isinstance(dept, list):
            dept = ", ".join(str(d) for d in dept if d)
        out.append(
            Posting(
                external_id=str(r["shortcode"]),
                title=clean_ws(r["title"]),
                url=f"https://apply.workable.com/{identifier}/j/{r['shortcode']}/",
                location=display,
                department=clean_ws(dept) or None,
                employment_type=employment_label(r.get("type")),
                remote=remote,
                posted_at=parse_datetime(r.get("published")),
                locations=locations,
            )
        )
    return out


def fetch(identifier: str, session, criteria=None) -> List[Posting]:
    url = f"{API_V3}/{quote(identifier)}/jobs"
    body: dict = {"query": "", "location": [], "department": [], "worktype": [], "remote": []}
    found: dict = {}
    token = None
    for _ in range(MAX_PAGES):
        data = post_json(session, url, body, what="Workable account")
        for p in parse(data, identifier):
            found.setdefault(p.external_id, p)
        token = data.get("nextPage") if isinstance(data, dict) else None
        if not token:
            break
        body = {**body, "token": token}
    # stopped at MAX_PAGES with pages left → not the complete listing: missing jobs are checked, not closed
    return Postings(found.values(), complete=not token)


def apply_detail(posting: Posting, data: dict) -> Posting:
    parts = [html_to_text(data.get(k)) for k in ("description", "requirements")]
    text = "\n\n".join(p for p in parts if p)
    if text:
        posting.description_text = text[:20000]
    return posting


def enrich(posting: Posting, identifier: str, session) -> Posting:
    data = get_json(session, f"{API_V2}/{quote(identifier)}/jobs/{posting.external_id}", what="Workable posting")
    return apply_detail(posting, data or {})


def is_open(identifier: str, external_id: str, session) -> Optional[bool]:
    try:
        resp = session.get(f"{API_V2}/{quote(identifier)}/jobs/{external_id}")
    except requests.exceptions.RequestException:
        return None
    if resp.status_code in (404, 410):
        return False
    return True if resp.status_code == 200 else None
