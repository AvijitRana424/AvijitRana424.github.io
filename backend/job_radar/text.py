"""Small text / date / URL helpers shared by the ATS parsers."""

from __future__ import annotations

import html as _html
import re
from datetime import datetime, timedelta, timezone
from typing import Iterable, List, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from bs4 import BeautifulSoup

_WS = re.compile(r"[ \t\r\f\v   ]+")
_BLANKS = re.compile(r"\n\s*\n+")

_BLOCK_TAGS = {
    "p", "div", "br", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
    "tr", "table", "section", "article", "header", "footer", "blockquote", "pre",
}


def clean_ws(text: Optional[str]) -> str:
    if not text:
        return ""
    text = _WS.sub(" ", text)
    return text.strip()


def html_to_text(markup: Optional[str], *, escaped: bool = False, limit: int = 20000) -> str:
    """Convert (optionally HTML-escaped) HTML to readable plain text with line breaks."""
    if not markup:
        return ""
    if escaped:
        markup = _html.unescape(markup)
    if "<" not in markup:
        text = _html.unescape(markup)
    else:
        soup = BeautifulSoup(markup, "html.parser")
        for bad in soup(["script", "style", "noscript", "template"]):
            bad.decompose()
        for tag in soup.find_all(_BLOCK_TAGS):
            tag.insert_before("\n")
            if tag.name == "li":
                tag.insert(0, "• ")
        text = soup.get_text()
    lines = [clean_ws(line) for line in text.splitlines()]
    text = "\n".join(lines)
    text = _BLANKS.sub("\n\n", text).strip()
    return text[:limit]


def join_nonempty(parts: Iterable[Optional[str]], sep: str = ", ") -> str:
    seen = []
    for p in parts:
        p = clean_ws(p) if p else ""
        if p and p.lower() not in (s.lower() for s in seen):
            seen.append(p)
    return sep.join(seen)


def display_locations(locations: List[str], max_items: int = 3) -> Optional[str]:
    """Short location text for the tracker ("Bengaluru, India; Remote +2 more")."""
    uniq: List[str] = []
    for loc in locations:
        loc = clean_ws(loc)
        if loc and loc.lower() not in (u.lower() for u in uniq):
            uniq.append(loc)
    if not uniq:
        return None
    shown = "; ".join(uniq[:max_items])
    if len(uniq) > max_items:
        shown += f" +{len(uniq) - max_items} more"
    return shown


