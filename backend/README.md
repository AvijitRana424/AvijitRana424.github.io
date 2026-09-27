# Job Radar — scanner

The Python job that runs every morning on GitHub Actions (09:00 IST). It reads the
companies you track from Supabase, fetches each career page, keeps the postings that
match your search criteria, stores new ones in `jobs`, and emails you a digest.

```
companies ──▶ detect ATS ──▶ fetch postings ──▶ enrich (details) ──▶ match & score ──▶ jobs table ──▶ email digest
                                                                                    └──▶ fetch_runs (status, counts, errors)
```

## Run it locally

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
cp backend/.env.example backend/.env        # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

cd backend
.venv/bin/python -m job_radar run --dry-run                 # read only: no writes, no email
.venv/bin/python -m job_radar run --dry-run --email-preview .out/digest.html
.venv/bin/python -m job_radar run --company "Stripe"        # one company, for real
.venv/bin/python -m job_radar run --no-email                # store matches, skip the digest
.venv/bin/python -m job_radar email-test --to you@gmail.com # check SMTP / Resend settings
```

Exit code is `0` unless every company failed (or the run could not start), so one broken
career page never turns the daily workflow red. Company errors are stored on the company
(`companies.last_error`) and the run (`fetch_runs.errors`), which the tracker shows; the job
summary counts them.

Local runs print full detail (company names, matched titles, criteria). Add `--verbose` for
debug output as well.

## Privacy: the Actions log is public

GitHub Pages on a free plan needs a public repository, and a public repository's Actions logs
and job summaries can be read by anyone. The tracker is owner-only (RLS), so by default **in
GitHub Actions** the scanner prints only aggregate counts and anonymised company lines:

```
company #3: 212 postings, 2 matches, 1 new, ok (4.2s)
company #7: failed — Lever board not found (HTTP 404) — check the career URL / identifier (0.4s)
::warning title=Job Radar::1 of 12 companies failed — see the tracker (Companies tab) for the errors
email: digest with 3 matches sent via smtp
```

No company names, job titles, criteria values or e-mail addresses reach the log, the `::warning::`
annotations or the job summary. Error text is scrubbed of URLs, hosts, paths and addresses, and the
recipient / sender addresses are registered with `::add-mask::`. `company #N` is the company's
position in the alphabetical company list. Full error details are in the database
(`companies.last_error`, `fetch_runs.errors`), which only the owner can read in the tracker.

To print everything (only sensible in a private repository), set the repository variable
`LOG_DETAILS=true`. Locally detail is on by default (`RUN_TRIGGER=local`); `LOG_DETAILS=false`
turns it off. In Actions, `--verbose` debug output also needs `LOG_DETAILS=true`, because
debug lines can contain URLs.

GitHub also prints every step's `env:` block in the log: keep personal values (`EMAIL_TO`,
`EMAIL_FROM` if it is your own address) in **secrets**, which are masked. The optional *company*
input of a manual run is visible too.

## Probe a career URL (no database needed)

```bash
cd backend
.venv/bin/python -m job_radar probe https://boards.greenhouse.io/stripe
.venv/bin/python -m job_radar probe https://www.notion.com/careers            # finds the embedded Ashby board
.venv/bin/python -m job_radar probe https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite --role "Backend Engineer"
.venv/bin/python -m job_radar probe <url> --anywhere --level any --all --show 30
.venv/bin/python -m job_radar probe <url> --json
```

`probe` uses the criteria from Supabase when it is configured, otherwise the seed criteria
from `supabase/schema.sql`. `--role` (repeatable) replaces the target roles and `--anywhere`
drops the location filter.

## Tests

```bash
backend/.venv/bin/python -m pytest backend/tests -q
```

No test touches the network: `tests/fixtures/` holds trimmed real responses from
Greenhouse (Stripe), Lever (Spotify), Ashby (Notion), Workday (NVIDIA), SmartRecruiters
(ServiceNow), Recruitee (bunq) and Workable (Hugging Face), plus hand-written HTML pages
for the custom scraper.

