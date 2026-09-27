// SAMPLE data for DEMO mode only — fictional pipeline so the tracker has something to show.
// Nothing here is a real application record. Dates are generated relative to "now" so the
// demo always looks fresh (the latest scan is the most recent 03:30 UTC run).
import type { Company, FetchRun, Job, JobStatus, SearchCriteria } from '@/lib/types';
import { DEFAULT_CRITERIA } from './defaults';

export interface DemoDb {
  /** bump when the sample data changes shape, so old demo copies re-seed */
  version: 2;
  companies: Company[];
  jobs: Job[];
  criteria: SearchCriteria;
  runs: FetchRun[];
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Most recent scheduled scan (daily 03:30 UTC) at or before `now`. */
function lastScheduled(now: number) {
  const d = new Date(now);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 30);
  if (t > now) t -= DAY;
  return t;
}

type CompanyKey = 'stripe' | 'plaid' | 'notion' | 'walmart' | 'visa' | 'atlassian';

interface JobSeed {
  co: CompanyKey;
  title: string;
  location: string | null;
  remote?: boolean;
  score: number;
  status: JobStatus;
  /** found this many days before the latest scheduled scan (0 = latest scan) */
  foundDays: number;
  appliedDays?: number;
  updatedDays?: number;
  active?: boolean;
  years?: number;
  dept?: string;
  reasons: string[];
  notes?: string;
  manual?: boolean;
}

