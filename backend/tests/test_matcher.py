import pytest

from job_radar import matcher
from job_radar.matcher import detect_seniority, normalize_title, parse_years, score, title_match
from job_radar.models import Criteria, Posting, default_criteria


def P(title, location="Bengaluru, India", description="", remote=None, **kw):
    return Posting(external_id=title, title=title, location=location, description_text=description, remote=remote,
                   locations=[location] if location else [], **kw)


def crit(**kw):
    c = default_criteria()
    for k, v in kw.items():
        setattr(c, k, v)
    return c


# ---------------------------------------------------------------------------
#  normalisation & synonyms
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "title, tokens",
    [
        ("Sr. Software Engineer", ["senior", "software", "engineer"]),
        ("Jr Developer", ["junior", "developer"]),
        ("SDE-2", ["software", "engineer", "L2"]),
        ("SDE2", ["software", "engineer", "L2"]),
        ("Software Development Engineer II", ["software", "engineer", "L2"]),
        ("SWE III", ["software", "engineer", "L3"]),
        ("Back-end Dev", ["backend", "developer"]),
        ("Full Stack Engineer", ["fullstack", "engineer"]),
        ("Engineer 1", ["engineer", "L1"]),
    ],
)
def test_normalize_title(title, tokens):
    assert normalize_title(title) == tokens


def test_sde_matches_software_engineer_titles():
    roles = ["SDE 2"]
    assert title_match("Software Development Engineer II", roles).kind == "strong"
    assert title_match("Software Engineer 2", roles).kind == "strong"
    assert title_match("SDE-II, Payments", roles).kind == "strong"
    # the level token earns a bonus over a bare "Software Engineer"
    assert title_match("Software Engineer II", roles).points > title_match("Software Engineer", roles).points


def test_engineer_developer_is_a_weaker_match():
    strong = title_match("Java Developer", ["Java Developer"])
    weak = title_match("Senior Java Engineer", ["Java Developer"])
    assert strong.kind == "strong" and weak.kind == "weak"
    assert weak.points < strong.points


def test_role_needs_all_significant_tokens():
    roles = ["Backend Engineer", "Java Developer"]
    assert title_match("Python Developer", roles) is None
    assert title_match("Backend Recruiter", roles) is None
    assert title_match("Software Engineer, Backend", roles).role == "Backend Engineer"
    # engineering manager is not an engineer title
    assert title_match("Engineering Manager", ["Software Engineer"]) is None


def test_partial_match_for_longer_roles():
    m = title_match("Distributed Systems Engineer", ["Senior Distributed Backend Systems Engineer"])
    assert m and m.kind == "partial"
    assert title_match("Backend Recruiter", ["Distributed Backend Systems Engineer"]) is None  # head noun missing


def test_most_specific_role_is_reported():
    roles = ["Software Engineer", "Senior Software Engineer"]
    assert title_match("Senior Software Engineer, Payments", roles).role == "Senior Software Engineer"
    assert title_match("Software Engineer, Payments", roles).role == "Software Engineer"


# ---------------------------------------------------------------------------
#  seniority
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "title, level",
    [
        ("Software Engineer Intern", "entry"),
        ("Graduate Software Engineer", "entry"),
        ("Associate Software Engineer", "entry"),
        ("Software Engineer I", "entry"),
        ("Software Engineer II", "mid"),
        ("Intermediate Backend Developer", "mid"),
        ("Senior Software Engineer", "senior"),
        ("Software Engineer III", "senior"),
        ("Staff Software Engineer", "lead"),
        ("Principal Engineer", "lead"),
        ("Engineering Manager", "lead"),
        ("Head of Engineering", "lead"),
        ("Associate Director, Engineering", "lead"),
        ("Software Engineer", "unspecified"),
    ],
)
def test_detect_seniority(title, level):
    assert detect_seniority(title) == level