## Supported career sites

| `ats_type`        | URL shapes recognised                                               | API                                             |
|-------------------|---------------------------------------------------------------------|-------------------------------------------------|
| `greenhouse`      | `boards.greenhouse.io/<token>`, `job-boards(.eu).greenhouse.io/…`, `embed/job_board?for=` | `boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true` (EU fallback) |
| `lever`           | `jobs(.eu).lever.co/<company>`                                      | `api.lever.co/v0/postings/<company>?mode=json` (EU fallback) |
| `ashby`           | `jobs.ashbyhq.com/<org>`                                            | `api.ashbyhq.com/posting-api/job-board/<org>`   |
| `workday`         | `<tenant>.wdN.myworkdayjobs.com/[locale/]<site>`, `wdN.myworkdaysite.com/recruiting/<tenant>/<site>` | `POST /wday/cxs/<tenant>/<site>/jobs`, one search per target role, restricted to the criteria locations by the site's location facet |
| `smartrecruiters` | `jobs.smartrecruiters.com/<company>`                                | `api.smartrecruiters.com/v1/companies/<company>/postings` |
| `recruitee`       | `<company>.recruitee.com`                                           | `/api/offers/`                                  |
| `workable`        | `apply.workable.com/<account>`, `<account>.workable.com`            | `POST apply.workable.com/api/v3/accounts/<account>/jobs` |
| `custom`          | anything else                                                       | embedded ATS → JSON-LD `JobPosting` → job-like links (+ pagination, + one "View all jobs" hop) → headless browser |

With `ats_type = auto` the scanner detects the ATS from the URL, or from the page itself
(e.g. a Greenhouse iframe on `acme.com/careers`), and writes the result back to
`companies.ats_type` / `ats_identifier`. The same happens for `custom` (or an unknown type)
when the career URL belongs to a known ATS, and for a known type whose `ats_identifier` is
null or unparseable: the identifier is derived from the career URL (the tracker sends null and
lets the scanner work it out). If the URL names a *different* known ATS than the stored type,
the URL wins.

**Workday and location facets.** Workday search results are ranked worldwide and each term is
capped, so on a big tenant most India postings would never be reached (NVIDIA: 420 postings
scanned, 34 of them in India). The first search response carries the site's location facets
(`locationHierarchy1`, `locations`, `locationCountry`, `Location_Country` …). If none of them
match, one board-wide lookup (empty search) is tried, because a search only lists places that
have hits for its own term. The scanner picks
the one facet whose values match your place terms (India / Bengaluru / Pune …, aliases
included) and applies it to every search as `appliedFacets`. The cap is then 1000 per term.
Facets combine with AND in Workday, so only one is used. Results carry `in_region`, so a listing
that only says "3 Locations" still counts as located. With no matching facet (no place terms, or
the tenant has no India locations), or if the faceted search is rejected, the plain search is
used. NVIDIA now: 145 postings, all in India. Pages that only render jobs with JavaScript need
the optional browser: set the repository **variable** `ENABLE_BROWSER=true`
(locally: `pip install -r requirements-browser.txt && python -m playwright install chromium`).

## Matching (0–100, match ≥ 50)

