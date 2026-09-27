"""Recognise which applicant-tracking system a career URL belongs to.

``detect(url)`` returns ``(ats_type, identifier)``; unknown URLs return ``("custom", url)``.

Identifiers:
    greenhouse       board token            (boards.greenhouse.io/<token>)
    lever            company slug           (jobs.lever.co/<company>)
    ashby            organisation slug      (jobs.ashbyhq.com/<org>)
    workday          "<host>/<tenant>/<site>" (acme.wd5.myworkdayjobs.com/acme/External)
    smartrecruiters  company identifier     (jobs.smartrecruiters.com/<company>)
    recruitee        subdomain              (<company>.recruitee.com)
    workable         account slug           (apply.workable.com/<account>)
"""

from __future__ import annotations

import re
from typing import Optional, Tuple
from urllib.parse import parse_qs, unquote, urlsplit

KNOWN_ATS = ("greenhouse", "lever", "ashby", "workday", "smartrecruiters", "recruitee", "workable")

_RESERVED = {
    "", "embed", "api", "v0", "v1", "v2", "v3", "static", "assets", "js", "css", "img", "images", "widget",
    "widgets", "jobs", "job", "careers", "apply", "search", "login", "signin", "signup", "privacy", "terms",
    "oneclick-ui", "sitemap.xml", "robots.txt", "favicon.ico", "j", "www", "app", "help", "blog", "about",
    "posting-api", "job-board", "wday", "cxs", "en-us", "_next",
}
_LOCALE = re.compile(r"^[a-z]{2}(?:[-_][a-z]{2,4})?$", re.I)

Detected = Tuple[str, Optional[str]]