export function buildSeed(nowMs = Date.now()): DemoDb {
  const t0 = lastScheduled(nowMs);
  const iso = (ms: number) => new Date(Math.min(ms, nowMs)).toISOString();
  const runAt = (daysBack: number, extraMin = 0) => t0 - daysBack * DAY + extraMin * MIN;

  const co = (
    key: CompanyKey,
    c: Omit<Company, 'id' | 'jobs_seen_count' | 'last_error' | 'notes'> &
      Partial<Pick<Company, 'jobs_seen_count' | 'last_error' | 'notes'>>,
  ): [CompanyKey, Company] => [
    key,
    { id: uid(), jobs_seen_count: 0, last_error: null, notes: null, ...c },
  ];

  const companies = new Map<CompanyKey, Company>([
    co('stripe', {
      name: 'Stripe',
      career_url: 'https://job-boards.greenhouse.io/stripe',
      ats_type: 'greenhouse',
      ats_identifier: 'stripe',
      active: true,
      notes: 'Bengaluru office — payments infra teams.',
      date_added: iso(runAt(38, -600)),
      last_checked_at: iso(runAt(0, 1)),
      last_status: 'ok',
      jobs_seen_count: 468,
    }),
    co('plaid', {
      name: 'Plaid',
      career_url: 'https://jobs.lever.co/plaid',
      ats_type: 'lever',
      ats_identifier: 'plaid',
      active: true,
      date_added: iso(runAt(30, -300)),
      last_checked_at: iso(runAt(0, 1)),
      last_status: 'ok',
      jobs_seen_count: 142,
    }),
    co('notion', {
      name: 'Notion',
      career_url: 'https://jobs.ashbyhq.com/notion',
      ats_type: 'ashby',
      ats_identifier: 'notion',
      active: true,
      date_added: iso(runAt(36, -200)),
      last_checked_at: iso(runAt(0, 2)),
      last_status: 'ok',
      jobs_seen_count: 88,
    }),
    co('walmart', {
      name: 'Walmart Global Tech',
      career_url: 'https://walmart.wd5.myworkdayjobs.com/WalmartExternal',
      ats_type: 'workday',
      ats_identifier: 'walmart.wd5.myworkdayjobs.com/walmart/WalmartExternal',
      active: true,
      date_added: iso(runAt(45, -120)),
      last_checked_at: iso(runAt(0, 2)),
      last_status: 'error',
      last_error:
        'HTTPError: 429 Client Error: Too Many Requests for url: https://walmart.wd5.myworkdayjobs.com/wday/cxs/walmart/WalmartExternal/jobs — Workday is rate-limiting the scanner; it will retry on the next run',
      jobs_seen_count: 0,
    }),
    co('visa', {
      name: 'Visa',
      career_url: 'https://jobs.smartrecruiters.com/Visa',
      ats_type: 'smartrecruiters',
      ats_identifier: 'Visa',
      active: false,
      notes: 'Paused for now — revisit next quarter.',
      date_added: iso(runAt(40, -60)),
      last_checked_at: iso(runAt(2, 1)),
      last_status: 'ok',
      jobs_seen_count: 236,
    }),
    co('atlassian', {
      name: 'Atlassian',
      career_url: 'https://www.atlassian.com/company/careers/all-jobs',
      ats_type: 'custom',
      ats_identifier: null,
      active: true,
      notes: 'Custom careers page — the scanner parses job links.',
      date_added: iso(nowMs - 5 * HOUR),
      last_checked_at: null,
      last_status: 'pending',
    }),
  ]);

  // Exactly the strings backend/job_radar/matcher.py writes, so the demo looks like live data.
  const R = {
    role: (r: string) => `title ≈ ${r}`,
    partial: (r: string) => `title ~ ${r} (partial)`,
    level: (l: string) => `level: ${l}`,
    yrs: (lo: number, hi?: number) => (hi && hi !== lo ? `${lo}–${hi} yrs` : `${lo}+ yrs`),
    above: (label: string) => `${label} (above range)`,
    loc: (l: string) => `📍 ${l}`,
    remote: '🌐 remote',
    unknownLoc: '📍 location unknown',
    kw: (...k: string[]) => k.map((x) => `+${x}`).join(' '),
  };

  const seeds: JobSeed[] = [
    { co: 'stripe', title: 'Software Engineer, Backend — Payments Infrastructure', location: 'Bengaluru', score: 91, status: 'new', foundDays: 0, years: 3, dept: 'Payments', reasons: [R.role('Software Engineer'), R.yrs(3, 5), R.loc('Bengaluru'), R.kw('java', 'backend', 'distributed')] },
    { co: 'plaid', title: 'Software Engineer - Backend (Remote)', location: 'Remote', remote: true, score: 72, status: 'new', foundDays: 0, reasons: [R.role('Software Engineer'), R.remote, R.kw('backend')] },
    { co: 'stripe', title: 'Software Engineer, Data Streaming', location: 'Bengaluru', score: 87, status: 'new', foundDays: 0, years: 2, dept: 'Data Platform', reasons: [R.role('Software Engineer'), R.yrs(2, 4), R.loc('Bengaluru'), R.kw('kafka', 'distributed')] },
    { co: 'walmart', title: 'Software Engineer III — Java / Kafka', location: 'Bengaluru', score: 93, status: 'new', foundDays: 1, years: 3, dept: 'Global Tech', reasons: [R.role('Software Engineer'), R.yrs(3, 6), R.loc('Bengaluru'), R.kw('java', 'kafka', 'microservices')] },
    { co: 'notion', title: 'Software Engineer, Infrastructure', location: 'Remote — India', remote: true, score: 61, status: 'new', foundDays: 1, years: 7, reasons: [R.role('Software Engineer'), R.above(R.yrs(7, 10)), R.remote, R.kw('distributed')] },
    { co: 'stripe', title: 'Backend Engineer, Ledger', location: 'Bengaluru', score: 84, status: 'saved', foundDays: 2, updatedDays: 1, years: 3, reasons: [R.role('Backend Engineer'), R.yrs(3), R.loc('Bengaluru'), R.kw('java', 'backend')], notes: 'Ledger team — double-entry, idempotency. Good fit for payments background.' },
    { co: 'plaid', title: 'Software Engineer II, Data Platform', location: null, score: 58, status: 'saved', foundDays: 4, updatedDays: 3, reasons: [R.partial('Software Engineer'), R.level('mid'), R.unknownLoc, R.kw('kafka')] },
    { co: 'walmart', title: 'Backend Engineer — Marketplace', location: 'Gurugram', score: 78, status: 'saved', foundDays: 6, updatedDays: 5, active: false, reasons: [R.role('Backend Engineer'), R.loc('Gurugram'), R.kw('spring', 'microservices')], notes: 'Posting disappeared before I applied — watch for a re-post.' },
    { co: 'atlassian', title: 'Backend Software Engineer', location: 'Bengaluru', score: 0, status: 'saved', foundDays: 0, updatedDays: 0, manual: true, reasons: [], notes: 'Added by hand from a referral. Ask for an intro before applying.' },
    { co: 'stripe', title: 'Software Engineer, Reliability', location: 'Bengaluru (Hybrid)', score: 76, status: 'applied', foundDays: 9, appliedDays: 6, years: 2, reasons: [R.role('Software Engineer'), R.yrs(2), R.loc('Bengaluru'), R.kw('distributed')] },
    { co: 'notion', title: 'Backend Engineer, Search', location: 'Remote', remote: true, score: 74, status: 'applied', foundDays: 7, appliedDays: 5, reasons: [R.role('Backend Engineer'), R.remote, R.kw('backend')] },
    { co: 'visa', title: 'Senior Software Engineer — Java, Spring Boot', location: 'Bengaluru', score: 89, status: 'applied', foundDays: 12, appliedDays: 10, years: 4, reasons: [R.role('Senior Software Engineer'), R.level('senior'), R.yrs(4, 6), R.loc('Bengaluru'), R.kw('java', 'spring')] },
    { co: 'stripe', title: 'Senior Software Engineer, Billing', location: 'Bengaluru', score: 88, status: 'interview', foundDays: 18, appliedDays: 15, updatedDays: 4, years: 4, reasons: [R.role('Senior Software Engineer'), R.level('senior'), R.yrs(4), R.loc('Bengaluru'), R.kw('java', 'backend')], notes: 'Recruiter screen done. System design round next — revise idempotency keys and retries.' },
    { co: 'walmart', title: 'Software Engineer II — Payments', location: 'Bengaluru', score: 80, status: 'interview', foundDays: 21, appliedDays: 19, updatedDays: 1, years: 2, reasons: [R.role('SDE II'), R.level('mid'), R.yrs(2, 5), R.loc('Bengaluru'), R.kw('java', 'kafka')] },
    { co: 'walmart', title: 'Senior Software Engineer — Supply Chain Platform', location: 'Gurugram', score: 86, status: 'offer', foundDays: 40, appliedDays: 36, updatedDays: 2, years: 4, reasons: [R.role('Senior Software Engineer'), R.level('senior'), R.yrs(4), R.loc('Gurugram'), R.kw('spring', 'microservices')], notes: 'Offer letter received (sample). Compare with the Stripe loop before replying.' },
    { co: 'plaid', title: 'Senior Software Engineer, Payments', location: 'Remote', remote: true, score: 70, status: 'rejected', foundDays: 26, appliedDays: 22, updatedDays: 10, reasons: [R.role('Senior Software Engineer'), R.level('senior'), R.remote, R.kw('backend')], notes: 'Auto-reject after 12 days. Retry in six months.' },
    { co: 'visa', title: 'Software Engineer — Risk Platform', location: 'Hyderabad', score: 68, status: 'rejected', foundDays: 28, appliedDays: 25, updatedDays: 14, reasons: [R.role('Software Engineer'), R.loc('Hyderabad'), R.kw('java')] },
    { co: 'notion', title: 'Software Engineer, Enterprise', location: 'Remote', remote: true, score: 55, status: 'archived', foundDays: 34, updatedDays: 20, active: false, reasons: [R.partial('Software Engineer'), R.remote] },
  ];

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const jobs: Job[] = seeds.map((s, i) => {
    const c = companies.get(s.co)!;
    const found = s.manual ? nowMs - 3 * HOUR : runAt(s.foundDays, 1 + (i % 3));
    const applied = s.appliedDays !== undefined ? runAt(s.appliedDays, 300 + i * 7) : null;
    const updated =
      s.updatedDays !== undefined ? runAt(s.updatedDays, 240 + i * 11) : applied ?? found;
    const external = s.manual ? null : `${1000 + i * 137}`;
    return {
      id: uid(),
      company_id: c.id,
      external_id: external,
      title: s.title,
      url: s.manual
        ? 'https://www.atlassian.com/company/careers/all-jobs'
        : `${c.career_url.replace(/\/$/, '')}/jobs/${external}-${slug(s.title).slice(0, 40)}`,
      location: s.location,
      department: s.dept ?? null,
      employment_type: 'Full-time',
      remote: s.remote ?? false,
      posted_at: s.manual ? null : iso(found - 2 * DAY),
      date_found: iso(found),
      last_seen_at: iso(s.active === false ? found + 3 * DAY : runAt(0, 2)),
      is_active: s.active ?? true,
      match_score: s.score,
      match_reasons: s.reasons,
      years_required: s.years ?? null,
      status: s.status,
      status_updated_at: iso(updated),
      applied_at: applied !== null ? iso(applied) : null,
      notes: s.notes ?? null,
      source: s.manual ? 'manual' : 'scraper',
      notified: !s.manual && s.status !== 'new' ? true : s.foundDays > 0,
    };
  });

  const run = (
    daysBack: number,
    extraMin: number,
    durSec: number,
    r: Omit<FetchRun, 'id' | 'started_at' | 'finished_at'>,
  ): FetchRun => {
    const start = runAt(daysBack, extraMin);
    return { id: uid(), started_at: iso(start), finished_at: iso(start + durSec * 1000), ...r };
  };

  const runs: FetchRun[] = [
    run(0, 0, 134, {
      status: 'partial',
      trigger: 'schedule',
      companies_checked: 4,
      jobs_scanned: 698,
      new_matches: 3,
      email_sent: true,
      errors: [{ company: 'Walmart Global Tech', message: 'Workday API returned HTTP 429 (Too Many Requests)' }],
    }),
    run(1, -420, 162, {
      status: 'success',
      trigger: 'manual',
      companies_checked: 4,
      jobs_scanned: 2519,
      new_matches: 0,
      email_sent: false,
      errors: [],
    }),
    run(1, 0, 171, {
      status: 'success',
      trigger: 'schedule',
      companies_checked: 4,
      jobs_scanned: 2528,
      new_matches: 2,
      email_sent: true,
      errors: [],
    }),
    run(2, 0, 188, {
      status: 'success',
      trigger: 'schedule',
      companies_checked: 5,
      jobs_scanned: 2761,
      new_matches: 1,
      email_sent: true,
      errors: [],
    }),
    run(3, 0, 179, {
      status: 'success',
      trigger: 'schedule',
      companies_checked: 5,
      jobs_scanned: 2754,
      new_matches: 1,
      email_sent: true,
      errors: [],
    }),
  ];

  const criteria: SearchCriteria = {
    id: uid(),
    ...structuredClone(DEFAULT_CRITERIA),
    updated_at: iso(runAt(6, 500)),
  };

  return { version: 2, companies: [...companies.values()], jobs, criteria, runs };
}
