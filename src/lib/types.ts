// Row types — mirror supabase/schema.sql exactly (snake_case, as returned by PostgREST).

export type AtsType =
  | 'auto'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'smartrecruiters'
  | 'recruitee'
  | 'workable'
  | 'custom';

export type CompanyStatus = 'pending' | 'ok' | 'error';

export interface Company {
  id: string;
  name: string;
  career_url: string;
  ats_type: AtsType;
  ats_identifier: string | null;
  active: boolean;
  notes: string | null;
  date_added: string; // ISO timestamp
  last_checked_at: string | null;
  last_status: CompanyStatus;
  last_error: string | null;
  jobs_seen_count: number;
}

export type NewCompany = Pick<Company, 'name' | 'career_url' | 'ats_type'> &
  Partial<Pick<Company, 'notes' | 'active'>>;

export type JobStatus = 'new' | 'saved' | 'applied' | 'interview' | 'offer' | 'rejected' | 'archived';

export const JOB_STATUSES: JobStatus[] = ['new', 'saved', 'applied', 'interview', 'offer', 'rejected', 'archived'];

export interface Job {
  id: string;
  company_id: string;
  external_id: string | null;
  title: string;
  url: string | null;
  location: string | null;
  department: string | null;
  employment_type: string | null;
  remote: boolean | null;
  posted_at: string | null;
  date_found: string;
  last_seen_at: string;
  is_active: boolean;
  match_score: number; // 0..100
  match_reasons: string[];
  years_required: number | null;
  status: JobStatus;
  status_updated_at: string;
  applied_at: string | null;
  notes: string | null;
  source: 'scraper' | 'manual';
  notified: boolean;
  /** set by "Clear old jobs" — such rows stay in the table (so the scanner skips them) but are never loaded */
  dismissed_at?: string | null;
}

export type NewJob = Pick<Job, 'company_id' | 'title'> &
  Partial<Pick<Job, 'url' | 'location' | 'notes' | 'status' | 'department' | 'remote'>>;

export type ExperienceLevel = 'any' | 'entry' | 'mid' | 'senior' | 'lead';

export interface SearchCriteria {
  id: string;
  target_roles: string[];
  experience_level: ExperienceLevel;
  min_years: number | null;
  max_years: number | null;
  include_keywords: string[];
  exclude_keywords: string[];
  locations: string[];
  remote_ok: boolean;
  email_enabled: boolean;
  email_to: string | null;
  updated_at: string;
}

export type FetchRunStatus = 'running' | 'success' | 'partial' | 'failed';

export interface FetchRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: FetchRunStatus;
  trigger: 'schedule' | 'manual' | 'local';
  companies_checked: number;
  jobs_scanned: number;
  new_matches: number;
  email_sent: boolean;
  errors: { company: string; message: string }[];
}

export interface ResumeVersion {
  id: string;
  file_path: string; // path inside the "resumes" storage bucket
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
  is_current: boolean;
  label: string | null;
}
