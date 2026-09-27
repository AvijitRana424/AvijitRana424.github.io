import type { AtsType, FetchRunStatus, JobStatus } from '@/lib/types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const STATUS_META: Record<JobStatus, { label: string; color: string; hint: string }> = {
  new: { label: 'New', color: 'var(--st-new)', hint: 'Found by the scanner, not reviewed yet' },
  saved: { label: 'Saved', color: 'var(--st-saved)', hint: 'Worth applying to' },
  applied: { label: 'Applied', color: 'var(--st-applied)', hint: 'Application sent' },
  interview: { label: 'Interview', color: 'var(--st-interview)', hint: 'In the interview loop' },
  offer: { label: 'Offer', color: 'var(--st-offer)', hint: 'Offer on the table' },
  rejected: { label: 'Rejected', color: 'var(--st-rejected)', hint: 'Closed — not moving forward' },
  archived: { label: 'Archived', color: 'var(--st-archived)', hint: 'Hidden from the board' },
};

export const BOARD_STATUSES: JobStatus[] = ['new', 'saved', 'applied', 'interview', 'offer', 'rejected'];

export const RUN_META: Record<FetchRunStatus, { label: string; color: string }> = {
  running: { label: 'Running', color: 'var(--chalk-blue)' },
  success: { label: 'Success', color: 'var(--st-offer)' },
  partial: { label: 'Partial', color: 'var(--st-interview)' },
  failed: { label: 'Failed', color: 'var(--st-rejected)' },
};

export const ATS_COLOR: Record<AtsType, string> = {
  auto: 'var(--paper-3)',
  greenhouse: 'var(--chalk-green)',
  lever: 'var(--chalk-blue)',
  ashby: 'var(--st-saved)',
  workday: 'var(--st-interview)',
  smartrecruiters: 'var(--st-applied)',
  recruitee: 'var(--kraft)',
  workable: 'var(--kraft)',
  custom: 'var(--paper-3)',
};

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'long' });

/** "just now", "5m ago", "3h ago", "yesterday", "4d ago", "12 Sep" (past) or "in 3h" (future). */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = t - now;
  const abs = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;
  if (abs < 45_000) return 'just now';
  if (abs < HOUR) return rtf.format(sign * Math.round(abs / MIN), 'minute');
  if (abs < DAY) return rtf.format(sign * Math.round(abs / HOUR), 'hour');
  if (abs < 7 * DAY) return rtf.format(sign * Math.round(abs / DAY), 'day');
  return shortDate(iso, now);
}

/** Compact "3h", "2d", "5w" for tight card meta. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const abs = Math.max(0, now - new Date(iso).getTime());
  if (abs < HOUR) return `${Math.max(1, Math.round(abs / MIN))}m`;
  if (abs < DAY) return `${Math.round(abs / HOUR)}h`;
  if (abs < 14 * DAY) return `${Math.round(abs / DAY)}d`;
  return `${Math.round(abs / (7 * DAY))}w`;
}

export function shortDate(iso: string, now = Date.now()) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function clockTime(iso: string | number) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function duration(startIso: string, endIso: string | null) {
  if (!endIso) return '—';
  const s = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Next scheduled scan: daily at 03:30 UTC (= 09:00 IST). */
export function nextScan(now = Date.now()) {
  const d = new Date(now);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 30);
  if (t <= now) t += DAY;
  return t;
}

/** The daily scan time in the viewer's own timezone, e.g. "09:00 am". */
export function scanTimeLocal(now = Date.now()) {
  return clockTime(nextScan(now));
}

export function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function num(n: number) {
  return n.toLocaleString('en-IN');
}

export function hostOf(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return u.hostname.replace(/^www\./, '') + (path.length > 1 ? path : '');
  } catch {
    return url;
  }
}

/** Stable small hash for per-entity colors / tilts. */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MONO_COLORS = [
  'var(--st-new)',
  'var(--st-saved)',
  'var(--st-applied)',
  'var(--st-interview)',
  'var(--st-offer)',
  'var(--chalk-red)',
  'var(--kraft)',
];

export function monoColor(name: string) {
  return MONO_COLORS[hash(name) % MONO_COLORS.length];
}

export function initials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Deterministic resting tilt in degrees, in [-max, max]. */
export function tiltFor(id: string, max = 0.9) {
  return ((hash(id) % 1000) / 1000) * 2 * max - max;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
