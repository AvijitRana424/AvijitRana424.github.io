"""Decide whether a posting fits the search criteria, and explain why.

``score(posting, criteria)`` returns ``MatchResult(matched, score, reasons, years_required)``.

Scoring (0-100, match threshold 50):
    title      strong 55 · via engineer≈developer 47 · partial 35-45 · level token (II/III) +5
    level      desired +12 · other accepted +8 · unspecified +4 · lead under "senior" -4 · not accepted → reject
    years      in range +10 · above/below range -6/-4 · min required > max_years + 1 → reject
    location   place +10 · remote +8 · unknown -5 · elsewhere → reject
    keywords   +4 per include keyword found in title/description (cap +20)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .models import Criteria, MatchResult, Posting
from .text import looks_remote

THRESHOLD = 50

# ---------------------------------------------------------------------------
#  Title normalisation
# ---------------------------------------------------------------------------

_PHRASES: Sequence[Tuple[str, str]] = (
    # "Software (Development) Engineer in Test", "Engineer in Test", "Developer in Test" → SDET (a QA role)
    (r"\b(?:software )?(?:development )?(?:engineer|developer)s? in test(?:ing)?\b", " sdet "),
    (r"\bsoftware dev(?:elopment)? engineer(s)?\b", " software engineer "),
    (r"\bmembers? of (?:the )?technical staff\b", " mts "),
    (r"\bquality assurance\b", " qa "),
    (r"\bpre[\s-]?sales\b", " presales "),
    (r"\bhead[\s-]?(?:office|quarters)\b", " hq "),  # before "head of": "Head Office Systems" is not a head-of role
    (r"\bback[\s-]?end\b", " backend "),
    (r"\bfront[\s-]?end\b", " frontend "),
    (r"\bfull[\s-]?stack\b", " fullstack "),
    (r"\bnew grad(?:uate)?s?\b", " graduate "),
    (r"\bentry[\s-]level\b", " entry "),
    (r"\bmid[\s-]?(?:level|senior)\b", " mid "),
    (r"\bvice president\b", " vp "),
    (r"\bhead of\b", " head "),
    (r"\bdev[\s-]?ops\b", " devops "),
    (r"\bmachine learning\b", " ml "),
)

_SPLIT_LEVEL = re.compile(r"\b(sde|swe|sdet|sse|mts|smts|engineer|developer)[-_]?(\d{1,2}|iv|iii|ii|i)\b")

_TOKEN_MAP: Dict[str, Sequence[str]] = {
    "sr": ("senior",), "snr": ("senior",), "sen": ("senior",),
    "jr": ("junior",), "jnr": ("junior",),
    "dev": ("developer",), "devs": ("developer",), "developers": ("developer",),
    "engineers": ("engineer",), "eng": ("engineer",), "engg": ("engineer",), "engr": ("engineer",),
    "mgr": ("manager",), "mngr": ("manager",), "managers": ("manager",),
    "swe": ("software", "engineer"), "sde": ("software", "engineer"),
    "sse": ("senior", "software", "engineer"),
    "programmers": ("programmer",), "architects": ("architect",),
    "internship": ("intern",), "interns": ("intern",),
    "i": ("L1",), "1": ("L1",), "ii": ("L2",), "2": ("L2",), "iii": ("L3",), "3": ("L3",),
    "iv": ("L4",), "4": ("L4",),
}

#: "Member of Technical Staff" ladder (Oracle, Salesforce, Adobe, VMware, Nutanix, PayPal …) — software
#: engineer titles. Used when *matching*; exclusions see only the seniority word (``_MTS_EXCLUSION``), so
#: an exclude keyword "staff" does not drop "Member of Technical Staff" but "principal" still drops PMTS.
_MTS_ROLE: Dict[str, Sequence[str]] = {
    "mts": ("software", "engineer"),
    "amts": ("associate", "software", "engineer"),
    "smts": ("senior", "software", "engineer"),
    "lmts": ("lead", "software", "engineer"),
    "pmts": ("principal", "software", "engineer"),
    "cmts": ("principal", "software", "engineer"),  # consulting MTS sits at principal level
}
_MTS_EXCLUSION: Dict[str, Sequence[str]] = {
    "amts": ("associate", "mts"), "smts": ("senior", "mts"), "lmts": ("lead", "mts"),
    "pmts": ("principal", "mts"), "cmts": ("principal", "mts"),
}

#: words that turn an engineering title into a non-software-engineering function (support, QA, sales …).
#: A title carrying one is not a match for a target role unless that role names the function itself
#: ("QA Engineer", "Solutions Engineer", "SDET").
FUNCTION_QUALIFIERS = {
    "support", "sales", "presales", "solutions", "solution", "customer", "success", "implementation", "field",
    "qa", "qe", "quality", "test", "testing", "tester", "sdet", "validation", "verification", "escalation",
}
#: words that may sit next to a qualifier in a trailing title part ("Software Engineer (QA Automation)")
_QUALIFIER_FILLER = {"engineering", "engineer", "automation", "team", "services", "service", "and", "or", "manual"}
_TITLE_PARTS = re.compile(r"\s[-–—|/]\s|[,:;|()\[\]]|\s[–—]|[–—]\s")

LEVEL_TOKENS = {"L1", "L2", "L3", "L4"}
SENIORITY_WORDS = {
    "senior", "junior", "lead", "staff", "principal", "associate", "entry", "mid", "intermediate",
    "graduate", "trainee", "intern", "apprentice", "fresher", "experienced",
}
STOPWORDS = {"of", "the", "and", "in", "for", "a", "an", "with", "to", "at", "on", "or", "we", "are", "hiring", "m", "f", "d", "w", "x"}
ROLE_NOUNS = {"engineer", "developer", "programmer", "architect", "scientist", "analyst", "designer", "manager",
              "administrator", "consultant", "specialist", "sdet", "mts", "sre", "devops", "tester"}
WEAK_EQUIV: Dict[str, Sequence[str]] = {
    "engineer": ("developer", "programmer"),
    "developer": ("engineer", "programmer"),
    "programmer": ("developer", "engineer"),
}


def _base_normalize(text: str) -> str:
    t = (text or "").lower()
    t = t.replace("&", " and ")
    t = re.sub(r"[‐-―−]", "-", t)  # unicode dashes
    for pattern, repl in _PHRASES:
        t = re.sub(pattern, repl, t)
    t = _SPLIT_LEVEL.sub(r"\1 \2", t)
    t = re.sub(r"[^a-z0-9+#]+", " ", t)
    return t


def normalize_title(title: str, *, expand_roles: bool = True) -> List[str]:
    """Lowercase, strip punctuation, expand synonyms (sr→senior, sde→software engineer, II→L2 …).

    ``expand_roles=False`` keeps "mts" as is (only its seniority word is added) — used for exclusions."""
    mts = _MTS_ROLE if expand_roles else _MTS_EXCLUSION
    out: List[str] = []
    for tok in _base_normalize(title).split():
        out.extend(mts.get(tok) or _TOKEN_MAP.get(tok, (tok,)))
    return out


def function_qualifiers(title: str) -> set:
    """Function words (support / QA / sales …) that describe the *role itself*, not the team.

    Counted in the title part that names the role ("Software Support Engineer", "Customer Engineer,
    Software") and in trailing parts made only of such words ("Software Engineer (QA)", "… - Test
    Automation"). Team names are ignored: "Software Engineer, Customer Data Platform" is fine."""
    parts = [p for p in _TITLE_PARTS.split((title or "").lower()) if p and p.strip()]
    found: set = set()
    role_part_seen = False
    for part in parts:
        toks = [t for t in normalize_title(part) if t not in STOPWORDS and t not in LEVEL_TOKENS]
        if not toks:
            continue
        quals = {t for t in toks if t in FUNCTION_QUALIFIERS}
        if not role_part_seen and any(t in ROLE_NOUNS for t in toks):
            role_part_seen = True
            found |= quals
        elif quals and all(t in FUNCTION_QUALIFIERS or t in _QUALIFIER_FILLER or t in SENIORITY_WORDS for t in toks):
            found |= quals
    return found


def _core(tokens: Iterable[str]) -> List[str]:
    seen: List[str] = []
    for t in tokens:
        if t in LEVEL_TOKENS or t in SENIORITY_WORDS or t in STOPWORDS:
            continue
        if t not in seen:
            seen.append(t)
    return seen


# ---------------------------------------------------------------------------
#  Title ↔ target role
# ---------------------------------------------------------------------------

@dataclass
class TitleMatch:
    role: str
    kind: str  # strong | weak | partial
    points: int
    specificity: int


def _match_role(title_tokens: List[str], role: str, qualifiers: Optional[set] = None) -> Optional[TitleMatch]:
    role_tokens = normalize_title(role)
    target = _core(role_tokens)
    if not target:
        return None
    if qualifiers and qualifiers - set(role_tokens):
        return None  # "Software Support Engineer" is not a "Software Engineer" (unless the role says so)
    title_core = set(_core(title_tokens))
    exact = [t for t in target if t in title_core]
    weak = [t for t in target if t not in title_core and any(w in title_core for w in WEAK_EQUIV.get(t, ()))]
    matched = len(exact) + len(weak)
    ratio = matched / len(target)
    heads = [t for t in target if t in ROLE_NOUNS]
    head_ok = not heads or heads[-1] in exact or heads[-1] in weak

    if ratio == 1.0 and head_ok:
        kind, points = ("strong", 55) if not weak else ("weak", 47)
    elif ratio >= 0.6 and head_ok and len(target) >= 3:
        kind, points = "partial", 35 + round(10 * ratio)
    else:
        return None

    title_set = set(title_tokens)
    specificity = len(target)
    role_levels = {t for t in role_tokens if t in LEVEL_TOKENS}
    if role_levels and role_levels & title_set:
        points += 5
        specificity += 1
    role_seniority = {t for t in role_tokens if t in SENIORITY_WORDS}
    if role_seniority and role_seniority <= title_set:
        specificity += 1  # "Senior Software Engineer" beats "Software Engineer" for a senior title
    return TitleMatch(role=role.strip(), kind=kind, points=points, specificity=specificity)


def title_match(title: str, roles: Sequence[str], *, ignore_function: bool = False) -> Optional[TitleMatch]:
    """Best target role for a title, or None. With no target roles every title passes (weakly)."""
    roles = [r for r in roles if r and r.strip()]
    if not roles:
        return TitleMatch(role="any role", kind="any", points=45, specificity=0)
    tokens = normalize_title(title)
    qualifiers = set() if ignore_function else function_qualifiers(title)
    best: Optional[TitleMatch] = None
    for role in roles:
        m = _match_role(tokens, role, qualifiers)
        if m and (best is None or (m.points, m.specificity) > (best.points, best.specificity)):
            best = m
    return best


def _exclusion_text(text: str) -> str:
    return " " + " ".join(normalize_title(text, expand_roles=False)) + " "


def excluded_by(title: str, exclude_keywords: Sequence[str]) -> Optional[str]:
    """First exclude keyword found in the title, compared as whole normalised words/phrases.

    Both sides go through the same phrase normalisation, so "Member of Technical Staff" (→ mts) is not
    caught by "staff", "Internship" is caught by "intern" and "Head Office" is not "head of"."""
    norm = _exclusion_text(title)
    for kw in exclude_keywords:
        kw_clean = kw.strip()
        if not kw_clean:
            continue
        variant = _exclusion_text(kw_clean)
        if variant.strip() and variant in norm:
            return kw_clean
    return None


# ---------------------------------------------------------------------------
#  Seniority
# ---------------------------------------------------------------------------

_LEAD = {"staff", "principal", "lead", "architect", "manager", "head", "director", "vp", "chief", "distinguished", "fellow", "cto"}
_SENIOR = {"senior", "L3", "L4", "experienced"}
_ENTRY_STRONG = {"intern", "trainee", "graduate", "junior", "apprentice", "fresher", "student", "entry"}
_MID = {"L2", "intermediate", "mid"}
_ENTRY_WEAK = {"associate", "L1"}

ACCEPTED_LEVELS: Dict[str, set] = {
    "any": {"entry", "mid", "senior", "lead", "unspecified"},
    "entry": {"entry", "unspecified"},
    "mid": {"mid", "senior", "unspecified"},
    "senior": {"senior", "mid", "lead", "unspecified"},
    "lead": {"lead", "senior", "unspecified"},
}


def detect_seniority(title: str) -> str:
    toks = set(normalize_title(title))
    if toks & _LEAD:
        return "lead"
    if toks & _SENIOR:
        return "senior"
    if toks & _ENTRY_STRONG:
        return "entry"
    if toks & _MID:
        return "mid"
    if toks & _ENTRY_WEAK:
        return "entry"
    return "unspecified"


# ---------------------------------------------------------------------------
#  Years of experience
# ---------------------------------------------------------------------------

_WORD_NUM = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15,
}
_NUM = r"(\d{1,2}|" + "|".join(_WORD_NUM) + r")"
_YRS = r"(?:years?|yrs?)"
_YEAR_PATTERNS = (
    # 2-5 years, 2 to 5 yrs
    re.compile(r"(?<![\d.])" + _NUM + r"\s*(?:-|to)\s*" + _NUM + r"\s*\+?\s*" + _YRS + r"\b"),
    # minimum of 4 years, at least 5 yrs, more than 3 years
    re.compile(r"\b(?:minimum|min\.?|at least|atleast|more than|over|upwards of)\s*(?:of\s*)?" + _NUM + r"\s*\+?\s*" + _YRS + r"\b"),
    # 3+ years, 5 + yrs, 5 years+
    re.compile(r"(?<![\d.])" + _NUM + r"\s*\+\s*" + _YRS + r"\b"),
    re.compile(r"(?<![\d.])" + _NUM + r"\s*" + _YRS + r"\s*\+"),
    # 3 or more years
    re.compile(r"(?<![\d.])" + _NUM + r"\s*(?:or more|or above|and above)\s*" + _YRS + r"\b"),
    # 4 years of (relevant) experience
    re.compile(r"(?<![\d.])" + _NUM + r"\s*" + _YRS + r"\b"),
)
_CONTEXT = re.compile(
    r"experienc|\bexp\b|background|track record|hands[- ]on|industry|professional|\bwork(?:ing)?\b|"
    r"\b(?:in|of|with|as|building|leading|managing|designing|developing|writing|shipping|delivering)\b"
)
_NOT_EXPERIENCE = re.compile(r"^\W{0,3}(old|ago|of age|anniversary|history|warranty|runway|vesting|cliff|in business|of operation)\b")
_PREF_SECTION = re.compile(r"(preferred|nice[- ]to[- ]haves?|bonus(?: points)?|desired|pluses|good to have|ideal(?:ly)?)\b[^\n.]{0,40}(?:\n|:)")
_REQ_SECTION = re.compile(r"(minimum|basic|required|requirements|must[- ]haves?|what you.{0,3}ll need|who you are|you have|you bring|qualifications)\b[^\n.]{0,40}(?:\n|:)")
_TIME_SPAN_BEFORE = re.compile(r"\b(past|last|next|within|every|per|each|first|over the|for the|in the|since|after|during)\s*$")
_PREF_BEFORE = re.compile(r"prefer|nice to have|bonus|ideally|desirable|a plus")
_PREF_AFTER = re.compile(r"\b(preferred|is a plus|a plus|nice to have|desirable|is a bonus|would be great)\W*$")