def test_level_acceptance_per_experience_level():
    loose = dict(exclude_keywords=[], locations=[])
    mid = crit(experience_level="mid", **loose)
    assert score(P("Senior Software Engineer"), mid).matched
    assert score(P("Software Engineer II"), mid).matched
    assert not score(P("Junior Software Engineer"), mid).matched
    assert score(P("Junior Software Engineer"), mid).reasons[-1] == "level: entry ✗"
    assert not score(P("Staff Software Engineer"), mid).matched

    senior = crit(experience_level="senior", **loose)
    lead_result = score(P("Lead Software Engineer"), senior)
    senior_result = score(P("Senior Software Engineer"), senior)
    assert lead_result.matched and "level: lead (above target)" in lead_result.reasons
    assert lead_result.score < senior_result.score

    entry = crit(experience_level="entry", **loose)
    assert score(P("Graduate Software Engineer"), entry).matched
    assert not score(P("Software Engineer II"), entry).matched

    lead = crit(experience_level="lead", **loose)
    assert score(P("Staff Software Engineer"), lead).matched
    assert not score(P("Software Engineer II"), lead).matched

    anyone = crit(experience_level="any", **loose)
    assert all(score(P(t), anyone).matched for t in ("Software Engineer Intern", "Principal Software Engineer"))


# ---------------------------------------------------------------------------
#  excludes
# ---------------------------------------------------------------------------

def test_exclude_keywords_reject_with_reason():
    c = default_criteria()
    r = score(P("Software Engineer, Intern"), c)
    assert r == (False, 0, ["excluded: intern"], None)
    assert score(P("Staff Software Engineer"), c).reasons == ["excluded: staff"]
    assert score(P("Head of Backend Engineering"), c).reasons == ["excluded: head of"]
    # whole words only: "internal" is not "intern"
    assert score(P("Software Engineer, Internal Tools"), c).matched


def test_exclude_uses_synonyms():
    c = crit(exclude_keywords=["senior"])
    assert score(P("Sr. Software Engineer"), c).reasons == ["excluded: senior"]


# ---------------------------------------------------------------------------
#  years of experience
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "text, expected",
    [
        ("You have 3+ years of experience building backend services.", (3, None)),
        ("2-5 years of professional software development experience", (2, 5)),
        ("A minimum of 4 years of experience in Java", (4, None)),
        ("at least 5 yrs working with distributed systems", (5, None)),
        ("Five or more years of experience with Spring Boot", (5, None)),
        ("10+ years of software engineering experience; 5+ years with Kafka", (10, None)),
        ("Minimum qualifications:\n• 3+ years of Java\nPreferred qualifications:\n• 8+ years of experience", (3, None)),
        ("7 years of Python experience is a plus. 3+ years of Go required.", (3, None)),
        ("We were founded 12 years ago; over the past 5 years we grew 10x.", None),
        ("Stripe is 15 years old.", None),
        ("", None),
    ],
)
def test_parse_years(text, expected):
    assert parse_years(text) == expected


def test_years_scoring_and_rejection():
    c = crit(min_years=2, max_years=6)
    in_range = score(P("Software Engineer", description="3+ years of experience with Java"), c)
    assert in_range.matched and "3+ yrs" in in_range.reasons and in_range.years_required == 3
    above = score(P("Software Engineer", description="7+ years of experience"), c)
    assert above.matched and "7+ yrs (above range)" in above.reasons and above.score < in_range.score
    too_senior = score(P("Software Engineer", description="8+ years of experience"), c)
    assert not too_senior.matched and too_senior.reasons[-1] == "needs 8+ yrs" and too_senior.years_required == 8
    below = score(P("Software Engineer", description="0-1 years of experience"), c)
    assert "0–1 yrs (below range)" in below.reasons


# ---------------------------------------------------------------------------
#  locations
# ---------------------------------------------------------------------------

def test_location_aliases():
    c = crit(locations=["Bengaluru", "Gurugram"])
    assert "📍 Bengaluru" in score(P("Software Engineer", "Bangalore, KA"), c).reasons
    assert "📍 Gurugram" in score(P("Software Engineer", "Gurgaon, Haryana"), c).reasons
    assert score(P("Software Engineer", "New Delhi"), crit(locations=["Delhi"])).matched


