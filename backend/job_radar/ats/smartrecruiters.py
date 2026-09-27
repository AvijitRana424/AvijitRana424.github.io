"""SmartRecruiters public Posting API — https://developers.smartrecruiters.com/docs/posting-api"""

from __future__ import annotations

from typing import Any, List, Optional
from urllib.parse import quote

import requests

from ..models import FetchError, Posting, Postings
from ..net import get_json
from ..text import clean_ws, country_name, employment_label, html_to_text, join_nonempty, looks_remote, parse_datetime

API = "https://api.smartrecruiters.com/v1/companies"
PAGE_SIZE = 100
MAX_FULL_LISTING = 1000  # bigger boards are searched per target role instead
MAX_PER_TERM = 400


def _location(loc: Any) -> Optional[str]:
    if not isinstance(loc, dict):
        return None
    full = clean_ws(loc.get("fullLocation"))
    parts = full.split(",") if full else [loc.get("city"), loc.get("region"), country_name(loc.get("country"))]
    # "Hyderabad, , India" → "Hyderabad, India";  "Radomlje, SLOVENIA, Slovenia" → "Radomlje, Slovenia"
    cleaned = [clean_ws(p) for p in parts if p and clean_ws(p)]
    cleaned = [p.title() if p.isupper() and len(p) > 3 else p for p in cleaned]
    return join_nonempty(cleaned) or None


def parse(data: Any, identifier: str) -> List[Posting]:
    rows = data.get("content") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise FetchError("unexpected SmartRecruiters response (no 'content')")
    out: List[Posting] = []
    for r in rows:
        if not isinstance(r, dict) or not r.get("id") or not r.get("name"):
            continue
        loc = r.get("location") or {}
        location = _location(loc)
        remote = True if (isinstance(loc, dict) and loc.get("remote")) or looks_remote(location) else None
        out.append(
            Posting(
                external_id=str(r["id"]),
                title=clean_ws(r["name"]),
                url=f"https://jobs.smartrecruiters.com/{identifier}/{r['id']}",
                location=location,
                department=clean_ws((r.get("department") or {}).get("label")) or None,
                employment_type=employment_label((r.get("typeOfEmployment") or {}).get("label")),
                remote=remote,
                posted_at=parse_datetime(r.get("releasedDate")),
                locations=[location] if location else [],
            )
        )
    return out


def _pages(identifier: str, session, query: str = "", cap: int = MAX_FULL_LISTING):
    offset, total = 0, None
    while offset < cap:
        q = f"&q={quote(query)}" if query else ""
        url = f"{API}/{quote(identifier)}/postings?limit={PAGE_SIZE}&offset={offset}{q}"
        data = get_json(session, url, what="SmartRecruiters company")
        if total is None:
            total = int(data.get("totalFound") or 0) if isinstance(data, dict) else 0
        page = parse(data, identifier)
        raw = len(data.get("content") or []) if isinstance(data, dict) else 0  # parse() may skip bad rows
        yield total, page
        offset += PAGE_SIZE
        if raw < PAGE_SIZE or (total and offset >= total):
            break


def fetch(identifier: str, session, criteria=None) -> List[Posting]:
    found: dict = {}
    total = 0
    for total, page in _pages(identifier, session):
        if total > MAX_FULL_LISTING:
            break  # too big to list in full — search per target role instead
        for p in page:
            found.setdefault(p.external_id, p)
    if total <= MAX_FULL_LISTING:
        return Postings(found.values(), complete=True)
    roles = [r for r in (getattr(criteria, "target_roles", None) or []) if r.strip()]
    for role in roles or [""]:
        for _t, page in _pages(identifier, session, query=role, cap=MAX_PER_TERM):
            for p in page:
                found.setdefault(p.external_id, p)
    return Postings(found.values(), complete=False)


def apply_detail(posting: Posting, data: dict) -> Posting:
    sections = ((data.get("jobAd") or {}).get("sections") or {}) if isinstance(data, dict) else {}
    parts = []
    for key in ("jobDescription", "qualifications", "additionalInformation"):
        sec = sections.get(key) or {}
        text = html_to_text(sec.get("text"))
        if text:
            title = clean_ws(sec.get("title"))
            parts.append(f"{title}\n{text}" if title else text)
    if parts:
        posting.description_text = "\n\n".join(parts)[:20000]
    if data.get("postingUrl"):
        posting.url = data["postingUrl"]
    return posting


def enrich(posting: Posting, identifier: str, session) -> Posting:
    data = get_json(session, f"{API}/{quote(identifier)}/postings/{posting.external_id}", what="SmartRecruiters posting")
    return apply_detail(posting, data or {})


def is_open(identifier: str, external_id: str, session) -> Optional[bool]:
    try:
        resp = session.get(f"{API}/{quote(identifier)}/postings/{external_id}")
    except requests.exceptions.RequestException:
        return None
    if resp.status_code in (404, 410):
        return False
    return True if resp.status_code == 200 else None