def _num(s: str) -> int:
    return _WORD_NUM[s] if s in _WORD_NUM else int(s)


def _is_preferred(t: str, start: int, end: int) -> bool:
    before = t[:start]
    pref = max((m.end() for m in _PREF_SECTION.finditer(before)), default=-1)
    req = max((m.end() for m in _REQ_SECTION.finditer(before)), default=-1)
    if pref != -1 and pref >= req:  # "Preferred qualifications:" also matches the generic heading regex
        return True
    line_start = max(t.rfind("\n", 0, start), t.rfind(". ", 0, start)) + 1
    if _PREF_BEFORE.search(t[line_start:start]):
        return True
    stop = re.search(r"\.(?:\s|$)|\n|;", t[end:])
    return bool(_PREF_AFTER.search(t[end:end + stop.start()] if stop else t[end:]))


def parse_years(text: str) -> Optional[Tuple[int, Optional[int]]]:
    """Required years of experience from a description: (min, max or None).

    The strongest *required* mention wins ("10+ years … ; 5+ years with Kafka" → 10); mentions under a
    "Preferred qualifications" heading or phrased as "… preferred" only count when nothing else does."""
    if not text:
        return None
    t = re.sub(r"[‐-―−]", "-", text.lower())
    required: List[Tuple[int, Optional[int]]] = []
    preferred: List[Tuple[int, Optional[int]]] = []
    taken: List[Tuple[int, int]] = []
    for index, pattern in enumerate(_YEAR_PATTERNS):
        strong = index < len(_YEAR_PATTERNS) - 1  # ranges, "+", "at least" … are unambiguous
        for m in pattern.finditer(t):
            start, end = m.span()
            if any(s <= start < e or s < end <= e for s, e in taken):
                continue
            if _NOT_EXPERIENCE.search(t[end:end + 24]):
                continue
            if index != 1 and _TIME_SPAN_BEFORE.search(t[max(0, start - 20):start]):
                continue  # "over the past 5 years we grew …"
            if not strong and not (_CONTEXT.search(t[end:end + 60]) or re.search(r"experienc", t[max(0, start - 45):start])):
                continue
            nums = [_num(g) for g in m.groups() if g]
            lo = nums[0]
            hi = nums[1] if len(nums) > 1 else None
            if hi is not None and hi < lo:
                lo, hi = hi, lo
            if lo > 20 or (lo == 0 and hi is None) or (hi is not None and hi > 30):
                continue
            taken.append((start, end))
            (preferred if _is_preferred(t, start, end) else required).append((lo, hi))
    pool = required or preferred
    if not pool:
        return None
    return max(pool, key=lambda r: (r[0], r[1] or 0))


