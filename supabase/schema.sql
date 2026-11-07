-- =====================================================================
--  Portfolio + Job Radar — Supabase schema
--  Run this whole file once in Supabase → SQL Editor → "New query" → Run.
--  It is idempotent: safe to run again after edits.
--
--  ⚠️  BEFORE RUNNING: replace the owner email in is_owner() below if you
--      log in to Supabase Auth with a different address.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  Owner check — only this account can write anything / see the tracker.
--  The GitHub Actions job uses the service_role key, which bypasses RLS.
-- ---------------------------------------------------------------------
create or replace function public.is_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email') = lower('ranaavijit80@gmail.com'), false)
$$;

-- ---------------------------------------------------------------------
--  companies — career portals to watch
-- ---------------------------------------------------------------------
create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  career_url      text not null,
  ats_type        text not null default 'auto'
                  check (ats_type in ('auto','greenhouse','lever','ashby','workday',
                                      'smartrecruiters','recruitee','workable','custom')),
  ats_identifier  text,                       -- board token / slug, filled by the scanner
  active          boolean not null default true,
  notes           text,
  date_added      timestamptz not null default now(),
  last_checked_at timestamptz,
  last_status     text not null default 'pending'
                  check (last_status in ('pending','ok','error')),
  last_error      text,
  jobs_seen_count integer not null default 0  -- postings scanned on the last run
);

-- ---------------------------------------------------------------------
--  jobs — only postings that matched search_criteria (or added manually)
-- ---------------------------------------------------------------------
create table if not exists public.jobs (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  external_id       text,                     -- id inside the ATS (null for manual jobs)
  title             text not null,
  url               text,
  location          text,
  department        text,
  employment_type   text,
  remote            boolean,
  posted_at         timestamptz,
  date_found        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  is_active         boolean not null default true,   -- false once the posting disappears
  match_score       integer not null default 0,      -- 0..100
  match_reasons     text[] not null default '{}',
  years_required    integer,
  status            text not null default 'new'
                    check (status in ('new','saved','applied','interview','offer','rejected','archived')),
  status_updated_at timestamptz not null default now(),
  applied_at        timestamptz,
  notes             text,
  source            text not null default 'scraper' check (source in ('scraper','manual')),
  notified          boolean not null default false,  -- included in an email digest already
  unique (company_id, external_id)
);

create index if not exists jobs_company_idx on public.jobs (company_id);
create index if not exists jobs_status_idx  on public.jobs (status);
create index if not exists jobs_found_idx   on public.jobs (date_found desc);

-- "Clear old jobs" (tracker button): scraped jobs found 7+ days ago and never applied to are archived
-- and stamped here. The row stays, hidden, only so the scanner keeps treating the posting as known —
-- a deleted row would come straight back as New on the next scan.
alter table public.jobs add column if not exists dismissed_at timestamptz;
create index if not exists jobs_visible_idx on public.jobs (date_found desc) where dismissed_at is null;

-- keep status_updated_at / applied_at in sync with status changes
create or replace function public.jobs_status_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_updated_at := now();
    if new.status = 'applied' and new.applied_at is null then
      new.applied_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_status_touch on public.jobs;
create trigger jobs_status_touch
  before update on public.jobs
  for each row execute function public.jobs_status_touch();

-- ---------------------------------------------------------------------
--  search_criteria — single row that drives matching + the email digest
-- ---------------------------------------------------------------------
create table if not exists public.search_criteria (
  id               uuid primary key default gen_random_uuid(),
  target_roles     text[] not null default '{}',   -- e.g. {"Software Engineer","Backend Engineer","SDE 2"}
  experience_level text not null default 'any'
                   check (experience_level in ('any','entry','mid','senior','lead')),
  min_years        integer,
  max_years        integer,
  include_keywords text[] not null default '{}',   -- boost: java, spring, kafka …
  exclude_keywords text[] not null default '{}',   -- drop: intern, principal, manager …
  locations        text[] not null default '{}',   -- empty = anywhere
  remote_ok        boolean not null default true,
  email_enabled    boolean not null default true,
  email_to         text,
  updated_at       timestamptz not null default now()
);

