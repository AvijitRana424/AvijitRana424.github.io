// GitHub contribution calendar: live data (jogruber API), or a deterministic sample for local dev only.
import { useEffect, useMemo, useState } from 'react';

export type Level = 0 | 1 | 2 | 3 | 4;

export interface Day {
  date: string; // YYYY-MM-DD
  count: number;
  level: Level;
  month: string; // YYYY-MM
}

export interface MonthLabel {
  key: string; // YYYY-MM
  label: string; // "Mar"
  week: number; // column where the label is drawn
  startWeek: number; // first column that contains a day of this month
  endWeek: number; // last column that contains a day of this month
}

export interface Calendar {
  /** 53 columns × 7 rows (Sun..Sat). null = a day after today. */
  weeks: (Day | null)[][];
  months: MonthLabel[];
  total: number;
}

export type Status = 'loading' | 'live' | 'sample' | 'error';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Today's local calendar date, represented at UTC midnight so date math never drifts across time zones. */
function todayUTC() {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

/** "Tue, Mar 4" */
export function formatDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[m - 1]} ${d}`;
}

export function describeDay(day: Day) {
  const n = day.count === 0 ? 'No' : day.count.toLocaleString('en-US');
  return `${n} contribution${day.count === 1 ? '' : 's'} on ${formatDay(day.date)}`;
}

const levelFor = (count: number): Level => (count <= 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4);

type Lookup = (date: string, dow: number) => { count: number; level?: number } | undefined;

function buildCalendar(lookup: Lookup, total?: number): Calendar {
  const end = todayUTC();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // back up to Sunday

  const weeks: (Day | null)[][] = [];
  const cursor = new Date(start);
  let sum = 0;
  while (cursor <= end) {
    const week: (Day | null)[] = [];
    for (let dow = 0; dow < 7; dow++) {
      if (cursor > end) week.push(null);
      else {
        const date = keyOf(cursor);
        const hit = lookup(date, dow);
        const count = Math.max(0, hit?.count ?? 0);
        const level = (hit?.level != null ? Math.min(4, Math.max(0, hit.level)) : levelFor(count)) as Level;
        sum += count;
        week.push({ date, count, level, month: date.slice(0, 7) });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  // Month labels sit on the first column whose Sunday falls in a new month (like GitHub).
  const firstOf = (w: number) => weeks[w].find(Boolean) as Day;
  const labels: MonthLabel[] = [];
  weeks.forEach((_, w) => {
    const m = firstOf(w).month;
    if (w === 0 || firstOf(w - 1).month !== m) {
      const [, mm] = m.split('-').map(Number);
      labels.push({ key: m, label: MONTHS[mm - 1], week: w, startWeek: w, endWeek: w });
    }
  });
  // Drop a leading partial month that would collide with the next label.
  if (labels.length > 1 && labels[1].week - labels[0].week < 3) labels.shift();
  // Exact column range of each month (a month's first days can live in the previous column).
  for (const l of labels) {
    let s = -1;
    let e = -1;
    weeks.forEach((wk, w) => {
      if (wk.some((d) => d?.month === l.key)) {
        if (s === -1) s = w;
        e = w;
      }
    });
    l.startWeek = s;
    l.endWeek = e;
  }

  return { weeks, months: labels, total: total ?? sum };
}

// ── deterministic sample ──────────────────────────────────────────────────────
/** FNV-1a 32-bit string hash. */
function hash(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 seeded PRNG. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const unit = (s: string) => prng(hash(s))();
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Busy / quiet phases that drift over a few weeks (value noise over the week index). */
function weekIntensity(week: number) {
  const span = 2;
  const i = Math.floor(week / span);
  const f = smooth((week % span) / span);
  const v = unit(`phase:${i}`) * (1 - f) + unit(`phase:${i + 1}`) * f;
  const vacation = unit(`vac:${Math.floor(week / 2)}`) < 0.07;
  const sprint = unit(`sprint:${week}`) < 0.16 ? 1.45 : 1;
  return (0.3 + 1.0 * v * v) * sprint * (vacation ? 0.1 : 1);
}

// Sun..Sat — weekday heavy, light weekends.
const DOW_WEIGHT = [0.26, 1, 1.08, 1.05, 1, 0.82, 0.34];

const sampleLookup: Lookup = (date, dow) => {
  const [y, m, d] = date.split('-').map(Number);
  const week = Math.floor((Date.UTC(y, m - 1, d) / 86_400_000 + 4) / 7); // weeks start on Sunday
  const rnd = prng(hash(`avijit:${date}`));
  const intensity = weekIntensity(week) * DOW_WEIGHT[dow];
  const active = rnd() < Math.min(0.96, 0.12 + 0.95 * intensity);
  if (!active) return { count: 0 };
  let count = Math.max(1, Math.round((1 + rnd() * 6.5) * intensity * 1.3));
  if (rnd() < 0.05 * intensity) count += 5 + Math.floor(rnd() * 8); // the occasional big push
  return { count };
};

export function sampleCalendar(): Calendar {
  return buildCalendar(sampleLookup);
}

export function emptyCalendar(): Calendar {
  return buildCalendar(() => undefined, 0);
}

// ── live data ─────────────────────────────────────────────────────────────────
interface ApiResponse {
  total?: Record<string, number>;
  contributions?: { date: string; count: number; level: number }[];
}

const CACHE_MS = 60 * 60 * 1000;

async function fetchCalendar(username: string, signal: AbortSignal): Promise<Calendar> {
  const cacheKey = `gh-contrib:${username}`;
  let json: ApiResponse | null = null;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const c = JSON.parse(raw) as { t: number; json: ApiResponse };
      if (Date.now() - c.t < CACHE_MS) json = c.json;
    }
  } catch {
    /* storage unavailable */
  }
  if (!json) {
    const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`, { signal });
    if (!res.ok) throw new Error(`GitHub contributions: HTTP ${res.status}`);
    json = (await res.json()) as ApiResponse;
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), json }));
    } catch {
      /* ignore */
    }
  }
  if (!Array.isArray(json.contributions)) throw new Error('GitHub contributions: unexpected response');
  const map = new Map(json.contributions.map((c) => [c.date, c]));
  return buildCalendar((date) => map.get(date), json.total?.lastYear);
}

/**
 * Live calendar for `username`. With no username it returns the deterministic sample (the card only shows
 * that in dev). A failed fetch reports 'error' with an empty calendar: never fall back to made-up numbers.
 */
export function useContributions(username: string) {
  const sample = useMemo(sampleCalendar, []);
  const empty = useMemo(emptyCalendar, []);
  const [state, setState] = useState<{ status: Status; calendar: Calendar }>(() =>
    username ? { status: 'loading', calendar: empty } : { status: 'sample', calendar: sample },
  );

  useEffect(() => {
    if (!username) {
      setState({ status: 'sample', calendar: sample });
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 9000);
    setState({ status: 'loading', calendar: empty });
    fetchCalendar(username, ctrl.signal)
      .then((calendar) => !cancelled && setState({ status: 'live', calendar }))
      .catch(() => !cancelled && setState({ status: 'error', calendar: empty }))
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [username, sample, empty]);

  return state;
}
