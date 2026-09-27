"""Workday candidate-experience ("cxs") JSON API used by *.myworkdayjobs.com career sites.

Identifier: "<host>/<tenant>/<site>", e.g. "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite".

Workday boards can hold thousands of postings, so instead of listing everything we run one full-text
search per target role and de-duplicate by ``externalPath``. Results are ranked worldwide and each term
is capped, so on big tenants most India postings would never be reached: the first search response's
location facets (``locationHierarchy1`` / ``locations`` / ``locationCountry`` …) are matched against the
criteria locations and every search is then restricted to them (``appliedFacets``). Without a matching
facet — or when the faceted search is rejected — the plain search is used.

The listing has no description, so the scanner calls :func:`enrich` for postings whose title already
matches (years / keywords / locations).
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

import requests

from ..models import FetchError, Posting, Postings
from ..net import get_json, post_json
from ..text import clean_ws, display_locations, employment_label, html_to_text, looks_remote, parse_datetime, parse_posted_ago

COMPLETE_LISTING = False  # search-based: a missing posting is confirmed with is_open() before closing it
PAGE_SIZE = 20
MAX_PER_TERM = 200  # plain (worldwide) search
MAX_PER_TERM_FACETED = 1000  # location-faceted search: the result set is already small
#: the listing has no descriptions, so every candidate needs a details request; ENRICH_LIMIT is multiplied
#: by this (stored postings are never re-enriched, so only the first scan of a board uses it all)
ENRICH_MULTIPLIER = 2

_log = logging.getLogger("job_radar")
_LOCATION_FACET = re.compile(r"location|countr|region|city|cities|site|office|state|province", re.I)


def split_identifier(identifier: str) -> Tuple[str, str, str]:
    parts = [p for p in (identifier or "").strip().strip("/").split("/") if p]
    if len(parts) < 3:
        raise FetchError(
            "Workday identifier must look like '<host>/<tenant>/<site>' "
            "(e.g. acme.wd5.myworkdayjobs.com/acme/External)"
        )
    host = parts[0].lower()
    host = re.sub(r"^https?:", "", host).strip("/")
    return host, parts[1], parts[2]


def api_base(identifier: str) -> str:
    host, tenant, site = split_identifier(identifier)
    return f"https://{host}/wday/cxs/{tenant}/{site}"


def public_url(identifier: str, external_path: str) -> str:
    host, tenant, site = split_identifier(identifier)
    if host.endswith("myworkdaysite.com"):
        return f"https://{host}/recruiting/{tenant}/{site}{external_path}"
    return f"https://{host}/{site}{external_path}"


_N_LOCATIONS = re.compile(r"^\d+\s+locations?$", re.I)


def parse_listing(data: Any, identifier: str) -> List[Posting]:
    rows = data.get("jobPostings") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise FetchError("unexpected Workday response (no 'jobPostings')")
    out: List[Posting] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        path = r.get("externalPath")
        title = clean_ws(r.get("title"))
        if not path or not title:
            continue
        loc_text = clean_ws(r.get("locationsText"))
        locations = [] if (not loc_text or _N_LOCATIONS.match(loc_text)) else [loc_text]
        out.append(
            Posting(
                external_id=path,
                title=title,
                url=public_url(identifier, path),
                location=loc_text or None,
                remote=True if looks_remote(loc_text, r.get("remoteType")) else None,
                posted_at=parse_posted_ago(r.get("postedOn")),
                locations=locations,
            )
        )
    return out


def search_terms(criteria) -> List[str]:
    """One search per distinct target role ("SDE 2" and "SDE II" normalise to the same search)."""
    from ..matcher import normalize_title

    roles: Iterable[str] = getattr(criteria, "target_roles", None) or []
    terms: List[str] = []
    seen = set()
    for role in roles:
        term = clean_ws(role)
        key = " ".join(normalize_title(term))
        if term and key not in seen:
            seen.add(key)
            terms.append(term)
    return terms or [""]


# ---------------------------------------------------------------------------
#  Location facets
# ---------------------------------------------------------------------------

def _facet_groups(facets: Any) -> Iterator[Tuple[str, str, List[dict]]]:
    """(facetParameter, descriptor, values) for every leaf facet, including nested ones
    (``locationMainGroup`` → ``locationHierarchy1`` / ``locations``)."""
    if not isinstance(facets, list):
        return
    for f in facets:
        if not isinstance(f, dict):
            continue
        values = f.get("values")
        if not isinstance(values, list):
            continue
        nested = [v for v in values if isinstance(v, dict) and isinstance(v.get("values"), list)]
        if nested:
            yield from _facet_groups(nested)
        param = f.get("facetParameter")
        leaf = [v for v in values if isinstance(v, dict) and v.get("id") and not isinstance(v.get("values"), list)]
        if param and leaf:
            yield str(param), str(f.get("descriptor") or ""), leaf


def _place_terms(criteria) -> List[str]:
    from ..matcher import _REMOTE_TERMS, canonical_location

    out: List[str] = []
    for loc in getattr(criteria, "locations", None) or []:
        loc = (loc or "").strip()
        if not loc or loc.lower() in _REMOTE_TERMS:
            continue
        canon = canonical_location(loc).strip()
        if canon and canon not in out:
            out.append(canon)
    return out


def location_facet(data: Any, criteria) -> Optional[Dict[str, List[str]]]:
    """``appliedFacets`` restricting a search to the criteria locations, or None.

    Picks the one location facet whose matching values cover the most postings (facets AND together in
    Workday, so combining a country facet with a site facet would narrow the search, not widen it)."""
    from ..matcher import canonical_location

    terms = _place_terms(criteria)
    if not terms or not isinstance(data, dict):
        return None
    best: Optional[Tuple[int, int, str, List[str]]] = None
    for param, descriptor, values in _facet_groups(data.get("facets")):
        if not (_LOCATION_FACET.search(param) or _LOCATION_FACET.search(descriptor)):
            continue
        ids: List[str] = []
        count = 0
        for v in values:
            text = canonical_location(str(v.get("descriptor") or ""))
            if any(f" {t} " in text for t in terms):
                ids.append(str(v["id"]))
                try:
                    count += int(v.get("count") or 0)
                except (TypeError, ValueError):
                    pass
        if ids:
            key = (count, -len(ids))
            if best is None or key > (best[0], best[1]):
                best = (count, -len(ids), param, ids)
    return {best[2]: best[3]} if best else None


# ---------------------------------------------------------------------------
#  Search
# ---------------------------------------------------------------------------

def _search(session, base: str, identifier: str, term: str, facets: Dict[str, List[str]], cap: int,
            found: dict, first: Optional[Any] = None) -> None:
    offset, total = 0, None
    while offset < cap:
        if first is not None and offset == 0:
            data, first = first, None  # the caller already fetched page one
        else:
            body = {"appliedFacets": facets, "limit": PAGE_SIZE, "offset": offset, "searchText": term}
            data = post_json(session, f"{base}/jobs", body, what="Workday site")
        if total is None:  # Workday only reports the total on the first page
            total = int(data.get("total") or 0) if isinstance(data, dict) else 0
        page = parse_listing(data, identifier)
        for p in page:
            found.setdefault(p.external_id, p)
        offset += PAGE_SIZE
        if len(page) < PAGE_SIZE or (total and offset >= total):
            break


def fetch(identifier: str, session, criteria=None) -> List[Posting]:
    base = api_base(identifier)
    terms = search_terms(criteria)
    first_body = {"appliedFacets": {}, "limit": PAGE_SIZE, "offset": 0, "searchText": terms[0]}
    first = post_json(session, f"{base}/jobs", first_body, what="Workday site")
    facets = location_facet(first, criteria)
    if facets is None and terms[0] and _place_terms(criteria):
        # facet values only list places with hits for *this* search — ask the whole board once
        board = post_json(session, f"{base}/jobs", {**first_body, "searchText": ""}, what="Workday site")
        facets = location_facet(board, criteria)

    if facets:
        found: dict = {}
        try:
            for term in terms:
                _search(session, base, identifier, term, facets, MAX_PER_TERM_FACETED, found)
            for posting in found.values():
                posting.in_region = True  # every result is in one of the criteria locations
            postings = Postings(found.values(), complete=False)
            postings.facets = facets  # type: ignore[attr-defined]
            return postings
        except FetchError as exc:
            from ..net import BudgetExceeded

            if isinstance(exc, BudgetExceeded):
                raise
            _log.debug("Workday location facet %s rejected (%s) — falling back to the plain search", facets, exc)

    found = {}
    for i, term in enumerate(terms):
        _search(session, base, identifier, term, {}, MAX_PER_TERM, found, first if i == 0 else None)
    return Postings(found.values(), complete=False)


def _detail(identifier: str, external_path: str, session) -> Optional[dict]:
    data = get_json(session, f"{api_base(identifier)}{external_path}", what="Workday posting")
    info = data.get("jobPostingInfo") if isinstance(data, dict) else None
    return info if isinstance(info, dict) else None


def apply_detail(posting: Posting, info: dict) -> Posting:
    desc = html_to_text(info.get("jobDescription"))
    if desc:
        posting.description_text = desc
    locations: List[str] = []
    for loc in [info.get("location"), *(info.get("additionalLocations") or [])]:
        loc = clean_ws(loc) if isinstance(loc, str) else ""
        if loc and loc not in locations:
            locations.append(loc)
    country = (info.get("country") or {}).get("descriptor") if isinstance(info.get("country"), dict) else None
    if country and locations and not any(country.lower() in loc.lower() for loc in locations):
        locations.append(country)
    if locations:
        posting.locations = locations
        posting.location = display_locations(locations)
    if info.get("timeType"):
        posting.employment_type = employment_label(info.get("timeType"))
    remote_type = str(info.get("remoteType") or "")
    if looks_remote(remote_type, *locations):
        posting.remote = True
    start = parse_datetime(info.get("startDate"))
    if start:
        posting.posted_at = start
    return posting


def enrich(posting: Posting, identifier: str, session) -> Posting:
    info = _detail(identifier, posting.external_id, session)
    return apply_detail(posting, info) if info else posting


def is_open(identifier: str, external_id: str, session) -> Optional[bool]:
    """True/False when we can tell whether a posting is still live, None when unsure."""
    try:
        resp = session.get(f"{api_base(identifier)}{external_id}", headers={"Accept": "application/json"})
    except requests.exceptions.RequestException:
        return None
    if resp.status_code in (404, 410):
        return False
    if resp.status_code != 200:
        return None
    try:
        info = (resp.json() or {}).get("jobPostingInfo") or {}
    except ValueError:
        return None
    if info.get("posted") is False:
        return False
    return True if info else None
