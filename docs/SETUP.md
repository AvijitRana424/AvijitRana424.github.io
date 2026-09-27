# Setup & deploy guide

This guide takes the site from "running in demo mode on my laptop" to "live on GitHub Pages, with
the tracker saving to Supabase and a daily job-scan email". Everything runs on free tiers.

```
┌──────────────── GitHub (public repo) ────────────────┐        ┌──────── Supabase (free) ────────┐
│  push to main ──▶ deploy.yml ──▶ GitHub Pages site   │◀──────▶│  Postgres: companies, jobs,     │
│                                  /  (portfolio)      │  anon  │  search_criteria, fetch_runs,   │
│                                  /tracker/ (private) │  key   │  resume_versions (RLS)          │
│  09:00 IST ──▶ job-fetch.yml ──▶ python -m job_radar │───────▶│  Storage: "resumes" bucket      │
│                         │         (service_role key) │        │  Auth: one owner account        │
│                         └──▶ email digest (Gmail/Resend)       └─────────────────────────────────┘
└──────────────────────────────────────────────────────┘
```

---

## 0. Run it locally (demo mode)

```bash
npm install
npm run dev            # http://localhost:5173  and  http://localhost:5173/tracker/
```

With no Supabase keys the site runs in **demo mode**: the tracker and resume upload work, but
data is saved only in your browser. That's handy for trying things out.

A **production** build without keys is read-only for visitors: the resume shows the web edition,
and `/tracker/` shows a "not connected yet" screen. Add `?demo` to the URL to preview the demo there.

---

## 1. Personalise the content

| What | Where |
|---|---|
| All text: taglines, highlights, experience, projects, skills, "lately" cards | `src/data/profile.ts` |
| Your photo (square-ish JPG) | `public/images/avatar.jpg` |
| GitHub contribution graph | `githubUsername` and `socials.github` in `src/data/profile.ts` |
| X/Twitter, phone visibility (`showPhone`) | `src/data/profile.ts` |
| Project repo / live links | `projects[].links` in `src/data/profile.ts` |
| Fallback resume PDF (used before you upload one) | `public/resume/resume.pdf` (optional) |

---

## 2. Put the code on GitHub

1. Create a **public** repository at <https://github.com/new>.
   - Name it `<your-username>.github.io` to get `https://<your-username>.github.io/`, or
   - name it anything else (e.g. `portfolio`) to get `https://<your-username>.github.io/portfolio/`.
   - Public matters: GitHub Pages is free for public repos, and Actions minutes are unlimited.
     Your secrets and tracker data stay private (secrets live in GitHub, data sits behind Supabase RLS).
2. Push the code:
   ```bash
   git init -b main
   git add .
   git commit -m "Portfolio + Job Radar"
   git remote add origin https://github.com/<your-username>/<repo>.git
   git push -u origin main
   ```
3. In the repo go to **Settings → Pages → Build and deployment → Source** and pick **GitHub Actions**.

The first push already deploys the site in read-only demo mode. The Actions log warns about it.
The next steps make it live.

---

## 3. Create the Supabase project

1. Go to <https://supabase.com> → **Start your project**, sign in with GitHub, then **New project**.
   - Name: `job-radar` (or anything).
   - Database password: click **Generate**, then save it in your password manager. The site never
     needs it, but you'll want it if you ever connect to the database directly.
   - Region: **Mumbai (ap-south-1)** or **Singapore**, whichever is closer to you.
   - Wait about 2 minutes while it provisions.
2. **Create the tables, security rules and storage bucket.** Open **SQL Editor → New query**, paste the
   whole of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**. You should see
   *Success. No rows returned*. The script is safe to run again later.
   > **The owner is decided in one place:** the email inside `is_owner()` at the top of the file. If
   > you'll log in with a different address, change it there before running the script. The site asks
   > the database who the owner is, so nothing else has to match.
3. **Create your owner login.** Go to **Authentication → Users → Add user → Create new user**, enter your
   email and a strong password, tick **Auto Confirm User**, and click **Create user**.
4. **Lock sign-ups.** Go to **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**,
   and save. Now nobody else can create an account. (Even if they could, `is_owner()` would still
   deny them access.)
5. **Copy the API keys.** Go to **Project Settings → API** (on newer dashboards it's **API Keys**, plus
   **Data API** for the URL):
   | Value | Where it goes | Secret? |
   |---|---|---|
   | Project URL `https://xxxx.supabase.co` | GitHub **variable** `SUPABASE_URL` | no |
   | `anon` / publishable key | GitHub **variable** `SUPABASE_ANON_KEY` | no, RLS protects the data |
   | `service_role` / secret key | GitHub **secret** `SUPABASE_SERVICE_ROLE_KEY` | **YES**: never in frontend code |
6. Optional: under **Authentication → URL Configuration**, set **Site URL** to your Pages URL.

### Check it locally in live mode (optional)