# ---------------------------------------------------------------------------
#  Locations
# ---------------------------------------------------------------------------

_LOCATION_ALIASES = (
    (r"\bbangalore\b", "bengaluru"), (r"\bbengaluru urban\b", "bengaluru"),
    (r"\bgurgaon\b", "gurugram"), (r"\bnew delhi\b", "delhi"), (r"\bdelhi ncr\b", "delhi"),
    (r"\bbombay\b", "mumbai"), (r"\bnavi mumbai\b", "mumbai"), (r"\bmadras\b", "chennai"),
    (r"\bcalcutta\b", "kolkata"), (r"\btrivandrum\b", "thiruvananthapuram"), (r"\bmysore\b", "mysuru"),
    (r"\bcochin\b", "kochi"), (r"\bpoona\b", "pune"), (r"\bgreater noida\b", "noida"),
)
_REMOTE_TERMS = {"remote", "anywhere", "wfh", "work from home", "worldwide", "fully remote"}
# words that may sit next to "Remote" without naming a place ("Remote - Worldwide", "Remote (APAC timezone)")
_GENERIC_LOCATION_WORDS = {
    "remote", "anywhere", "worldwide", "global", "globally", "fully", "work", "live", "from", "home", "wfh", "flexible",
    "distributed", "hybrid", "virtual", "telecommute", "any", "location", "locations", "multiple", "various",
    "apac", "asia", "pacific", "asia pacific", "timezone", "timezones", "time", "zone", "zones", "tz", "friendly",
    "first", "based", "only", "in", "the", "or", "and", "of", "within", "across", "office", "optional", "hq",
    "n", "a", "na", "tbd", "other", "others", "more", "all", "team", "role",
}