# ---------------------------------------------------------------------------
#  Dates
# ---------------------------------------------------------------------------

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_datetime(value) -> Optional[datetime]:
    """Parse ISO-8601 strings, 'YYYY-MM-DD HH:MM:SS UTC', or epoch seconds/milliseconds."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        seconds = value / 1000.0 if value > 10_000_000_000 else float(value)
        try:
            return datetime.fromtimestamp(seconds, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    s = str(value).strip()
    if s.isdigit():
        return parse_datetime(int(s))
    s = re.sub(r"\s*UTC$", "+00:00", s)
    s = s.replace("Z", "+00:00") if s.endswith("Z") else s
    s = s.replace(" ", "T", 1) if re.match(r"^\d{4}-\d{2}-\d{2} \d", s) else s
    # Python < 3.11 fromisoformat only accepts 0, 3 or 6 fractional digits
    m = re.match(r"^(.*T\d{2}:\d{2}:\d{2})\.(\d+)(.*)$", s)
    if m:
        s = f"{m.group(1)}.{(m.group(2) + '000000')[:6]}{m.group(3)}"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        try:
            dt = datetime.strptime(s[:10], "%Y-%m-%d")
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


_POSTED_AGO = re.compile(r"(\d+)\+?\s*(day|days|week|weeks|month|months|hour|hours)", re.I)


def parse_posted_ago(text: Optional[str], now: Optional[datetime] = None) -> Optional[datetime]:
    """Workday-style 'Posted Today' / 'Posted Yesterday' / 'Posted 3 Days Ago' / 'Posted 30+ Days Ago'."""
    if not text:
        return None
    now = now or utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    t = text.strip().lower()
    if "today" in t or "just posted" in t:
        return today
    if "yesterday" in t:
        return today - timedelta(days=1)
    m = _POSTED_AGO.search(t)
    if not m:
        return None
    n = int(m.group(1))
    unit = m.group(2).lower()
    if unit.startswith("hour"):
        return today
    if unit.startswith("week"):
        n *= 7
    elif unit.startswith("month"):
        n *= 30
    return today - timedelta(days=n)


# ---------------------------------------------------------------------------
#  URLs
# ---------------------------------------------------------------------------

_TRACKING_PARAMS = re.compile(r"^(utm_.*|gh_src|source|src|ref|referrer|lever-source|lever-origin|trk|trackingid|fbclid|gclid)$", re.I)


def normalize_url(url: str) -> str:
    """Stable identity for a URL: lowercase host, no fragment, no tracking params, no trailing slash."""
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return url.strip()
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=False) if not _TRACKING_PARAMS.match(k)]
    path = parts.path or "/"
    if len(path) > 1:
        path = path.rstrip("/")
    return urlunsplit((parts.scheme.lower() or "https", parts.netloc.lower(), path, urlencode(query), ""))


# ---------------------------------------------------------------------------
#  Countries (ISO alpha-2 → name) for APIs that only return a code
# ---------------------------------------------------------------------------

COUNTRY_NAMES = {
    "in": "India", "us": "United States", "gb": "United Kingdom", "uk": "United Kingdom", "ca": "Canada",
    "de": "Germany", "fr": "France", "es": "Spain", "it": "Italy", "nl": "Netherlands", "ie": "Ireland",
    "pl": "Poland", "pt": "Portugal", "se": "Sweden", "dk": "Denmark", "no": "Norway", "fi": "Finland",
    "ch": "Switzerland", "at": "Austria", "be": "Belgium", "cz": "Czechia", "ro": "Romania", "gr": "Greece",
    "il": "Israel", "ae": "United Arab Emirates", "sa": "Saudi Arabia", "sg": "Singapore", "my": "Malaysia",
    "id": "Indonesia", "ph": "Philippines", "vn": "Vietnam", "th": "Thailand", "jp": "Japan", "kr": "South Korea",
    "cn": "China", "hk": "Hong Kong", "tw": "Taiwan", "au": "Australia", "nz": "New Zealand", "br": "Brazil",
    "mx": "Mexico", "ar": "Argentina", "co": "Colombia", "cl": "Chile", "za": "South Africa", "ng": "Nigeria",
    "ke": "Kenya", "eg": "Egypt", "tr": "Turkey", "ua": "Ukraine", "lk": "Sri Lanka", "bd": "Bangladesh", "pk": "Pakistan",
}


def country_name(code: Optional[str]) -> Optional[str]:
    if not code:
        return None
    c = code.strip()
    if len(c) == 2:
        return COUNTRY_NAMES.get(c.lower(), c.upper())
    return c


_EMPLOYMENT = {
    "fulltime": "Full-time", "full_time": "Full-time", "full-time": "Full-time", "full": "Full-time",
    "fulltime_permanent": "Full-time", "permanent": "Full-time", "fulltime_fixed_term": "Full-time (fixed term)",
    "parttime": "Part-time", "part_time": "Part-time", "part-time": "Part-time", "part": "Part-time",
    "parttime_permanent": "Part-time", "contract": "Contract", "contractor": "Contract", "temporary": "Temporary",
    "temp": "Temporary", "intern": "Internship", "internship": "Internship", "freelance": "Freelance",
}


def employment_label(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    key = re.sub(r"\s+", "", str(value)).lower()
    return _EMPLOYMENT.get(key, clean_ws(str(value)))


_REMOTE_WORDS = re.compile(r"\b(remote|anywhere|work from home|wfh|telecommute|fully remote)\b", re.I)


def looks_remote(*texts: Optional[str]) -> bool:
    return any(t and _REMOTE_WORDS.search(t) for t in texts)