```bash
cp .env.example .env.local      # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

Open `/tracker/` and sign in with the owner account. Add a company. Then open the Supabase
**Table Editor → companies** and check that the row is there.

---

## 4. Set up email for the daily digest

Pick **one** option.

**A. Gmail (easiest)**
1. Turn on 2-Step Verification at <https://myaccount.google.com/security>.
2. Open <https://myaccount.google.com/apppasswords>, create an app password named "Job Radar", and
   copy the 16-character password.
3. Add the GitHub secrets `SMTP_USER` = your Gmail address and `SMTP_PASSWORD` = the app password.

**B. Resend** (3,000 emails/month free)
1. Sign up at <https://resend.com> and create an API key.
2. Add the GitHub secret `RESEND_API_KEY`. Until you verify your own domain, you can only send from
   `onboarding@resend.dev`, and only to your own address.

---

## 5. Add the GitHub variables and secrets

Go to **Repo → Settings → Secrets and variables → Actions**.

**Variables** tab (not secret):

| Name | Value | Used by |
|---|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | site build + scanner |
| `SUPABASE_ANON_KEY` | anon / publishable key | site build |
| `OWNER_EMAIL` | optional. Only used for a helpful hint if it doesn't match `is_owner()` | site build |
| `SITE_URL` | your Pages URL, e.g. `https://<you>.github.io/portfolio/` (optional, worked out automatically) | email links |
| `EMAIL_PROVIDER` | `smtp` or `resend` (optional, detected automatically) | scanner |
| `ENABLE_BROWSER` | `true` only if some career pages need JavaScript rendering (optional) | scanner |
| `LOG_DETAILS` | `true` to print company names and job titles in the Actions log (optional, **off by default** because logs of public repos are public) | scanner |
| `SMTP_HOST`, `SMTP_PORT`, `MAX_WORKERS`, `REQUEST_TIMEOUT`, `ENRICH_LIMIT`, `COMPANY_TIME_BUDGET`, `RUN_TIME_BUDGET` | optional tuning (see `backend/.env.example`) | scanner |

**Secrets** tab:

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
| `SMTP_USER` + `SMTP_PASSWORD` | Gmail address + app password (option A) |
| `RESEND_API_KEY` | Resend key (option B) |
| `EMAIL_TO` | where to send the digest (optional; otherwise the address in the tracker's Criteria tab) |
| `EMAIL_FROM` | optional sender, e.g. `Job Radar <you@gmail.com>`. Use a secret rather than a variable, because variables are printed in the public log |

---

## 6. Deploy

Push any change to `main`, or go to **Actions → Deploy site to GitHub Pages → Run workflow**.
After about a minute the site is live at the URL shown in the workflow summary.
Open `/tracker/`: the **Demo** badge should now read **Live**.

**Upload your resume:** sign in on `/tracker/`, open the portfolio's **Resume** section, and drop in your
PDF. The login carries over between the two pages. It becomes the current version for every visitor, and
older versions stay in the history list.

---

## 7. Turn on the daily job scan

1. In the tracker, go to **Criteria** and set your target roles, level, years, locations and keywords. Then save.
2. In **Companies**, add career-page URLs. Greenhouse, Lever, Ashby, Workday, SmartRecruiters,
   Recruitee and Workable are detected automatically. Other pages are parsed as "custom".
3. Do a first test run: **Actions → Job Radar scan → Run workflow** with **dry_run** ticked. The
   log shows counts only (companies appear as `company #1`, `#2` …). The details, including any
   per-company error, show up in the tracker's **Companies** and **History** tabs.
4. Run it again without dry run. Matches appear in the tracker, and the digest arrives by email.
5. From then on it runs **every day at 09:00 IST** (`cron: '30 3 * * *'` in `job-fetch.yml`).

To test a single URL before adding it, run it locally with no database needed:

```bash
python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt
cd backend && .venv/bin/python -m job_radar probe https://jobs.lever.co/spotify --role "Backend Engineer"
```

---

## 8. Things to know

- **GitHub pauses scheduled workflows** in public repos after 60 days without a commit. The scan
  workflow re-enables itself on every run through a small `keepalive` job, so this shouldn't happen. If
  the emails ever stop, open **Actions → Job Radar scan** and click **Enable workflow**.
- **Privacy:** the repo is public, so the scan logs are redacted by default. Your companies, roles
  and criteria live only in Supabase, and only your login can read them.
- **Supabase free projects pause after about 7 days without activity.** The daily scan counts as activity.
  If a project does pause, click **Restore** in the dashboard.
- The tracker is marked `noindex`, isn't linked in the public nav, and shows nothing without the owner login.
- **Custom domain (recommended):** add it under **Settings → Pages → Custom domain**. The build then
  uses `/` as its base path automatically. It also gives the site its own browser origin. Without one,
  all your `*.github.io` Pages sites share storage, including the tracker login.
- The tracker hides deleted scraped jobs by **archiving** them, so they don't come back on the next scan.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Tracker still says **Demo** after deploy | `SUPABASE_URL` / `SUPABASE_ANON_KEY` must be **variables** (not secrets). Re-run the deploy afterwards. |
| "Invalid login credentials" | Check the user exists under Authentication → Users and is confirmed. |
| Logged in but "This radar belongs to Avijit" | The login email doesn't match `is_owner()` in `schema.sql` / `OWNER_EMAIL`. |
| Resume upload says "not allowed" | You're not signed in as the owner on this browser. Sign in on `/tracker/` first. |
| Scan shows `error` for a company | Hover its status dot in **Companies**. The message explains the fix (wrong board name, JavaScript-only page → `ENABLE_BROWSER=true`, …). |
| No email arrived | Check the run log for "email". Gmail needs an *app password*, not your normal password. |