def test_location_mismatch_rejects():
    r = score(P("Software Engineer", "San Francisco, CA"), default_criteria())
    assert not r.matched and r.reasons[-1] == "📍 San Francisco, CA ✗"


def test_remote_rules():
    c = crit(locations=["Bengaluru", "India"], remote_ok=True)
    assert "🌐 remote" in score(P("Software Engineer", "Remote"), c).reasons
    assert score(P("Software Engineer", "Remote - Worldwide"), c).matched
    assert score(P("Software Engineer", "Live and Work Anywhere"), c).matched
    # remote but only from somewhere else
    for loc in ("Remote (US)", "US, Remote; United States of America", "EMEA Remote", "Remote - Canada"):
        r = score(P("Software Engineer", loc), c)
        assert not r.matched and r.reasons[-1] == "🌐 remote (region-locked)", loc
    assert not score(P("Software Engineer", "Radomlje, Slovenia", remote=True), c).matched
    # India-remote hits the place first
    assert "📍 India" in score(P("Software Engineer", "Remote, India"), c).reasons
    # remote not wanted
    assert not score(P("Software Engineer", "Remote"), crit(locations=["Pune"], remote_ok=False)).matched
    # "Remote" listed as a location counts as remote_ok
    assert score(P("Software Engineer", "Remote"), crit(locations=["Pune", "Remote"], remote_ok=False)).matched


def test_unknown_location_is_kept_with_penalty():
    known = score(P("Software Engineer", "Bengaluru"), default_criteria())
    unknown = score(P("Software Engineer", None), default_criteria())
    assert unknown.matched and "📍 location unknown" in unknown.reasons
    assert unknown.score < known.score


def test_no_location_filter_accepts_anywhere():
    r = score(P("Software Engineer", "Tokyo, Japan"), crit(locations=[]))
    assert r.matched


# ---------------------------------------------------------------------------
#  keywords, threshold, overall
# ---------------------------------------------------------------------------

def test_include_keywords_boost_capped():
    c = default_criteria()
    plain = score(P("Software Engineer"), c)
    boosted = score(P("Software Engineer", description="Java, Spring, Kafka, microservices, backend, distributed"), c)
    assert boosted.reasons[-1] == "+java +spring +kafka +microservices +backend +distributed"
    assert boosted.score - plain.score == 20  # 6 × 4 = 24 → capped at 20


def test_keyword_word_boundaries():
    c = crit(include_keywords=["java", "c++", "node.js"])
    r = score(P("Software Engineer", description="JavaScript and TypeScript, C++ and Node.js"), c)
    assert r.reasons[-1] == "+c++ +node.js"


def test_full_score_example_and_reasons_order():
    c = default_criteria()
    p = P("Sr. Backend Engineer (Java)", "Bangalore, India",
          description="What you need: 4+ years of experience with Java, Spring Boot and Kafka.")
    r = score(p, c)
    assert r.matched and r.score >= 85
    assert r.reasons == ["title ≈ Backend Engineer", "level: senior", "4+ yrs", "📍 Bengaluru",
                         "+java +spring +kafka +backend"]
    assert r.years_required == 4


def test_score_unpacks_as_tuple_and_threshold():
    matched, value, reasons, years = score(P("Software Engineer", None), default_criteria())
    assert matched is (value >= matcher.THRESHOLD)
    assert isinstance(reasons, list) and years is None
    # weak synonym + unknown location falls under the threshold without supporting evidence
    weak = score(P("Java Engineer", None), crit(include_keywords=[]))
    assert not weak.matched and weak.score < matcher.THRESHOLD


def test_no_target_roles_means_any_title():
    r = score(P("Chef de Cuisine"), crit(target_roles=[], exclude_keywords=[]))
    assert r.score > 0


