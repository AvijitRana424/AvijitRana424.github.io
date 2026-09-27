// Applicant-tracking-system detection from a career-page URL, plus a best-effort live preview
// of open postings using the public job-board JSON APIs (only works where the API allows CORS).
import type { AtsType } from '@/lib/types';

export type ConcreteAts = Exclude<AtsType, 'auto'>;

export interface AtsDetection {
  type: ConcreteAts;
  /** Board token / org slug the scanner uses; null for custom pages. */
  identifier: string | null;
}

export const ATS_LABEL: Record<AtsType, string> = {
  auto: 'Auto-detect',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
  smartrecruiters: 'SmartRecruiters',
  recruitee: 'Recruitee',
  workable: 'Workable',
  custom: 'Custom page',
};

export const ATS_OPTIONS: AtsType[] = [
  'auto',
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'smartrecruiters',
  'recruitee',
  'workable',
  'custom',
];

/** ATSs whose public API we can try to read straight from the browser. */
export const PREVIEWABLE: ConcreteAts[] = ['greenhouse', 'lever', 'ashby'];

/** Parse loosely: accepts "jobs.lever.co/plaid" without a scheme. Returns null if hopeless. */
export function parseUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    return u;
  } catch {
    return null;
  }
}

export function isValidUrl(raw: string) {
  return parseUrl(raw) !== null;
}

/** Normalise user input to a full https URL (keeps the original if it can't be parsed). */
export function normaliseUrl(raw: string) {
  return parseUrl(raw)?.toString() ?? raw.trim();
}

// ── URL detection — a line-for-line port of backend/job_radar/ats/detect.py so the badge and the
// "Detected" hint show exactly what the scanner will do. Keep the two in sync.
const RESERVED = new Set([
  '', 'embed', 'api', 'v0', 'v1', 'v2', 'v3', 'static', 'assets', 'js', 'css', 'img', 'images', 'widget',
  'widgets', 'jobs', 'job', 'careers', 'apply', 'search', 'login', 'signin', 'signup', 'privacy', 'terms',
  'oneclick-ui', 'sitemap.xml', 'robots.txt', 'favicon.ico', 'j', 'www', 'app', 'help', 'blog', 'about',
  'posting-api', 'job-board', 'wday', 'cxs', 'en-us', '_next',
]);
const LOCALE = /^[a-z]{2}(?:[-_][a-z]{2,4})?$/i;
const TOKEN_RE = /^[\p{L}\p{N}_.\- ]+$/u;
const SITE_RE = /^[\p{L}\p{N}_.-]+$/u;

const unquote = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const trimSlashes = (s: string) => s.trim().replace(/^\/+|\/+$/g, '');

/** A usable board token, or null (reserved words, odd characters, absurd length). */
function ok(token: string | null | undefined): string | null {
  if (!token) return null;
  const t = trimSlashes(unquote(token));
  if (!t || RESERVED.has(t.toLowerCase()) || t.length > 120 || !TOKEN_RE.test(t)) return null;
  return t;
}

/** Workday tenant/site names are free-form ("Careers", "External", "jobs" are all real sites). */
function okSite(token: string | null | undefined): string | null {
  const t = trimSlashes(unquote(token ?? ''));
  if (!t || ['wday', 'cxs', 'job', 'details'].includes(t.toLowerCase()) || !SITE_RE.test(t)) return null;
  return t;
}

function greenhouse(host: string, segs: string[], query: URLSearchParams) {
  if (!host.endsWith('greenhouse.io')) return null;
  const forParam = query.get('for');
  if (forParam) return ok(forParam);
  // boards-api.greenhouse.io/v1/boards/<token>/jobs  |  api.greenhouse.io/v1/boards/<token>/embed/...
  const i = segs.indexOf('boards');
  if (i >= 0 && i + 1 < segs.length) return ok(segs[i + 1]);
  if (/^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(host) && segs.length) return ok(segs[0]);
  return null;
}

function lever(host: string, segs: string[]) {
  if (/^jobs(\.eu)?\.lever\.co$/.test(host) && segs.length) return ok(segs[0]);
  if (/^api(\.eu)?\.lever\.co$/.test(host)) {
    const i = segs.indexOf('postings');
    if (i >= 0 && i + 1 < segs.length) return ok(segs[i + 1]);
  }
  return null;
}

function ashby(host: string, segs: string[]) {
  if (host === 'jobs.ashbyhq.com' && segs.length) return ok(segs[0]);
  if (host === 'api.ashbyhq.com') {
    const i = segs.indexOf('job-board');
    if (i >= 0 && i + 1 < segs.length) return ok(segs[i + 1]);
  }
  return null;
}

