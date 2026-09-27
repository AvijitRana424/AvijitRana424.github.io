import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { Company, FetchRun, Job, NewJob, SearchCriteria } from '@/lib/types';
import type { CompanyPatch, CriteriaPatch, JobPatch, NewCompanyInput, TrackerStore, UpdateJobOptions } from './store';
import { DEFAULT_CRITERIA } from './defaults';
import { TrackerError, type TrackerErrorKind } from './errors';

/** Turn PostgREST / network errors into something a human can act on (no trailing period). */
export function friendlyError(err: unknown, action: string): TrackerError {
  if (err instanceof TrackerError) return err;
  const e = err as Partial<PostgrestError> & { message?: string; status?: number };
  const msg = e?.message ?? String(err);
  const code = e?.code ?? '';
  let text: string;
  let kind: TrackerErrorKind = 'other';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    text = 'Network error — check your connection and try again';
    kind = 'network';
  } else if (code === 'PGRST301' || code === 'PGRST303' || e?.status === 401 || /jwt expired|invalid jwt|jws/i.test(msg)) {
    text = 'Your session expired — sign in again';
    kind = 'auth';
  } else if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    text = 'Permission denied — sign in with the owner account (see is_owner() in supabase/schema.sql)';
    kind = 'permission';
  } else if (code === '42P01' || code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(msg)) {
    text = 'Tracker tables are missing — run supabase/schema.sql in the Supabase SQL editor';
    kind = 'schema';
  } else if (code === '23505') {
    text = 'That already exists';
  } else if (code === '23514') {
    text = 'One of the values is not allowed by the database';
  } else if (code === '23503') {
    text = 'The related company no longer exists';
    kind = 'notfound';
  } else if (code === 'PGRST116') {
    // 0 rows back: deleted elsewhere, or RLS hid the row (signed out / expired session in another tab)
    text = 'Not found or no permission — refresh, or sign in again';
    kind = 'notfound';
  } else {
    text = (msg || 'Something went wrong').replace(/[.\s]+$/, '');
  }
  return new TrackerError(`Couldn't ${action}: ${text}`, kind);
}

function must<T>(res: { data: T | null; error: PostgrestError | null }, action: string): T {
  if (res.error) throw friendlyError(res.error, action);
  if (res.data === null || res.data === undefined) throw friendlyError({ code: 'PGRST116', message: '' }, action);
  return res.data;
}

const normJob = (j: Job): Job => ({ ...j, match_reasons: j.match_reasons ?? [] });
const normRun = (r: FetchRun): FetchRun => ({ ...r, errors: Array.isArray(r.errors) ? r.errors : [] });

export class SupabaseStore implements TrackerStore {
  readonly mode = 'supabase' as const;
  private criteriaId: string | null = null;
  /** StrictMode double-mounts and parallel reloads share one "load or create" of the criteria row. */
  private criteriaLoad: Promise<SearchCriteria> | null = null;

  constructor(private db: SupabaseClient) {}

  private async wrap<T>(action: string, fn: () => PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
    try {
      return must(await fn(), action);
    } catch (err) {
      throw friendlyError(err, action);
    }
  }

  async refreshSession() {
    try {
      const { data, error } = await this.db.auth.refreshSession();
      return !error && !!data.session;
    } catch {
      return false;
    }
  }

  // ── companies ──────────────────────────────────────────────
  listCompanies() {
    return this.wrap<Company[]>('load companies', () =>
      this.db.from('companies').select('*').order('name', { ascending: true }),
    );
  }

  addCompany(input: NewCompanyInput) {
    const row = {
      name: input.name.trim(),
      career_url: input.career_url.trim(),
      ats_type: input.ats_type,
      ats_identifier: null, // derived by the scanner from career_url
      notes: input.notes ?? null,
      active: input.active ?? true,
    };
    return this.wrap<Company>('add company', () => this.db.from('companies').insert(row).select('*').single());
  }

  updateCompany(id: string, patch: CompanyPatch) {
    return this.wrap<Company>('update company', () =>
      this.db.from('companies').update(patch).eq('id', id).select('*').single(),
    );
  }

