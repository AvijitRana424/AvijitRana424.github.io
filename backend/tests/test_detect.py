import pytest

from job_radar.ats.detect import detect, detect_known, identifier_for


@pytest.mark.parametrize(
    "url, expected",
    [
        # Greenhouse
        ("https://boards.greenhouse.io/stripe", ("greenhouse", "stripe")),
        ("https://boards.greenhouse.io/stripe/jobs/8172487", ("greenhouse", "stripe")),
        ("https://job-boards.greenhouse.io/airbnb", ("greenhouse", "airbnb")),
        ("https://job-boards.eu.greenhouse.io/acme-eu/jobs/42?gh_src=x", ("greenhouse", "acme-eu")),
        ("https://boards.greenhouse.io/embed/job_board?for=razorpay", ("greenhouse", "razorpay")),
        ("//boards.greenhouse.io/embed/job_board/js?for=postman", ("greenhouse", "postman")),
        ("https://boards-api.greenhouse.io/v1/boards/figma/jobs?content=true", ("greenhouse", "figma")),
        ("boards.greenhouse.io/notion", ("greenhouse", "notion")),
        # Lever
        ("https://jobs.lever.co/palantir", ("lever", "palantir")),
        ("https://jobs.lever.co/spotify/2193db3f-77c5-43b8-b030-8f92c9882bf1", ("lever", "spotify")),
        ("https://jobs.eu.lever.co/acme/abc/apply", ("lever", "acme")),
        ("https://api.lever.co/v0/postings/plaid?mode=json", ("lever", "plaid")),
        # Ashby
        ("https://jobs.ashbyhq.com/ramp", ("ashby", "ramp")),
        ("https://jobs.ashbyhq.com/notion/42f18ccd-c4c8-4a85-8c1f-de12c575fe87", ("ashby", "notion")),
        ("https://jobs.ashbyhq.com/Clear%20Street", ("ashby", "Clear Street")),
        ("https://api.ashbyhq.com/posting-api/job-board/linear?includeCompensation=true", ("ashby", "linear")),
        # Workday
        ("https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
         ("workday", "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite")),
        ("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/India-Bengaluru/SSE_JR1",
         ("workday", "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite")),
        ("https://walmart.wd5.myworkdayjobs.com/wday/cxs/walmart/WalmartExternal/jobs",
         ("workday", "walmart.wd5.myworkdayjobs.com/walmart/WalmartExternal")),
        ("https://wd1.myworkdaysite.com/en-US/recruiting/acme/Careers",
         ("workday", "wd1.myworkdaysite.com/acme/Careers")),
        # SmartRecruiters
        ("https://jobs.smartrecruiters.com/ServiceNow", ("smartrecruiters", "ServiceNow")),
        ("https://jobs.smartrecruiters.com/ServiceNow/744000151981339-sr-staff-product-designer",
         ("smartrecruiters", "ServiceNow")),
        ("https://careers.smartrecruiters.com/BoschGroup", ("smartrecruiters", "BoschGroup")),
        ("https://api.smartrecruiters.com/v1/companies/Visa/postings", ("smartrecruiters", "Visa")),
        ("https://jobs.smartrecruiters.com/oneclick-ui/company/Ubisoft2/publication/abc", ("smartrecruiters", "Ubisoft2")),
        # Recruitee
        ("https://bunq.recruitee.com/", ("recruitee", "bunq")),
        ("https://channable.recruitee.com/o/backend-developer", ("recruitee", "channable")),
        # Workable
        ("https://apply.workable.com/huggingface/", ("workable", "huggingface")),
        ("https://apply.workable.com/huggingface/j/DB4D7C0EC8/", ("workable", "huggingface")),
        ("https://apply.workable.com/api/v3/accounts/skroutz/jobs", ("workable", "skroutz")),
        ("https://yodeck.workable.com", ("workable", "yodeck")),
    ],
)
def test_detect_known_shapes(url, expected):
    assert detect(url) == expected


@pytest.mark.parametrize(
    "url",
    [
        "https://www.postman.com/company/careers/open-positions/",
        "https://stripe.com/jobs/search?gh_jid=8172487",  # needs the page to find the board token
        "https://www.greenhouse.io/",  # marketing site, "Powered by Greenhouse"
        "https://www.lever.co/job-seeker-support",
        "https://jobs.lever.co/",
        "https://www.smartrecruiters.com/privacy-policy",
        "https://www.workable.com/pricing",
        "https://apply.workable.com/j/DB4D7C0EC8",  # no account in the URL
        "https://recruitee.com/",
        "https://boards.greenhouse.io/embed/job_board",  # embed without ?for=
        "not a url at all",
        "",
    ],
)
def test_detect_unknown_is_custom(url):
    ats, ident = detect(url)
    assert ats == "custom"
    assert ident == url
    assert detect_known(url) is None


def test_identifier_for_accepts_slug_or_url():
    assert identifier_for("greenhouse", "stripe") == "stripe"
    assert identifier_for("greenhouse", "https://boards.greenhouse.io/stripe") == "stripe"
    assert identifier_for("lever", "jobs.lever.co/palantir") == "palantir"
    assert identifier_for("workday", "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite") == \
        "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite"
    assert identifier_for("ashby", "jobs.ashbyhq.com/ramp") == "ramp"
    # a URL of a different ATS is not a valid identifier
    assert identifier_for("greenhouse", "https://jobs.lever.co/palantir") is None
    assert identifier_for("greenhouse", "") is None


def test_workday_generic_site_names():
    assert detect("https://acme.wd1.myworkdayjobs.com/Careers") == ("workday", "acme.wd1.myworkdayjobs.com/acme/Careers")
    assert detect("https://acme.wd3.myworkdayjobs.com/en-GB/External/details/Engineer_R1") == \
        ("workday", "acme.wd3.myworkdayjobs.com/acme/External")
    # a stored identifier round-trips, a locale URL is still parsed as a URL
    assert identifier_for("workday", "acme.wd1.myworkdayjobs.com/acme/Careers") == "acme.wd1.myworkdayjobs.com/acme/Careers"
    assert identifier_for("workday", "acme.wd1.myworkdayjobs.com/en-US/Careers") == "acme.wd1.myworkdayjobs.com/acme/Careers"
