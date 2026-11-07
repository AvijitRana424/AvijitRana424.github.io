// "Clear old jobs": scanner finds you never applied to within a week of them being fetched.
// One rule, used by the button's count, the confirm dialog and both stores, so they always agree.
import type { Job, JobStatus } from '@/lib/types';

export const STALE_AFTER_DAYS = 7;
/** Statuses that mean "never applied". Applied / Interview / Offer / Rejected are always kept. */
export const STALE_STATUSES: JobStatus[] = ['new', 'saved', 'archived'];

/** ISO timestamp: jobs found before this are old enough to clear. */
export function staleCutoff(now = Date.now(), days = STALE_AFTER_DAYS): string {
  return new Date(now - days * 86_400_000).toISOString();
}

/** Scraped (not added by hand), never applied, and found before the cutoff. */
export function isStale(j: Job, cutoffIso: string): boolean {
  return (
    j.source === 'scraper' &&
    !j.applied_at &&
    STALE_STATUSES.includes(j.status) &&
    Date.parse(j.date_found) < Date.parse(cutoffIso)
  );
}