def _ok(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    token = unquote(token).strip().strip("/")
    if not token or token.lower() in _RESERVED or len(token) > 120:
        return None
    if not re.match(r"^[\w.\- ]+$", token):
        return None
    return token


def _split(url: str):
    raw = (url or "").strip()
    if raw.startswith("//"):
        raw = "https:" + raw
    if not re.match(r"^[a-z][a-z0-9+.-]*://", raw, re.I):
        raw = "https://" + raw
    try:
        parts = urlsplit(raw)
    except ValueError:
        return None
    host = (parts.hostname or "").lower()
    segs = [s for s in parts.path.split("/") if s]
    return parts, host, segs, parse_qs(parts.query)


def _greenhouse(host: str, segs, query) -> Optional[str]:
    if not host.endswith("greenhouse.io"):
        return None
    for_param = (query.get("for") or [None])[0]
    if for_param:
        return _ok(for_param)
    # boards-api.greenhouse.io/v1/boards/<token>/jobs  |  api.greenhouse.io/v1/boards/<token>/embed/...
    if "boards" in segs:
        i = segs.index("boards")
        if i + 1 < len(segs):
            return _ok(segs[i + 1])
    if re.match(r"^(job-)?boards(\.eu)?\.greenhouse\.io$", host) and segs:
        return _ok(segs[0])
    return None


def _lever(host: str, segs) -> Optional[str]:
    if re.match(r"^jobs(\.eu)?\.lever\.co$", host) and segs:
        return _ok(segs[0])
    if re.match(r"^api(\.eu)?\.lever\.co$", host) and "postings" in segs:
        i = segs.index("postings")
        if i + 1 < len(segs):
            return _ok(segs[i + 1])
    return None


def _ashby(host: str, segs) -> Optional[str]:
    if host == "jobs.ashbyhq.com" and segs:
        return _ok(segs[0])
    if host == "api.ashbyhq.com" and "job-board" in segs:
        i = segs.index("job-board")
        if i + 1 < len(segs):
            return _ok(segs[i + 1])
    return None


def _ok_site(token: Optional[str]) -> Optional[str]:
    """Workday tenant/site names are free-form ("Careers", "External", "jobs" are all real sites)."""
    token = unquote(token or "").strip().strip("/")
    if not token or token.lower() in ("wday", "cxs", "job", "details") or not re.match(r"^[\w.\-]+$", token):
        return None
    return token


def _workday(host: str, segs) -> Optional[str]:
    # <tenant>.wd<N>.myworkdayjobs.com/[locale/]<site>/...   or  /wday/cxs/<tenant>/<site>/jobs
    m = re.match(r"^([\w-]+)\.(wd\d+)\.myworkdayjobs\.com$", host)
    m2 = re.match(r"^(wd\d+)\.myworkdaysite\.com$", host)
    if not (m or m2):
        return None
    if len(segs) >= 4 and segs[0] == "wday" and segs[1] == "cxs":
        tenant, site = segs[2], segs[3]
        return f"{host}/{tenant}/{site}" if _ok_site(tenant) and _ok_site(site) else None
    rest = list(segs)
    if rest and _LOCALE.match(rest[0]) and rest[0].lower() not in ("job", "jobs"):
        rest = rest[1:]
    if m:
        tenant = m.group(1)
        if rest and _ok_site(rest[0]):
            return f"{host}/{tenant}/{rest[0]}"
        return None
    # myworkdaysite.com/[locale/]recruiting/<tenant>/<site>
    if len(rest) >= 3 and rest[0].lower() == "recruiting" and _ok_site(rest[1]) and _ok_site(rest[2]):
        return f"{host}/{rest[1]}/{rest[2]}"
    return None


def _smartrecruiters(host: str, segs) -> Optional[str]:
    if not host.endswith("smartrecruiters.com"):
        return None
    if host == "api.smartrecruiters.com":
        if "companies" in segs:
            i = segs.index("companies")
            if i + 1 < len(segs):
                return _ok(segs[i + 1])
        return None
    if host in ("jobs.smartrecruiters.com", "careers.smartrecruiters.com"):
        if len(segs) >= 3 and segs[0] == "oneclick-ui" and segs[1] == "company":
            return _ok(segs[2])
        if segs and segs[0].lower() not in ("company", "ni"):
            return _ok(segs[0])
    return None


def _recruitee(host: str) -> Optional[str]:
    m = re.match(r"^([\w-]+)\.recruitee\.com$", host)
    if m and m.group(1) not in ("www", "app", "api", "careers", "support", "blog", "help", "d"):
        return _ok(m.group(1))
    return None


def _workable(host: str, segs) -> Optional[str]:
    if host == "apply.workable.com":
        if len(segs) >= 4 and segs[0] == "api" and "accounts" in segs:
            i = segs.index("accounts")
            return _ok(segs[i + 1]) if i + 1 < len(segs) else None
        if segs and segs[0] not in ("j", "api"):
            return _ok(segs[0])
        return None
    m = re.match(r"^([\w-]+)\.workable\.com$", host)
    if m and m.group(1) not in ("www", "apply", "jobs", "api", "help", "resources", "marketing", "careers", "app"):
        return _ok(m.group(1))
    return None


def detect(url: str) -> Detected:
    """Return (ats_type, identifier) for a career URL, or ("custom", url) when unknown."""
    split = _split(url)
    if not split:
        return "custom", url
    _parts, host, segs, query = split
    for ats, token in (
        ("greenhouse", _greenhouse(host, segs, query)),
        ("lever", _lever(host, segs)),
        ("ashby", _ashby(host, segs)),
        ("workday", _workday(host, segs)),
        ("smartrecruiters", _smartrecruiters(host, segs)),
        ("recruitee", _recruitee(host)),
        ("workable", _workable(host, segs)),
    ):
        if token:
            return ats, token
    return "custom", url


def detect_known(url: str) -> Optional[Tuple[str, str]]:
    """Like detect() but returns None for URLs that are not a known ATS."""
    ats, ident = detect(url)
    if ats == "custom" or not ident:
        return None
    return ats, ident


def identifier_for(ats_type: str, value: str) -> Optional[str]:
    """Normalise a user-entered identifier (a slug or a full URL) for a given ATS."""
    value = (value or "").strip()
    if not value:
        return None
    if ats_type == "workday" and not re.match(r"^https?://", value, re.I):
        # an already-normalised "<host>/<tenant>/<site>" identifier (not a URL with a locale)
        parts = [p for p in value.strip("/").split("/") if p]
        if len(parts) == 3 and "myworkday" in parts[0] and not _LOCALE.match(parts[1]) and parts[1] != "wday":
            return "/".join(parts)
    if "/" in value or "." in value:
        ats, ident = detect(value)
        if ats == ats_type and ident:
            return ident
        if ats_type in ("ashby", "smartrecruiters", "lever") and "/" not in value:
            return value  # dotted slugs are legal for these boards
        return None if "/" in value else value
    return value
