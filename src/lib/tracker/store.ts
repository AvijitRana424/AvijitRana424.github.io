// Job Radar data layer — one interface, two implementations:
//   SupabaseStore (live, owner-only via RLS) and LocalStore (demo, this browser only).
import type { Company, FetchRun, Job, NewCompany, NewJob, SearchCriteria } from '@/lib/types';
import { peekSupabase } from '@/lib/supabase';
import { SupabaseStore } from './supabaseStore';
import { LocalStore } from './localStore';

/** Fields the UI may change on a company (id / date_added are immutable). */
export type CompanyPatch = Partial<Omit<Company, 'id' | 'date_added'>>;
/** Fields the UI may change on a job. */
export type JobPatch = Partial<Omit<Job, 'id'>>;
/** A new company. There is deliberately no ats_identifier: the scanner derives it from the URL and
 *  writes the canonical value back, so the browser never stores a guess the scanner might reject. */
export type NewCompanyInput = NewCompany;
export type CriteriaPatch = Partial<Omit<SearchCriteria, 'id' | 'updated_at'>>;

export interface UpdateJobOptions {
  /** Undo: also write status_updated_at / applied_at from the patch (normally the DB trigger owns them). */
  restore?: boolean;
}

export interface TrackerStore {
  mode: 'demo' | 'supabase';
  /** Demo only: false when the browser blocks storage, so changes last until reload. */
  readonly persistent?: boolean;
  /** Demo only: call `onChange` when another tab changes the data. Returns an unsubscribe fn. */
  subscribe?(onChange: () => void): () => void;
  /** Live only: try to refresh an expired session. Resolves true if a fresh token was obtained. */
  refreshSession?(): Promise<boolean>;
  listCompanies(): Promise<Company[]>;
  addCompany(input: NewCompanyInput): Promise<Company>;
  updateCompany(id: string, patch: CompanyPatch): Promise<Company>;
  /** Deletes the company and (cascade) all of its jobs. */
  deleteCompany(id: string): Promise<void>;
  listJobs(): Promise<Job[]>;
  addJob(input: NewJob): Promise<Job>;
  updateJob(id: string, patch: JobPatch, opts?: UpdateJobOptions): Promise<Job>;
  deleteJob(id: string): Promise<void>;
  /** The single search_criteria row (created with defaults if missing). */
  getCriteria(): Promise<SearchCriteria>;
  saveCriteria(partial: CriteriaPatch): Promise<SearchCriteria>;
  listRuns(limit?: number): Promise<FetchRun[]>;
  /** Demo only: wipe local data and re-seed. */
  resetDemo?(): Promise<void>;
}

export { DEFAULT_CRITERIA } from './defaults';
export { TrackerError, errorKind, type TrackerErrorKind } from './errors';

let instance: TrackerStore | null = null;

/** Supabase client configured → live store, otherwise the in-browser demo store. */
export function getStore(): TrackerStore {
  // tracker/main.tsx awaits getSupabase() before rendering, so the client is ready here in live mode
  if (!instance) {
    const sb = peekSupabase();
    instance = sb ? new SupabaseStore(sb) : new LocalStore();
  }
  return instance;
}
