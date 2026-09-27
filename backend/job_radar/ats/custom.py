"""Any other career page.

Order of attempts:
  1. the page embeds / links a known ATS (Greenhouse, Lever, Ashby, Workday …) → use that API instead
     and report it, so the company row is switched to the real ATS for future runs;
  2. schema.org ``JobPosting`` JSON-LD blocks;
  3. ``<a>`` links whose text looks like a job title (plus similarity to the target roles);
  4. one "View all jobs" link on the same site is followed and 1-3 are tried again;
  5. JavaScript-rendered page + Playwright installed → render in headless Chromium and retry
     (the browser's network requests are also checked for ATS API calls).
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import threading
from collections import Counter
from typing import Any, Iterable, List, Optional, Tuple
from urllib.parse import urljoin, urlsplit

import requests
from bs4 import BeautifulSoup

from ..models import FetchError, Posting, Postings
from ..net import BROWSER_UA, get_html
from ..text import (
    COUNTRY_NAMES, clean_ws, display_locations, employment_label, html_to_text, join_nonempty,
    looks_remote, normalize_url, parse_datetime,
)
from .detect import detect_known

COMPLETE_LISTING = False
MIN_LINKS_FOR_STATIC = 12
_browser_lock = threading.Lock()

# ---------------------------------------------------------------------------
#  1. Embedded ATS
# ---------------------------------------------------------------------------

_ATS_URL = re.compile(
    r"(?:https?:)?//[a-z0-9.-]*(?:greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|myworkdaysite\.com|"
    r"smartrecruiters\.com|recruitee\.com|workable\.com)[^\s\"'<>\\)]*",
    re.I,
)
_GH_TOKEN_JS = re.compile(r"""boardToken["']?\s*[:=]\s*["']([\w-]+)["']""")


def find_embedded_ats(html: str, extra_urls: Iterable[str] = ()) -> Optional[Tuple[str, str]]:
    """Most frequently referenced known ATS board in the page (or in URLs the browser requested)."""
    text = (html or "").replace("\\/", "/").replace("&amp;", "&")
    counts: Counter = Counter()
    order: List[Tuple[str, str]] = []
    candidates = [m.group(0) for m in _ATS_URL.finditer(text)] + [u for u in extra_urls if u]
    for raw in candidates:
        found = detect_known(raw.rstrip(".,;"))
        if found:
            counts[found] += 1
            if found not in order:
                order.append(found)
    m = _GH_TOKEN_JS.search(text)
    if m:
        found = ("greenhouse", m.group(1))
        counts[found] += 2
        if found not in order:
            order.append(found)
    if not counts:
        return None
    best = max(order, key=lambda k: (counts[k], -order.index(k)))
    return best


# ---------------------------------------------------------------------------
#  2. JSON-LD JobPosting
# ---------------------------------------------------------------------------

def _walk_ld(node: Any) -> Iterable[dict]:
    if isinstance(node, list):
        for item in node:
            yield from _walk_ld(item)
    elif isinstance(node, dict):
        types = node.get("@type")
        types = types if isinstance(types, list) else [types]
        if any(isinstance(t, str) and t.lower() == "jobposting" for t in types):
            yield node
        for key in ("@graph", "itemListElement", "item", "mainEntity", "hasPart"):
            if key in node:
                yield from _walk_ld(node[key])


def _ld_text(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        value = value.get("name") or value.get("@value") or value.get("value")
    if isinstance(value, list):
        value = ", ".join(str(_ld_text(v) or "") for v in value if v)
    return clean_ws(str(value)) if value not in (None, "") else None


def _ld_locations(job: dict) -> List[str]:
    locs = job.get("jobLocation")
    locs = locs if isinstance(locs, list) else [locs] if locs else []
    out: List[str] = []
    for loc in locs:
        if isinstance(loc, str):
            text = clean_ws(loc)
        elif isinstance(loc, dict):
            addr = loc.get("address") if isinstance(loc.get("address"), (dict, str)) else loc
            if isinstance(addr, str):
                text = clean_ws(addr)
            else:
                country = _ld_text(addr.get("addressCountry"))
                if country and len(country) == 2:
                    country = COUNTRY_NAMES.get(country.lower(), country)
                text = join_nonempty([_ld_text(addr.get("addressLocality")), _ld_text(addr.get("addressRegion")), country])
                text = text or _ld_text(loc.get("name")) or ""
        else:
            text = ""
        if text and text not in out:
            out.append(text)
    return out


def parse_json_ld(html: str, page_url: str) -> List[Posting]:
    soup = BeautifulSoup(html or "", "html.parser")
    out: List[Posting] = []
    seen = set()
    for script in soup.find_all("script", attrs={"type": re.compile(r"ld\+json", re.I)}):
        raw = script.string or script.get_text() or ""
        try:
            data = json.loads(raw)
        except ValueError:
            try:
                data = json.loads(re.sub(r",\s*([}\]])", r"\1", raw.strip()))
            except ValueError:
                continue
        for job in _walk_ld(data):
            title = _ld_text(job.get("title") or job.get("name"))
            if not title:
                continue
            url = job.get("url") or job.get("sameAs")
            url = urljoin(page_url, url) if isinstance(url, str) and url.strip() else None
            ident = job.get("identifier")
            ident_value = _ld_text(ident.get("value") if isinstance(ident, dict) else ident)
            if ident_value:
                external_id = f"ld:{ident_value}"
            elif url and normalize_url(url) != normalize_url(page_url):
                external_id = normalize_url(url)
            else:
                external_id = "ld:" + hashlib.sha1(f"{title}|{_ld_locations(job)}".encode()).hexdigest()[:16]
            if external_id in seen:
                continue
            seen.add(external_id)
            locations = _ld_locations(job)
            remote = None
            if str(job.get("jobLocationType") or "").upper() == "TELECOMMUTE" or looks_remote(*locations):
                remote = True
                req = _ld_text(job.get("applicantLocationRequirements"))
                locations = locations or [f"Remote ({req})" if req else "Remote"]
            emp = job.get("employmentType")
            if isinstance(emp, list):
                emp = emp[0] if emp else None
            out.append(
                Posting(
                    external_id=external_id,
                    title=title,
                    url=url or page_url,
                    location=display_locations(locations),
                    department=_ld_text(job.get("occupationalCategory") or job.get("industry")),
                    employment_type=employment_label(emp if isinstance(emp, str) else None),
                    remote=remote,
                    posted_at=parse_datetime(job.get("datePosted")),
                    description_text=html_to_text(job.get("description") if isinstance(job.get("description"), str) else ""),
                    locations=locations,
                )
            )
    return out


# ---------------------------------------------------------------------------
#  3. Job-looking links
# ---------------------------------------------------------------------------

_JOB_WORDS = re.compile(
    r"\b(engineer\w*|developer|programmer|architect|scientist|analyst|designer|manager|lead|specialist|consultant|"
    r"intern(ship)?|administrator|director|associate|officer|coordinator|executive|representative|recruiter|"
    r"sde|swe|sre|devops|qa|tester|accountant|writer|technician|head|strategist|researcher|advisor|counsel|"
    r"partner|owner|marketer|editor|support|operator|trainee|apprentice)\b",
    re.I,
)
_NAV_TEXT = re.compile(
    r"^(?:(?:view|see|browse|search|explore|find|all|our|open|current|latest)\b.*\b(?:jobs?|roles?|positions?|openings?|"
    r"opportunit\w*|vacanc\w*|careers?)|careers?|jobs?|apply( now)?|learn more|read more|life at .*|benefits|"
    r"students?|universit\w*|join us|sign in|log ?in|privacy.*|cookies?.*|terms.*|contact( us)?|about( us)?|"
    r"back|next|previous|home|blog|press|news|team|teams|culture|faq|help)$",
    re.I,
)
_JOBISH_HREF = re.compile(
    r"(job|career|position|opening|vacanc|posting|requisition|/o/|/p/|/j/|gh_jid|/apply|/role|/opportunit)"
    r"|\d{4,}|[0-9a-f]{8}-[0-9a-f]{4}-",
    re.I,
)
_LISTING_TEXT = re.compile(
    r"\b(view|see|browse|search|explore|all|open|current)\b.*\b(jobs|roles|positions|openings|opportunities|vacancies)\b"
    r"|^(open positions|job openings|openings|open roles|current openings|job search|all jobs)$",
    re.I,
)
_ROW_TAGS = {"li", "tr", "article", "section"}


def _guess_location(text: str, criteria) -> Optional[str]:
    """Pull a location out of the text around a job link — only when it clearly contains one."""
    if not text:
        return None
    from ..matcher import canonical_location  # local import: matcher → models only, avoids cycles

    pieces = [clean_ws(p) for p in re.split(r"[|•·\n\t]| - | – ", text) if clean_ws(p)]
    terms = [t for t in (getattr(criteria, "locations", None) or []) if t and t.strip()]
    countries = {c.lower() for c in COUNTRY_NAMES.values()}
    for piece in pieces:
        if len(piece) > 90:
            continue
        low = piece.lower()
        canon = canonical_location(piece)
        if looks_remote(piece):
            return piece
        if any(f" {canonical_location(t).strip()} " in canon for t in terms):
            return piece
        if any(re.search(rf"\b{re.escape(c)}\b", low) for c in countries):
            return piece
        if re.search(r"^[A-Z][\w .'-]+,\s*[A-Z]{2}\b", piece):  # "Austin, TX"
            return piece
    return None


def _row_text(a) -> str:
    node = a
    for _ in range(4):
        parent = node.parent
        if parent is None or parent.name in ("body", "html", "[document]"):
            break
        node = parent
        if node.name in _ROW_TAGS or (node.name == "div" and re.search(r"job|position|opening|posting|card|item|row|result", " ".join(node.get("class") or []), re.I)):
            break
    text = node.get_text("\n") if node is not a else ""
    title = a.get_text(" ")
    return clean_ws(text.replace(title, " ")) if text else ""


def parse_links(html: str, page_url: str, criteria=None) -> List[Posting]:
    from ..matcher import title_match

    soup = BeautifulSoup(html or "", "html.parser")
    for bad in soup(["script", "style", "noscript", "template", "nav", "footer"]):
        bad.decompose()
    roles = getattr(criteria, "target_roles", None) or []
    page_norm = normalize_url(page_url)
    out: List[Posting] = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        url = urljoin(page_url, href)
        if not url.startswith("http"):
            continue
        # prefer an explicit heading inside the link (cards often hold title + meta)
        heading = a.find(["h1", "h2", "h3", "h4", "h5", "strong"])
        text = clean_ws((heading or a).get_text(" "))
        text = re.sub(r"\s*(apply now|apply|learn more|→|›|»)\s*$", "", text, flags=re.I).strip()
        words = text.split()
        if not (2 <= len(words) <= 14) or not (6 <= len(text) <= 120) or _NAV_TEXT.match(text):
            continue
        norm = normalize_url(url)
        if norm == page_norm or norm in seen:
            continue
        jobish_href = bool(_JOBISH_HREF.search(urlsplit(url).path + "?" + urlsplit(url).query))
        role_hit = title_match(text, roles) if roles else None
        if not ((jobish_href and _JOB_WORDS.search(text)) or (role_hit and role_hit.kind != "any" and (jobish_href or _JOB_WORDS.search(text)))):
            continue
        seen.add(norm)
        around = _row_text(a)
        if heading is not None:
            around = clean_ws(around + "\n" + a.get_text("\n").replace(heading.get_text(" "), " "))
        location = _guess_location(around, criteria)
        out.append(
            Posting(
                external_id=norm,
                title=text,
                url=url,
                location=location,
                remote=True if location and looks_remote(location) else None,
                locations=[location] if location else [],
            )
        )
    return out


def _listing_links(html: str, page_url: str) -> List[str]:
    soup = BeautifulSoup(html or "", "html.parser")
    host = (urlsplit(page_url).hostname or "").lower()
    base = ".".join(host.split(".")[-2:])
    page_norm = normalize_url(page_url)
    out: List[str] = []
    for a in soup.find_all("a", href=True):
        text = clean_ws(a.get_text(" "))
        if not text or not _LISTING_TEXT.search(text):
            continue
        url = urljoin(page_url, a["href"].strip())
        link_host = (urlsplit(url).hostname or "").lower()
        if not url.startswith("http") or not link_host.endswith(base) or normalize_url(url) == page_norm:
            continue
        if url not in out:
            out.append(url)
    return out[:2]


_NEXT_TEXT = re.compile(r"^(next|next page|more jobs|load more|›|»|>|→)$", re.I)
MAX_PAGES = 15


def next_page_url(html: str, page_url: str) -> Optional[str]:
    """rel=next / "Next ›" pagination link on the same host, if any."""
    soup = BeautifulSoup(html or "", "html.parser")
    host = (urlsplit(page_url).hostname or "").lower()
    candidates = []
    for tag in soup.find_all(["link", "a"], href=True):
        rel = " ".join(tag.get("rel") or []).lower()
        label = clean_ws(tag.get_text(" ") or tag.get("aria-label") or "")
        if "next" in rel or _NEXT_TEXT.match(label) or (tag.get("aria-label") or "").lower().startswith("next"):
            candidates.append(urljoin(page_url, tag["href"].strip()))
    for url in candidates:
        if url.startswith("http") and (urlsplit(url).hostname or "").lower() == host and normalize_url(url) != normalize_url(page_url):
            return url
    return None


def _with_pages(first: List[Posting], html: str, page_url: str, session, criteria) -> List[Posting]:
    out = {p.external_id: p for p in first}
    seen_pages = {normalize_url(page_url)}
    url = next_page_url(html, page_url)
    while url and len(seen_pages) < MAX_PAGES and normalize_url(url) not in seen_pages:
        seen_pages.add(normalize_url(url))
        try:
            resp = get_html(session, url)
        except FetchError:
            break
        page = scrape_html(resp.text, resp.url or url, criteria)
        fresh = [p for p in page if p.external_id not in out]
        if not fresh:
            break
        for p in fresh:
            out[p.external_id] = p
        url = next_page_url(resp.text, resp.url or url)
    return list(out.values())


def looks_js_rendered(html: str) -> bool:
    soup = BeautifulSoup(html or "", "html.parser")
    anchors = len(soup.find_all("a", href=True))
    for bad in soup(["script", "style", "noscript", "template"]):
        bad.decompose()
    visible = len(clean_ws(soup.get_text(" ")))
    shell = bool(re.search(r'id=["\'](root|app|__next|__nuxt)["\']', html or "", re.I))
    return anchors < MIN_LINKS_FOR_STATIC or visible < 600 or (shell and anchors < 40)


# ---------------------------------------------------------------------------
#  5. Headless browser (optional)
# ---------------------------------------------------------------------------

def playwright_available() -> bool:
    try:
        return importlib.util.find_spec("playwright") is not None
    except (ImportError, ValueError):  # pragma: no cover - depends on the environment
        return False


def render_with_browser(url: str, timeout_ms: int = 30000) -> Tuple[str, str, List[str]]:  # pragma: no cover - needs chromium
    """Return (html, final_url, requested_urls) of a page rendered by headless Chromium."""
    from playwright.sync_api import sync_playwright

    requested: List[str] = []
    with _browser_lock, sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(user_agent=BROWSER_UA)
            page.on("request", lambda r: requested.append(r.url))
            try:
                page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            except Exception:
                page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_timeout(1500)
            html, final = page.content(), page.url
        finally:
            browser.close()
    return html, final, requested


# ---------------------------------------------------------------------------
#  Orchestration
# ---------------------------------------------------------------------------

def _via_ats(found: Tuple[str, str], session, criteria) -> Postings:
    from . import get_module  # local import: the registry imports this module

    ats, ident = found
    postings = get_module(ats).fetch(ident, session, criteria)
    complete = getattr(postings, "complete", getattr(get_module(ats), "COMPLETE_LISTING", True))
    return Postings(postings, complete=complete, detected=found)


def scrape_html(html: str, page_url: str, criteria=None) -> List[Posting]:
    postings = parse_json_ld(html, page_url)
    return postings if postings else parse_links(html, page_url, criteria)


def fetch(identifier: str, session, criteria=None, *, allow_browser: bool = True) -> Postings:
    url = identifier.strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    resp = get_html(session, url)
    html, final_url = resp.text, resp.url or url

    found = find_embedded_ats(html)
    if found:
        return _via_ats(found, session, criteria)

    postings = scrape_html(html, final_url, criteria)
    if postings:
        return Postings(_with_pages(postings, html, final_url, session, criteria), complete=False)

    for link in _listing_links(html, final_url):
        try:
            sub = get_html(session, link)
        except FetchError:
            continue
        found = find_embedded_ats(sub.text)
        if found:
            return _via_ats(found, session, criteria)
        postings = scrape_html(sub.text, sub.url or link, criteria)
        if postings:
            return Postings(_with_pages(postings, sub.text, sub.url or link, session, criteria), complete=False)

    js_page = looks_js_rendered(html)
    if allow_browser and playwright_available():
        try:
            rendered, final, requested = render_with_browser(final_url)
        except Exception as exc:  # pragma: no cover - browser failures
            raise FetchError(f"headless browser could not render the page: {type(exc).__name__}: {exc}") from exc
        found = find_embedded_ats(rendered, requested)
        if found:
            return _via_ats(found, session, criteria)
        postings = scrape_html(rendered, final, criteria)
        if postings:
            return Postings(postings, complete=False)
        raise FetchError("no job postings found, even after rendering the page in a headless browser — "
                         "set the company's ATS type/identifier if you know it")
    hint = ("set the company's ATS type (greenhouse / lever / workday …) if you know it, or enable browser "
            "rendering (repo variable ENABLE_BROWSER=true)")
    if js_page:
        raise FetchError(f"page looks JavaScript-rendered and no postings were found — {hint}")
    raise FetchError(f"no job postings found (no known ATS embed, JobPosting JSON-LD or job-like links) — "
                     f"if the list loads with JavaScript, {hint}")


def is_open(identifier: str, external_id: str, session) -> Optional[bool]:
    """Only a hard 404/410 on the posting URL counts as closed for scraped pages."""
    if not external_id.startswith("http"):
        return None
    try:
        resp = session.get(external_id, headers={"User-Agent": BROWSER_UA}, allow_redirects=True, stream=True)
        resp.close()
    except requests.exceptions.RequestException:
        return None
    return False if resp.status_code in (404, 410) else None