-- exactly one criteria row (two browsers creating it at once can't make a duplicate)
alter table public.search_criteria
  add column if not exists singleton boolean not null default true check (singleton);
create unique index if not exists search_criteria_singleton on public.search_criteria (singleton);

-- ---------------------------------------------------------------------
--  fetch_runs — one row per scanner run (written by GitHub Actions)
-- ---------------------------------------------------------------------
create table if not exists public.fetch_runs (
  id                uuid primary key default gen_random_uuid(),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running'
                    check (status in ('running','success','partial','failed')),
  trigger           text not null default 'schedule' check (trigger in ('schedule','manual','local')),
  companies_checked integer not null default 0,
  jobs_scanned      integer not null default 0,
  new_matches       integer not null default 0,
  email_sent        boolean not null default false,
  errors            jsonb not null default '[]'::jsonb   -- [{company, message}]
);

-- ---------------------------------------------------------------------
--  resume_versions — history of uploaded resume PDFs (files live in Storage)
-- ---------------------------------------------------------------------
create table if not exists public.resume_versions (
  id          uuid primary key default gen_random_uuid(),
  file_path   text not null,          -- path inside the "resumes" bucket
  file_name   text not null,          -- original file name
  size_bytes  integer not null default 0,
  uploaded_at timestamptz not null default now(),
  is_current  boolean not null default false,
  label       text                    -- optional note, e.g. "Backend-focused v3"
);

-- at most one current resume
create unique index if not exists resume_one_current
  on public.resume_versions (is_current) where is_current;

-- atomically make one version the current resume (called from the site via rpc)
create or replace function public.set_current_resume(version_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner can change the current resume' using errcode = '42501';
  end if;
  if not exists (select 1 from public.resume_versions where id = version_id) then
    raise exception 'resume version % not found', version_id using errcode = 'P0002';  -- never clear the live flag for a bad id
  end if;
  update public.resume_versions set is_current = false where is_current and id <> version_id;
  update public.resume_versions set is_current = true  where id = version_id;
end;
$$;

-- upload = one atomic step: demote the old current row and insert the new one as current
create or replace function public.add_resume_version(p_file_path text, p_file_name text, p_size integer, p_label text default null)
returns public.resume_versions
language plpgsql
set search_path = ''
as $$
declare r public.resume_versions;
begin
  if not public.is_owner() then
    raise exception 'only the owner can upload a resume' using errcode = '42501';
  end if;
  update public.resume_versions set is_current = false where is_current;
  insert into public.resume_versions (file_path, file_name, size_bytes, label, is_current)
  values (p_file_path, p_file_name, p_size, p_label, true)
  returning * into r;
  return r;
end;
$$;

-- delete = one atomic step: remove the row and, if it was current, promote the newest remaining one.
-- Returns the storage path so the caller can remove the file.
create or replace function public.delete_resume_version(p_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare v_path text; v_was_current boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner can delete a resume' using errcode = '42501';
  end if;
  delete from public.resume_versions where id = p_id returning file_path, is_current into v_path, v_was_current;
  if v_path is null then
    raise exception 'resume version % not found', p_id using errcode = 'P0002';
  end if;
  if v_was_current then
    update public.resume_versions set is_current = true
     where id = (select id from public.resume_versions order by uploaded_at desc limit 1);
  end if;
  return v_path;
end;
$$;

-- =====================================================================
--  Row Level Security
-- =====================================================================
alter table public.companies       enable row level security;
alter table public.jobs            enable row level security;
alter table public.search_criteria enable row level security;
alter table public.fetch_runs      enable row level security;
alter table public.resume_versions enable row level security;

-- Tracker tables: owner only (read + write). Nobody else sees your job hunt.
do $$
declare t text;
begin
  foreach t in array array['companies','jobs','search_criteria','fetch_runs'] loop
    execute format('drop policy if exists "owner all" on public.%I', t);
    execute format(
      'create policy "owner all" on public.%I for all to authenticated
         using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- Resume history: visitors can read only the CURRENT version (the portfolio shows it);
-- the owner sees the whole history and is the only one who can add / change / delete.
drop policy if exists "public read"  on public.resume_versions;
drop policy if exists "owner write"  on public.resume_versions;
create policy "public read" on public.resume_versions
  for select to anon, authenticated using (is_current or public.is_owner());
create policy "owner write" on public.resume_versions
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- =====================================================================
--  Grants — explicit, so the API works even on projects without Supabase's
--  default privileges. RLS above still decides which ROWS each role sees.
-- =====================================================================
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete
  on public.companies, public.jobs, public.search_criteria, public.fetch_runs, public.resume_versions
  to authenticated;
grant select on public.resume_versions to anon;
grant all on public.companies, public.jobs, public.search_criteria, public.fetch_runs, public.resume_versions
  to service_role;
grant execute on function public.is_owner() to anon, authenticated, service_role;
revoke execute on function public.set_current_resume(uuid) from public, anon;
revoke execute on function public.add_resume_version(text, text, integer, text) from public, anon;
revoke execute on function public.delete_resume_version(uuid) from public, anon;
grant execute on function public.set_current_resume(uuid) to authenticated;
grant execute on function public.add_resume_version(text, text, integer, text) to authenticated;
grant execute on function public.delete_resume_version(uuid) to authenticated;

-- =====================================================================
--  Storage bucket for resume PDFs (public read, owner write, 5 MB, PDF only)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', true, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "resumes public read"  on storage.objects;
drop policy if exists "resumes owner insert" on storage.objects;
drop policy if exists "resumes owner update" on storage.objects;
drop policy if exists "resumes owner delete" on storage.objects;

-- The bucket is public, so files open by their public URL without any policy.
-- Listing the bucket (and delete, which needs select) is owner-only, so old versions can't be enumerated.
create policy "resumes public read" on storage.objects
  for select to authenticated using (bucket_id = 'resumes' and public.is_owner());
create policy "resumes owner insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'resumes' and public.is_owner());
create policy "resumes owner update" on storage.objects
  for update to authenticated using (bucket_id = 'resumes' and public.is_owner());
create policy "resumes owner delete" on storage.objects
  for delete to authenticated using (bucket_id = 'resumes' and public.is_owner());

-- =====================================================================
--  Seed: default search criteria (edit later from the tracker UI)
-- =====================================================================
insert into public.search_criteria
  (target_roles, experience_level, min_years, max_years,
   include_keywords, exclude_keywords, locations, remote_ok, email_enabled, email_to)
select
  array['Software Engineer','Senior Software Engineer','Backend Engineer','SDE 2','SDE II','Java Developer'],
  'mid', 2, 6,
  array['java','spring','kafka','microservices','backend','distributed'],
  array['intern','internship','principal','staff','director','manager','head of'],
  array['Bengaluru','Bangalore','Gurugram','Gurgaon','Delhi','Noida','Hyderabad','Pune','Remote','India'],
  true, true, 'ranaavijit80@gmail.com'
where not exists (select 1 from public.search_criteria);