def test_criteria_from_row():
    c = Criteria.from_row({"target_roles": ["A"], "experience_level": "weird", "min_years": "2", "max_years": None,
                           "include_keywords": "{java,kafka}", "locations": None, "remote_ok": False})
    assert c.target_roles == ["A"] and c.experience_level == "any" and c.min_years == 2
    assert c.include_keywords == ["java", "kafka"] and c.locations == [] and c.remote_ok is False
    assert Criteria.from_row(None).target_roles  # defaults when the table is empty


def test_title_prefilter_uses_listing_location():
    c = default_criteria()
    assert matcher.title_prefilter(P("Senior Software Engineer", "India, Bengaluru"), c)
    assert not matcher.title_prefilter(P("Senior Software Engineer", "Israel, Yokneam"), c)
    assert matcher.title_prefilter(P("Senior Software Engineer", None), c)  # unknown → worth enriching
    assert not matcher.title_prefilter(P("Staff Software Engineer"), c)


# ---------------------------------------------------------------------------
#  "Member of Technical Staff" ladder
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "title, role, level",
    [
        ("Member of Technical Staff", "Software Engineer", "unspecified"),
        ("Member of Technical Staff - Backend", "Software Engineer", "unspecified"),
        ("Member of the Technical Staff, Platform", "Software Engineer", "unspecified"),
        ("MTS", "Software Engineer", "unspecified"),
        ("MTS-3, Cloud Infrastructure", "Software Engineer", "senior"),
        ("Senior Member of Technical Staff", "Senior Software Engineer", "senior"),
        ("SMTS, Backend", "Senior Software Engineer", "senior"),
        ("Sr. MTS - Java", "Senior Software Engineer", "senior"),
    ],
)
def test_mts_titles_match_software_engineer(title, role, level):
    c = default_criteria()  # excludes "staff" — must not drop MTS
    r = score(P(title), c)
    assert r.matched, r.reasons
    assert r.reasons[0] == f"title ≈ {role}"
    assert detect_seniority(title) == level


def test_mts_ladder_levels_and_exclusions():
    assert normalize_title("SMTS") == ["senior", "software", "engineer"]
    assert detect_seniority("PMTS") == "lead" and detect_seniority("LMTS") == "lead"
    assert detect_seniority("AMTS") == "entry"
    c = default_criteria()
    assert score(P("PMTS, Database"), c).reasons == ["excluded: principal"]
    assert score(P("Principal Member of Technical Staff"), c).reasons == ["excluded: principal"]
    assert score(P("Lead Member of Technical Staff"), c).reasons[-1] == "level: lead ✗"
    assert not score(P("Staff Software Engineer"), c).matched  # "staff" still excludes real staff titles
    # excluding MTS explicitly works, and does not exclude every software engineer
    mts_out = crit(exclude_keywords=["member of technical staff"])
    assert score(P("Member of Technical Staff"), mts_out).reasons == ["excluded: member of technical staff"]
    assert score(P("Software Engineer"), mts_out).matched


def test_head_office_is_not_head_of():
    c = default_criteria()
    assert score(P("Senior Software Engineer - Head Office Systems"), c).matched
    assert detect_seniority("Software Engineer, Headquarters Apps") == "unspecified"
    assert score(P("Head of Platform Engineering"), c).reasons == ["excluded: head of"]


# ---------------------------------------------------------------------------
#  Non-software-engineering functions (support / QA / sales …)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "title",
    [
        "Software Support Engineer",
        "Software QA Engineer",
        "Software Quality Assurance Engineer",
        "Software Test Engineer",
        "Software Testing Engineer",
        "Software Sales Engineer",
        "Pre-Sales Software Engineer",
        "Software Solutions Engineer",
        "Software Solutions Engineer — India, Pune",
        "Software Quality Engineer",
        "Software Engineer in Test",
        "Senior Software Engineer in Test",
        "Software Development Engineer in Test II",
        "Software Developer in Test",
        "SDET II",
        "Customer Engineer, Software",
        "Field Software Engineer",
        "Software Implementation Engineer",
        "Software Engineer (QA)",
        "Software Engineer - Test Automation",
        "Software Engineer, Implementation",
        "Backend Engineer - Customer Success",
        "Technical Support Engineer - Java",
        "QA/Test Software Engineer",
    ],
)
def test_function_roles_do_not_match_software_engineer(title):
    r = score(P(title), default_criteria())
    assert not r.matched, (title, r)
    assert r.reasons[0].startswith("title:")