/** "<host>/<tenant>/<site>", e.g. "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite". */
function workday(host: string, segs: string[]) {
  const m = host.match(/^([\w-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  const m2 = /^(wd\d+)\.myworkdaysite\.com$/.test(host);
  if (!m && !m2) return null;
  // the JSON API: /wday/cxs/<tenant>/<site>/jobs
  if (segs.length >= 4 && segs[0] === 'wday' && segs[1] === 'cxs') {
    const tenant = okSite(segs[2]);
    const site = okSite(segs[3]);
    return tenant && site ? `${host}/${segs[2]}/${segs[3]}` : null;
  }
  let rest = segs;
  if (rest.length && LOCALE.test(rest[0]) && !['job', 'jobs'].includes(rest[0].toLowerCase())) rest = rest.slice(1);
  if (m) return rest.length && okSite(rest[0]) ? `${host}/${m[1]}/${rest[0]}` : null;
  // <wdN>.myworkdaysite.com/[locale/]recruiting/<tenant>/<site>
  if (rest.length >= 3 && rest[0].toLowerCase() === 'recruiting' && okSite(rest[1]) && okSite(rest[2])) {
    return `${host}/${rest[1]}/${rest[2]}`;
  }
  return null;
}

function smartrecruiters(host: string, segs: string[]) {
  if (!host.endsWith('smartrecruiters.com')) return null;
  if (host === 'api.smartrecruiters.com') {
    const i = segs.indexOf('companies');
    return i >= 0 && i + 1 < segs.length ? ok(segs[i + 1]) : null;
  }
  if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com') {
    if (segs.length >= 3 && segs[0] === 'oneclick-ui' && segs[1] === 'company') return ok(segs[2]);
    if (segs.length && !['company', 'ni'].includes(segs[0].toLowerCase())) return ok(segs[0]);
  }
  return null;
}

function recruitee(host: string) {
  const m = host.match(/^([\w-]+)\.recruitee\.com$/);
  if (m && !['www', 'app', 'api', 'careers', 'support', 'blog', 'help', 'd'].includes(m[1])) return ok(m[1]);
  return null;
}

function workable(host: string, segs: string[]) {
  if (host === 'apply.workable.com') {
    if (segs.length >= 4 && segs[0] === 'api' && segs.includes('accounts')) {
      const i = segs.indexOf('accounts');
      return i + 1 < segs.length ? ok(segs[i + 1]) : null;
    }
    if (segs.length && segs[0] !== 'j' && segs[0] !== 'api') return ok(segs[0]);
    return null;
  }
  const m = host.match(/^([\w-]+)\.workable\.com$/);
  if (m && !['www', 'apply', 'jobs', 'api', 'help', 'resources', 'marketing', 'careers', 'app'].includes(m[1])) return ok(m[1]);
  return null;
}

/** Hosts that belong to a known ATS even when the URL carries no board token (for friendlier hints). */
function atsHost(host: string): ConcreteAts | null {
  if (host.endsWith('greenhouse.io')) return 'greenhouse';
  if (/(^|\.)lever\.co$/.test(host)) return 'lever';
  if (host.endsWith('ashbyhq.com')) return 'ashby';
  if (/myworkday(jobs|site)\.com$/.test(host)) return 'workday';
  if (host.endsWith('smartrecruiters.com')) return 'smartrecruiters';
  if (host.endsWith('recruitee.com')) return 'recruitee';
  if (host.endsWith('workable.com')) return 'workable';
  return null;
}

/**
 * Same answer as the scanner's detect(url). `type` is 'custom' when no board token can be read —
 * then `host` tells you whether it is at least an ATS domain (e.g. a Greenhouse root URL).
 */
export function detectAts(url: string): AtsDetection & { host: ConcreteAts | null } {
  const u = parseUrl(url.trim().startsWith('//') ? `https:${url.trim()}` : url);
  if (!u) return { type: 'custom', identifier: null, host: null };
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split('/').filter(Boolean);
  const found: [ConcreteAts, string | null][] = [
    ['greenhouse', greenhouse(host, segs, u.searchParams)],
    ['lever', lever(host, segs)],
    ['ashby', ashby(host, segs)],
    ['workday', workday(host, segs)],
    ['smartrecruiters', smartrecruiters(host, segs)],
    ['recruitee', recruitee(host)],
    ['workable', workable(host, segs)],
  ];
  for (const [type, identifier] of found) if (identifier) return { type, identifier, host: type };
  return { type: 'custom', identifier: null, host: atsHost(host) };
}

export type PreviewResult =
  | { ok: true; count: number; sampleTitles: string[] }
  | { ok: false; message: string };

export const PREVIEW_FALLBACK = "Couldn't preview from the browser — the daily scanner will still check it.";

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 404) throw Object.assign(new Error('not-found'), { notFound: true });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const titlesFrom = (items: unknown[], key: string) =>
  items
    .map((it) => (it && typeof it === 'object' ? (it as Record<string, unknown>)[key] : null))
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim());

/**
 * Best-effort live peek at a public job board. Never throws — CORS / network problems resolve to a
 * friendly { ok: false } so the UI can explain that the server-side scanner will still work.
 */
export async function previewJobs(type: AtsType, identifier: string | null, timeoutMs = 9000): Promise<PreviewResult> {
  if (!identifier) return { ok: false, message: "No board token found in that URL, so there's nothing to preview yet." };
  if (!PREVIEWABLE.includes(type as ConcreteAts)) {
    return { ok: false, message: `Live preview isn't available for ${ATS_LABEL[type]} — the daily scanner will still check it.` };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const id = encodeURIComponent(identifier);
  try {
    let titles: string[] = [];
    if (type === 'greenhouse') {
      const data = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${id}/jobs`, ctrl.signal)) as { jobs?: unknown[] };
      titles = titlesFrom(data.jobs ?? [], 'title');
    } else if (type === 'lever') {
      const data = (await getJson(`https://api.lever.co/v0/postings/${id}?mode=json`, ctrl.signal)) as unknown[];
      titles = titlesFrom(Array.isArray(data) ? data : [], 'text');
    } else if (type === 'ashby') {
      const data = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${id}`, ctrl.signal)) as { jobs?: unknown[] };
      titles = titlesFrom(data.jobs ?? [], 'title');
    }
    return { ok: true, count: titles.length, sampleTitles: [...new Set(titles)].slice(0, 5) };
  } catch (err) {
    if ((err as { notFound?: boolean })?.notFound) {
      return { ok: false, message: `${ATS_LABEL[type]} says there's no board called “${identifier}”. Double-check the URL.` };
    }
    return { ok: false, message: PREVIEW_FALLBACK };
  } finally {
    clearTimeout(timer);
  }
}
