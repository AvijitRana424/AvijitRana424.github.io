// DEMO store: everything lives in this browser's localStorage. Seeded with sample data on first load.
import type { Company, FetchRun, Job, NewJob, SearchCriteria } from '@/lib/types';
import type { CompanyPatch, CriteriaPatch, JobPatch, NewCompanyInput, TrackerStore, UpdateJobOptions } from './store';
import { buildSeed, uid, type DemoDb } from './seed';
import { TrackerError } from './errors';
import { isStale } from './stale';

export const DEMO_STORAGE_KEY = 'job-radar-demo-v1';

/** Small artificial latency so optimistic UI + loading states behave like the live app. */
const LATENCY = 140;
const wait = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();

function isDb(v: unknown): v is DemoDb {
  const d = v as DemoDb;
  return !!d && d.version === 2 && Array.isArray(d.companies) && Array.isArray(d.jobs) && Array.isArray(d.runs) && !!d.criteria;
}

export class LocalStore implements TrackerStore {
  readonly mode = 'demo' as const;
  private db: DemoDb;
  /** false when localStorage is unavailable (private mode etc.) — data then lives in memory only. */
  persistent = true;

  constructor() {
    this.db = this.load();
  }

  private read(): DemoDb | null {
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isDb(parsed)) return parsed;
      }
    } catch {
      /* corrupted or blocked storage → fall through to a fresh seed */
    }
    return null;
  }

  private load(): DemoDb {
    const stored = this.read();
    if (stored) return stored;
    const seeded = buildSeed();
    this.write(seeded);
    return seeded;
  }

  /** Another open demo tab wrote new data → adopt it (instead of overwriting it on our next edit). */
  subscribe(onChange: () => void) {
    const on = (e: StorageEvent) => {
      if (e.key !== DEMO_STORAGE_KEY && e.key !== null) return;
      const next = this.read();
      if (next) {
        this.db = next;
        onChange();
      }
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }

  private write(db: DemoDb) {
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
      this.persistent = true;
    } catch {
      this.persistent = false;
    }
  }

  private commit() {
    this.write(this.db);
  }

  // ── companies ──────────────────────────────────────────────
  async listCompanies() {
    await wait(LATENCY + 60);
    return clone(this.db.companies).sort((a, b) => a.name.localeCompare(b.name));
  }

  async addCompany(input: NewCompanyInput) {
    await wait();
    const name = input.name.trim();
    if (!name) throw new TrackerError("Couldn't add company: a name is required");
    const company: Company = {
      id: uid(),
      name,
      career_url: input.career_url.trim(),
      ats_type: input.ats_type,
      ats_identifier: null, // the scanner derives it from career_url
      active: input.active ?? true,
      notes: input.notes?.trim() || null,
      date_added: now(),
      last_checked_at: null,
      last_status: 'pending',
      last_error: null,
      jobs_seen_count: 0,
    };
    this.db.companies.push(company);
    this.commit();
    return clone(company);
  }

  async updateCompany(id: string, patch: CompanyPatch) {
    await wait();
    const c = this.db.companies.find((x) => x.id === id);
    if (!c) throw new TrackerError("Couldn't update company: it no longer exists", 'notfound');
    Object.assign(c, patch);
    this.commit();
    return clone(c);
  }

  async deleteCompany(id: string) {
    await wait();
    if (!this.db.companies.some((c) => c.id === id)) throw new TrackerError("Couldn't delete company: it no longer exists", 'notfound');
    this.db.companies = this.db.companies.filter((c) => c.id !== id);
    this.db.jobs = this.db.jobs.filter((j) => j.company_id !== id); // on delete cascade
    this.commit();
  }

  // ── jobs ───────────────────────────────────────────────────
  async listJobs() {
    await wait(LATENCY + 80);
    return clone(this.db.jobs).sort((a, b) => b.date_found.localeCompare(a.date_found));
  }

  async addJob(input: NewJob) {
    await wait();
    if (!this.db.companies.some((c) => c.id === input.company_id)) {
      throw new TrackerError("Couldn't add job: the related company no longer exists", 'notfound');
    }
    const t = now();
    const status = input.status ?? 'saved';
    const job: Job = {
      id: uid(),
      company_id: input.company_id,
      external_id: null,
      title: input.title.trim(),
      url: input.url?.trim() || null,
      location: input.location?.trim() || null,
      department: input.department ?? null,
      employment_type: null,
      remote: input.remote ?? null,
      posted_at: null,
      date_found: t,
      last_seen_at: t,
      is_active: true,
      match_score: 0,
      match_reasons: [],
      years_required: null,
      status,
      status_updated_at: t,
      applied_at: status === 'applied' ? t : null,
      notes: input.notes?.trim() || null,
      source: 'manual',
      notified: false,
    };
    this.db.jobs.unshift(job);
    this.commit();
    return clone(job);
  }

  async updateJob(id: string, patch: JobPatch, opts?: UpdateJobOptions) {
    await wait();
    const j = this.db.jobs.find((x) => x.id === id);
    if (!j) throw new TrackerError("Couldn't update job: it no longer exists", 'notfound');
    const { status_updated_at, applied_at, ...rest } = patch;
    const prevStatus = j.status;
    Object.assign(j, rest);
    // emulate the jobs_status_touch trigger
    if (rest.status && rest.status !== prevStatus) {
      j.status_updated_at = now();
      if (rest.status === 'applied' && !j.applied_at) j.applied_at = now();
    }
    // Undo puts the previous timestamps back (like the live store's second update)
    if (opts?.restore) {
      if (status_updated_at !== undefined) j.status_updated_at = status_updated_at;
      if (applied_at !== undefined) j.applied_at = applied_at;
    }
    this.commit();
    return clone(j);
  }

  async deleteJob(id: string) {
    await wait();
    if (!this.db.jobs.some((j) => j.id === id)) throw new TrackerError("Couldn't delete job: it no longer exists", 'notfound');
    this.db.jobs = this.db.jobs.filter((j) => j.id !== id);
    this.commit();
  }

  async clearStaleJobs(cutoffIso: string) {
    await wait();
    // the demo has no scanner to re-add them, so these really go
    const gone = this.db.jobs.filter((j) => isStale(j, cutoffIso)).map((j) => j.id);
    const set = new Set(gone);
    this.db.jobs = this.db.jobs.filter((j) => !set.has(j.id));
    this.commit();
    return gone;
  }

  // ── criteria ───────────────────────────────────────────────
  async getCriteria(): Promise<SearchCriteria> {
    await wait(LATENCY + 40);
    return clone(this.db.criteria);
  }

  async saveCriteria(partial: CriteriaPatch) {
    await wait(LATENCY + 120);
    this.db.criteria = { ...this.db.criteria, ...clone(partial), updated_at: now() };
    this.commit();
    return clone(this.db.criteria);
  }

  // ── runs ───────────────────────────────────────────────────
  async listRuns(limit = 30): Promise<FetchRun[]> {
    await wait(LATENCY + 20);
    return clone(this.db.runs)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, limit);
  }

  async resetDemo() {
    await wait(LATENCY + 160);
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.db = buildSeed();
    this.commit();
  }
}