  async deleteCompany(id: string) {
    const rows = await this.wrap<{ id: string }[]>('delete company', () =>
      this.db.from('companies').delete().eq('id', id).select('id'),
    );
    // RLS silently deletes nothing for a signed-out / expired session — don't report success
    if (!rows.length) throw friendlyError({ code: 'PGRST116', message: '' }, 'delete company');
  }

  // ── jobs ───────────────────────────────────────────────────
  async listJobs() {
    const rows = await this.wrap<Job[]>('load jobs', () =>
      this.db.from('jobs').select('*').order('date_found', { ascending: false }),
    );
    return rows.map(normJob);
  }

  async addJob(input: NewJob) {
    const row = {
      company_id: input.company_id,
      title: input.title.trim(),
      url: input.url || null,
      location: input.location || null,
      notes: input.notes || null,
      department: input.department ?? null,
      remote: input.remote ?? null,
      status: input.status ?? 'saved',
      source: 'manual' as const,
      ...(input.status === 'applied' ? { applied_at: new Date().toISOString() } : {}),
    };
    return normJob(await this.wrap<Job>('add job', () => this.db.from('jobs').insert(row).select('*').single()));
  }

  async updateJob(id: string, patch: JobPatch, opts?: UpdateJobOptions) {
    // status_updated_at / applied_at are maintained by the jobs_status_touch trigger…
    const { status_updated_at, applied_at, ...rest } = patch;
    const update = (values: Partial<Job>) =>
      this.wrap<Job>('update job', () => this.db.from('jobs').update(values).eq('id', id).select('*').single());
    let row = Object.keys(rest).length
      ? await update(rest)
      : await this.wrap<Job>('update job', () => this.db.from('jobs').select('*').eq('id', id).single());
    // …except on Undo, where the old timestamps go back. The trigger stamps now() on every status change,
    // so write them in a second update that leaves status alone (the trigger then doesn't touch them).
    if (opts?.restore) {
      const times: Partial<Job> = {};
      if (status_updated_at !== undefined) times.status_updated_at = status_updated_at;
      if (applied_at !== undefined) times.applied_at = applied_at;
      if (Object.keys(times).length) row = await update(times);
    }
    return normJob(row);
  }

  async deleteJob(id: string) {
    const rows = await this.wrap<{ id: string }[]>('delete job', () => this.db.from('jobs').delete().eq('id', id).select('id'));
    if (!rows.length) throw friendlyError({ code: 'PGRST116', message: '' }, 'delete job');
  }

  // ── criteria (single row) ──────────────────────────────────
  getCriteria() {
    this.criteriaLoad ??= this.loadCriteria().finally(() => {
      this.criteriaLoad = null;
    });
    return this.criteriaLoad;
  }

  private async loadCriteria() {
    const existing = await this.db.from('search_criteria').select('*').order('updated_at', { ascending: false }).limit(1);
    if (existing.error) throw friendlyError(existing.error, 'load search criteria');
    let row = (existing.data?.[0] as SearchCriteria | undefined) ?? null;
    if (!row) {
      row = await this.wrap<SearchCriteria>('create search criteria', () =>
        this.db.from('search_criteria').insert(DEFAULT_CRITERIA).select('*').single(),
      );
    }
    this.criteriaId = row.id;
    return row;
  }

  async saveCriteria(partial: CriteriaPatch) {
    const id = this.criteriaId ?? (await this.getCriteria()).id;
    const row = await this.wrap<SearchCriteria>('save search criteria', () =>
      this.db
        .from('search_criteria')
        .update({ ...partial, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single(),
    );
    this.criteriaId = row.id;
    return row;
  }

  // ── fetch runs ─────────────────────────────────────────────
  async listRuns(limit = 30) {
    const rows = await this.wrap<FetchRun[]>('load scan history', () =>
      this.db.from('fetch_runs').select('*').order('started_at', { ascending: false }).limit(limit),
    );
    return rows.map(normRun);
  }
}