| Signal    | Effect |
|-----------|--------|
| Title     | every significant token of a target role present = 55 (via engineer≈developer = 47, most tokens of a 3+ word role = partial ~42); `sr`→senior, `sde`/`swe`→software engineer, `II`/`2`→level token (+5 when it matches the role); *Member of Technical Staff* / `MTS` → software engineer, `SMTS` → senior, `LMTS` → lead, `PMTS`/`CMTS` → principal, `AMTS` → associate |
| Function  | support, QA / quality / test / SDET ("Software Engineer in Test"), sales / pre-sales, solutions, customer, success, implementation, field, validation / verification roles are **not** software-engineer matches (`title: support role, not a target`), unless the target role names that function ("QA Engineer", "SDET", "Solutions Engineer"). Only the part of the title that names the role counts, plus trailing parts made only of such words: "Software Support Engineer" and "Software Engineer (QA)" are out, "Software Engineer, Customer Data Platform" is in |
| Excludes  | an `exclude_keywords` word in the title rejects (`excluded: intern`). Whole words after the same phrase normalisation, so "Internal Tools" is fine, "Member of Technical Staff" is not caught by `staff`, and "Head Office Systems" is not `head of` |
| Level     | entry / mid / senior / lead from the title, accepted per `experience_level`; desired +12, other accepted +8, unspecified +4, lead for "senior" −4 |
| Years     | "3+ years", "2-5 years", "minimum of 4 years", "at least 5 yrs" in the description; in range +10, above/below −6/−4, needs more than `max_years + 1` → reject. "Preferred qualifications" mentions only count when nothing else does |
| Location  | one of `locations` (Bangalore = Bengaluru, Gurgaon = Gurugram, …) +10 · remote (if `remote_ok` or "Remote" is listed) +8, but "Remote (US)"-style region-locked postings are rejected · unknown −5 · elsewhere → reject |
| Keywords  | +4 per `include_keywords` hit in title/description, capped at +20 |
| Details   | list-only APIs (Workday, SmartRecruiters, Workable) are enriched with the posting's details for up to `ENRICH_LIMIT` candidates per company (×2 for Workday). Postings already in `jobs` are never re-enriched, and postings whose listing names an accepted location come before "2 Locations" rows. A match whose details were not read says `years not checked` |

Re-scans never write `status`, `notes` or `applied_at`. Postings still listed get
`last_seen_at` refreshed (and are re-activated); postings that disappeared are set
`is_active = false` — for search-based listings (Workday, huge SmartRecruiters boards,
scraped pages) only after the posting itself is confirmed gone. An empty listing never
closes anything. Matches that were never emailed (e.g. a failed send) are retried in the
next digest for 3 days.

Jobs the owner **archives** in the tracker (the tracker archives scraped jobs instead of deleting
them, so they are not re-inserted) keep their row: re-scans only refresh `last_seen_at` /
`is_active`, never `status` or `notified`, the digest skips `status = archived`, and no
`is_open` check is spent on them.

### Run lifecycle and reliability

- **`fetch_runs` is always finished.** The scan runs inside `try/finally`. Cancelling the job or
  hitting `timeout-minutes` sends SIGINT and then SIGTERM, and both are turned into exceptions, so
  the row is closed as `failed` with `(scanner) interrupted`. SIGTERM is ignored while that last
  write runs. At the start of every run, rows still `running` after 2 h (a run killed with
  SIGKILL) are marked `failed`. The row id is generated by the scanner, so a retried insert cannot
  create a second, orphaned row.
- **Bounded waits.** `Retry-After` and backoff sleeps are capped at 10 s per retry and 30 s per
  request (urllib3 would honour up to 6 h). Each company has a time budget
  (`COMPANY_TIME_BUDGET`, 240 s): after it no new request starts and the company is reported
  as `gave up after 240s`. Companies not started within `RUN_TIME_BUDGET` (780 s) are skipped
  until the next run, so the digest and the run row are always written before the 25 min job
  timeout.
- **Idempotent digest.** Pending matches are marked `notified` *before* the e-mail is sent. If the
  send fails they are marked back, so tomorrow's digest retries them. A database error after a
  successful send therefore can neither fail the run nor repeat the digest. Resend requests also
  carry an `Idempotency-Key` derived from the job ids. Scraped strings are HTML-escaped in the
  e-mail, only `http(s)` links become `href`s, and line breaks are removed from the subject.