def canonical_location(text: str) -> str:
    t = " " + re.sub(r"[^a-z0-9]+", " ", (text or "").lower()) + " "
    for pattern, repl in _LOCATION_ALIASES:
        t = re.sub(pattern, repl, t)
    return re.sub(r"\s+", " ", t)


_N_LOCATIONS = re.compile(r"^\s*\d+\s+locations?\s*$", re.I)


def _location_verdict(posting: Posting, criteria: Criteria) -> Tuple[str, Optional[str], int]:
    """('ok' | 'unknown' | 'reject', reason, points)."""
    terms = [t.strip() for t in criteria.locations if t and t.strip()]
    raw = posting.all_locations_text()
    is_remote = posting.remote is True or looks_remote(raw)
    if not terms:
        return "ok", ("🌐 remote" if is_remote else None), 0
    if posting.in_region and all(_N_LOCATIONS.match(part) for part in raw.split(" | ") if part.strip()):
        # "3 Locations" from a search already filtered to the criteria locations
        return "ok", "📍 several locations", 6
    remote_terms = [t for t in terms if t.lower() in _REMOTE_TERMS]
    place_terms = [t for t in terms if t.lower() not in _REMOTE_TERMS]
    remote_allowed = criteria.remote_ok or bool(remote_terms)
    if not raw.strip():
        if is_remote and remote_allowed:
            return "ok", "🌐 remote", 8
        return "unknown", "📍 location unknown", -5
    text = canonical_location(raw)
    for term in place_terms:
        canon = canonical_location(term).strip()
        if canon and f" {canon} " in text:
            return "ok", f"📍 {term}", 10
    if is_remote and remote_allowed:
        # "Remote (US)", "Remote - Canada", "Radomlje, Slovenia" + remote flag → remote, but only from there
        named_places = [w for w in re.sub(r"\d+", " ", text).split() if w not in _GENERIC_LOCATION_WORDS]
        if named_places and place_terms:
            return "reject", "🌐 remote (region-locked)", 0
        return "ok", "🌐 remote", 8
    shown = (posting.location or raw).strip()
    if len(shown) > 40:
        shown = shown[:39].rstrip() + "…"
    return "reject", f"📍 {shown} ✗", 0