def test_function_role_reason_is_explained():
    assert score(P("Software Support Engineer"), default_criteria()).reasons == ["title: support role, not a target"]
    assert score(P("Product Designer"), default_criteria()).reasons == ["title: no target role"]


@pytest.mark.parametrize(
    "title",
    [
        "Software Engineer, Customer Data Platform",
        "Senior Software Engineer, Test Infrastructure",
        "Software Engineer - Sales Platform",
        "Backend Engineer, Support Tooling",
        "Software Engineer, Quality Metrics Platform",
        "Senior Software Engineer (Java, Spring Boot)",
    ],
)
def test_team_names_are_not_functions(title):
    assert score(P(title), default_criteria()).matched, title


def test_function_words_allowed_when_the_target_role_names_them():
    qa = crit(target_roles=["QA Engineer", "SDET"], exclude_keywords=[])
    assert score(P("Senior QA Engineer"), qa).matched
    assert score(P("Software Engineer in Test"), qa).reasons[0] == "title ≈ SDET"
    sol = crit(target_roles=["Solutions Engineer"], exclude_keywords=[])
    assert score(P("Software Solutions Engineer"), sol).matched
    both = crit(target_roles=["Software Engineer", "Support Engineer"])
    assert score(P("Software Support Engineer"), both).matched


# ---------------------------------------------------------------------------
#  Realistic titles from the scanned boards (default criteria: mid, 2-6 yrs, India)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "title, expected",
    [
        ("Senior Software Engineer", True),
        ("Senior Software Engineer - NVEX", True),
        ("Software Engineer, Stripe Data Pipeline", True),
        ("Software Engineer II, Payments", True),
        ("SDE II, Payments", True),
        ("Software Development Engineer II", True),
        ("SDE-2 (Backend)", True),
        ("Backend Engineer", True),
        ("Backend Developer (Java)", True),
        ("Sr. Java Developer - Spring Boot", True),
        ("Java Developer", True),
        ("Software Engineer - Full Stack", True),
        ("Software Engineer, Internal Tools", True),
        ("Senior Backend Engineer, Kafka Platform", True),
        ("Member of Technical Staff", True),
        ("Staff Software Engineer", False),
        ("Principal Software Engineer", False),
        ("Software Engineer, Intern", False),
        ("Software Engineering Intern - Summer 2027", False),
        ("Engineering Manager, Payments", False),
        ("Director of Engineering", False),
        ("Head of Backend Engineering", False),
        ("Junior Software Engineer", False),
        ("Associate Software Engineer", False),
        ("Product Designer", False),
        ("Data Scientist", False),
        ("Site Reliability Engineer", False),
        ("Software Support Engineer", False),
        ("Software Engineer in Test", False),
        ("Solutions Engineer", False),
    ],
)
def test_realistic_titles(title, expected):
    assert score(P(title), default_criteria()).matched is expected, (title, score(P(title), default_criteria()))


def test_multi_location_rows_from_a_location_filtered_search():
    c = default_criteria()
    row = P("Senior Software Engineer - DRIVE SW", "3 Locations")
    row.locations = []  # Workday's listing only says "3 Locations"
    assert not score(row, c).matched  # worldwide search: could be anywhere
    row.in_region = True  # the search was restricted to the criteria locations
    r = score(row, c)
    assert r.matched and "📍 several locations" in r.reasons
    row.locations, row.location = ["US, CA, Santa Clara"], "US, CA, Santa Clara"  # details say otherwise
    assert not score(row, c).matched