- **Paging.** Supabase reads use a unique sort key (`id.asc`, `match_score.desc,id.asc`) and
  `Prefer: count=exact`, so a project whose *max rows* is below 1000 is not silently truncated.
  A Workable listing cut off at 30 pages, or a SmartRecruiters page with an unparseable row, no
  longer counts as a complete listing (that used to close jobs past the cut).

## Environment

| Variable | Default | Notes |
|---|---|---|
| `SUPABASE_URL` | — | required for `run` |
| `SUPABASE_SERVICE_ROLE_KEY` | — | required for `run`; bypasses RLS, keep it in secrets |
| `EMAIL_PROVIDER` | auto | `smtp`, `resend` or `none`; auto picks Resend when `RESEND_API_KEY` is set, else SMTP when user+password are set |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `465` | 465 = SSL, 587 = STARTTLS |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Gmail address + [App Password](https://myaccount.google.com/apppasswords) |
| `RESEND_API_KEY` | — | alternative to SMTP |
| `EMAIL_FROM` | `Job Radar <SMTP_USER>` | Resend needs a verified domain (or `onboarding@resend.dev`) |
| `EMAIL_TO` | — | used when `search_criteria.email_to` is empty; comma separated list allowed |
| `SITE_URL` | Pages URL in CI | site root or tracker URL; the email links to `<SITE_URL>/tracker/` |
| `RUN_TRIGGER` | `local` | `schedule` / `manual` / `local`, stored on `fetch_runs` |
| `DRY_RUN` | `false` | same as `--dry-run` |
| `MAX_WORKERS` | `6` | companies scanned in parallel |
| `REQUEST_TIMEOUT` | `20` | seconds per HTTP request (3 retries on 429/5xx; waits capped at 10 s each, 30 s per request) |
| `ENRICH_LIMIT` | `40` | detail pages per company for list-only APIs (×2 for Workday; stored postings are skipped) |
| `COMPANY_TIME_BUDGET` | `240` | seconds one company may take before the scanner gives up on it |
| `RUN_TIME_BUDGET` | `780` | seconds after which companies that have not started yet are skipped (the job timeout is 25 min) |
| `LOG_DETAILS` | on locally, off in Actions | print company names, titles, criteria and addresses (see *Privacy*) |

`backend/.env` is loaded automatically when present (it never overrides real env vars).

### GitHub Actions setup

Repository → Settings → Secrets and variables → Actions:

- **Secrets:** `SUPABASE_URL` (or the existing `SUPABASE_URL` variable), `SUPABASE_SERVICE_ROLE_KEY`,
  `SMTP_USER` + `SMTP_PASSWORD` *or* `RESEND_API_KEY`, optionally `EMAIL_TO` and `EMAIL_FROM`
  (a secret keeps your address out of the public log; a variable of the same name also works).
- **Variables (optional, empty = default):** `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SITE_URL`,
  `MAX_WORKERS`, `REQUEST_TIMEOUT`, `ENRICH_LIMIT`, `COMPANY_TIME_BUDGET`, `RUN_TIME_BUDGET`,
  `LOG_DETAILS`, `ENABLE_BROWSER`. For example, `SMTP_HOST=smtp.office365.com` + `SMTP_PORT=587` for a
  STARTTLS provider.

Run it by hand from Actions → *Job Radar scan* → *Run workflow* (with a dry-run switch and an
optional company name).

**Keepalive.** In a public repository GitHub disables `schedule` triggers after 60 days
without repository activity, and a set-and-forget tracker rarely gets commits, so the daily
emails would just stop. On every scheduled run, the workflow's `keepalive` job re-enables
itself through the API (`gh api -X PUT repos/$GITHUB_REPOSITORY/actions/workflows/job-fetch.yml/enable`,
with `permissions: actions: write` on that job only; the scan job keeps a read-only token). That
resets the inactivity clock without dummy commits. If the schedule was already disabled, enable
it once under Actions → *Job Radar scan* → *Enable workflow*.