# ---------------------------------------------------------------------------
#  Keywords
# ---------------------------------------------------------------------------

def _keyword_regex(kw: str) -> re.Pattern:
    return re.compile(r"(?<![a-z0-9])" + re.escape(kw.lower()) + r"(?![a-z0-9])")


def keywords_found(text: str, keywords: Sequence[str]) -> List[str]:
    low = (text or "").lower()
    hits = []
    for kw in keywords:
        k = kw.strip()
        if k and _keyword_regex(k).search(low) and k.lower() not in (h.lower() for h in hits):
            hits.append(k)
    return hits


# ---------------------------------------------------------------------------
#  Public API
# ---------------------------------------------------------------------------

def _years_label(lo: int, hi: Optional[int]) -> str:
    return f"{lo}–{hi} yrs" if hi and hi != lo else f"{lo}+ yrs"


def score(posting: Posting, criteria: Criteria) -> MatchResult:
    title = posting.title or ""

    ex = excluded_by(title, criteria.exclude_keywords)
    if ex:
        return MatchResult(False, 0, [f"excluded: {ex}"], None)

    tm = title_match(title, criteria.target_roles)
    if tm is None:
        quals = function_qualifiers(title)
        if quals and title_match(title, criteria.target_roles, ignore_function=True):
            return MatchResult(False, 0, [f"title: {'/'.join(sorted(quals))} role, not a target"], None)
        return MatchResult(False, 0, ["title: no target role"], None)

    reasons: List[str] = []
    points = tm.points
    if tm.kind == "partial":
        reasons.append(f"title ~ {tm.role} (partial)")
    elif tm.kind != "any":
        reasons.append(f"title ≈ {tm.role}")

    # seniority
    level = detect_seniority(title)
    wanted = criteria.experience_level if criteria.experience_level in ACCEPTED_LEVELS else "any"
    if level not in ACCEPTED_LEVELS[wanted]:
        return MatchResult(False, 0, reasons + [f"level: {level} ✗"], None)
    if level == "unspecified":
        points += 4
    elif wanted == "senior" and level == "lead":
        points -= 4
        reasons.append("level: lead (above target)")
    else:
        points += 12 if level == wanted else 8
        reasons.append(f"level: {level}")

    # years of experience
    years = parse_years(posting.description_text)
    years_required: Optional[int] = years[0] if years else None
    if years:
        lo, hi = years
        label = _years_label(lo, hi)
        max_y, min_y = criteria.max_years, criteria.min_years
        if max_y is not None and lo > max_y + 1:
            return MatchResult(False, 0, reasons + [f"needs {label}"], lo)
        if max_y is not None and lo > max_y:
            points -= 6
            reasons.append(f"{label} (above range)")
        elif min_y is not None and (hi if hi is not None else lo) < min_y:
            points -= 4
            reasons.append(f"{label} (below range)")
        else:
            points += 10 if (min_y is not None or max_y is not None) else 4
            reasons.append(label)

    # location
    verdict, loc_reason, loc_points = _location_verdict(posting, criteria)
    if verdict == "reject":
        return MatchResult(False, 0, reasons + [loc_reason or "location ✗"], years_required)
    points += loc_points
    if loc_reason:
        reasons.append(loc_reason)

    # include keywords
    hits = keywords_found(f"{title}\n{posting.department or ''}\n{posting.description_text}", criteria.include_keywords)
    if hits:
        points += min(20, 4 * len(hits))
        reasons.append(" ".join(f"+{h.lower()}" for h in hits[:6]))

    final = max(0, min(100, int(round(points))))
    return MatchResult(final >= THRESHOLD, final, reasons, years_required)


def title_prefilter(posting: Posting, criteria: Criteria) -> bool:
    """Cheap check used before fetching a posting's full details: title, level and — when the listing
    already names a location — location. Postings failing it cannot match, so they are not enriched."""
    if excluded_by(posting.title, criteria.exclude_keywords):
        return False
    if title_match(posting.title, criteria.target_roles) is None:
        return False
    wanted = criteria.experience_level if criteria.experience_level in ACCEPTED_LEVELS else "any"
    if detect_seniority(posting.title) not in ACCEPTED_LEVELS[wanted]:
        return False
    if posting.locations:
        return _location_verdict(posting, criteria)[0] != "reject"
    return True
