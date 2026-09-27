// Resume data layer.
//  • SUPABASE mode: PDFs in the public "resumes" bucket + rows in resume_versions (owner-only writes via RLS).
//    Visitors never load supabase-js: the current row comes from one plain REST fetch (RLS lets anon read
//    only the current row) and files open by their public object URL. Only owner actions
//    (list / upload / setCurrent / remove) go through getSupabase().
//  • DEMO mode (no Supabase env): PDFs kept in this browser's IndexedDB ('portfolio-demo' → 'resumes'),
//    read only when the viewer is previewing the demo (owner UI); ordinary visitors never touch it.
//  • STATIC fallback: public/resume/resume.pdf if it exists.

import { asset, config, isDemoMode } from '@/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, RESUME_BUCKET } from '@/lib/supabase';
import type { ResumeVersion } from '@/lib/types';
import { idbAll, idbGet, idbMutate, type StoredResume } from '@/lib/resume/idb';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export type ResumeSource = 'supabase' | 'demo' | 'static';

export interface CurrentResume {
  /** URL the PDF can be fetched / rendered from (object URL in demo mode). */
  url: string;
  fileName: string;
  uploadedAt: string | null;
  version: ResumeVersion | null;
  source: ResumeSource;
  /** URL for the download button (forces a download where the host supports it). */
  downloadUrl: string;
  /** A URL that works for other people (null in demo mode: blobs only live in this tab). */
  shareUrl: string | null;
}

export type ResumeErrorCode =
  | 'invalid-type'
  | 'too-large'
  | 'empty'
  | 'forbidden'
  | 'network'
  | 'not-found'
  | 'storage'
  /** Some steps of a multi-step change went through; the message says what state things are in. */
  | 'partial'
  | 'unknown';

export class ResumeError extends Error {
  code: ResumeErrorCode;
  constructor(code: ResumeErrorCode, message: string) {
    super(message);
    this.name = 'ResumeError';
    this.code = code;
  }
}

export const OWNER_SIGN_IN_HINT = 'Sign in as the owner on /tracker/ to upload.';
const GONE = 'That version no longer exists (it may have been deleted in another tab). The list has been refreshed.';

// ── validation ──────────────────────────────────────────────────────────────

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return `${Number.isInteger(mb) || mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

const looksLikePdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** Cheap synchronous checks (type + size). Returns an error message or null. */
export function validateResumeFile(file: File): string | null {
  if (!looksLikePdf(file)) return `"${file.name}" isn't a PDF. Export your resume as .pdf and try again.`;
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_RESUME_BYTES) return `That PDF is ${formatBytes(file.size)}. The limit is 5 MB.`;
  return null;
}

/** Full check: type, size and the "%PDF-" magic bytes (catches renamed files). */
export async function checkResumeFile(file: File): Promise<string | null> {
  const basic = validateResumeFile(file);
  if (basic) return basic;
  try {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const text = String.fromCharCode(...head);
    if (!text.includes('%PDF-')) return `"${file.name}" doesn't look like a real PDF (it may be renamed).`;
  } catch {
    /* unreadable slice: let the server decide */
  }
  return null;
}

async function assertValid(file: File) {
  const msg = await checkResumeFile(file);
  if (!msg) return;
  const code: ResumeErrorCode = file.size > MAX_RESUME_BYTES ? 'too-large' : file.size === 0 ? 'empty' : 'invalid-type';
  throw new ResumeError(code, msg);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids are uuids in Supabase; demo ids are short opaque strings. Anything else never reaches the store. */
function assertId(id: unknown): asserts id is string {
  const ok = typeof id === 'string' && (isDemoMode ? id.length > 0 && id.length <= 100 : UUID_RE.test(id));
  if (!ok) throw new ResumeError('not-found', GONE);
}

// ── helpers ─────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** "<yyyyMMdd-HHmmss>-<slugified-name>.pdf" (UTC). */
export function storagePathFor(fileName: string, when = new Date()): string {
  const stamp =
    `${when.getUTCFullYear()}${pad(when.getUTCMonth() + 1)}${pad(when.getUTCDate())}-` +
    `${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}${pad(when.getUTCSeconds())}`;
  const slug =
    fileName
      .replace(/\.pdf$/i, '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'resume';
  return `${stamp}-${slug}.pdf`;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const byNewest = (a: ResumeVersion, b: ResumeVersion) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at);

const stripBlob = ({ blob: _blob, ...v }: StoredResume): ResumeVersion => v;

/** Accepts only rows that look like resume_versions rows (the REST answer is untrusted JSON). */
function asVersion(x: unknown): ResumeVersion | null {
  const r = x as Partial<ResumeVersion> | null;
  if (!r || typeof r !== 'object') return null;
  if (typeof r.id !== 'string' || typeof r.file_path !== 'string' || !r.file_path) return null;
  return {
    id: r.id,
    file_path: r.file_path,
    file_name: typeof r.file_name === 'string' && r.file_name ? r.file_name : 'resume.pdf',
    size_bytes: typeof r.size_bytes === 'number' ? r.size_bytes : 0,
    uploaded_at: typeof r.uploaded_at === 'string' ? r.uploaded_at : new Date(0).toISOString(),
    is_current: r.is_current === true,
    label: typeof r.label === 'string' && r.label ? r.label : null,
  };
}

/** Readable text for any error shape (Error, PostgrestError, StorageError, DOMException). Numeric codes are dropped. */
function errText(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  const o = e as { name?: string; message?: string; error?: string; statusCode?: string | number; status?: number; code?: unknown };
  const code = typeof o.code === 'string' ? o.code : undefined;
  const name = o.name && o.name !== 'Error' ? o.name : undefined;
  return [name, o.message, o.error, code, o.statusCode, o.status].filter((v) => v !== undefined && v !== null && v !== '').join(' ');
}

const errName = (e: unknown) => (e as { name?: string } | null)?.name ?? '';
const errCode = (e: unknown) => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' ? c : '';
};

const isQuota = (e: unknown) => {
  const n = errName(e);
  return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota/i.test(errText(e));
};

/** PostgREST "function not found" (schema without the newer RPCs): fall back to the step-by-step path. */
const isMissingRpc = (e: unknown) =>
  errCode(e) === 'PGRST202' || errCode(e) === '42883' || /could not find the function/i.test(errText(e));

/** Atomic RPCs this database turned out not to have (asked once per page view, not on every action). */
const missingRpcs = new Set<string>();

const isNotFound = (e: unknown) => errCode(e) === 'P0002' || errCode(e) === '22P02' || /\bnot found\b/i.test(errText(e));

/** Turn Supabase / browser errors into messages a human can act on. */
function friendly(e: unknown, action: 'upload' | 'manage' | 'read'): ResumeError {
  if (e instanceof ResumeError) return e;
  const t = errText(e);
  if (/row-level security|violates row|permission denied|not authori[sz]ed|unauthori[sz]ed|only the owner|jwt|\b40[13]\b|42501/i.test(t)) {
    return new ResumeError(
      'forbidden',
      action === 'upload' ? OWNER_SIGN_IN_HINT : 'Sign in as the owner on /tracker/ to manage resume versions.',
    );
  }
  if (isQuota(e)) return new ResumeError('too-large', "This browser's storage is full. Delete an old version first.");
  if (errName(e) === 'StorageUnavailableError' || /IndexedDB is not available/i.test(t)) {
    return new ResumeError('storage', "This browser blocks site storage (private window?), so demo uploads can't be saved.");
  }
  if (isNotFound(e)) return new ResumeError('not-found', GONE);
  if (/payload too large|maximum allowed size|exceeded the maximum|\b413\b/i.test(t)) {
    return new ResumeError('too-large', 'That PDF is over the 5 MB limit.');
  }
  if (/mime|invalid_mime_type|\b415\b/i.test(t)) return new ResumeError('invalid-type', 'Only PDF files can be uploaded.');
  if (/failed to fetch|networkerror|network request failed|load failed|timeout/i.test(t)) {
    return new ResumeError('network', 'Network hiccup. Check your connection and try again.');
  }
  console.warn('[resumeStore]', e);
  // Surface a short, word-y message; never error codes or stack-sized blobs.
  const o = e as { message?: unknown; error?: unknown } | null;
  const msg = typeof o?.message === 'string' && o.message ? o.message : typeof o?.error === 'string' ? o.error : '';
  const readable = msg && /[a-z]{3,}/i.test(msg) && msg.length <= 140 ? msg : '';
  return new ResumeError('unknown', readable ? `Something went wrong: ${readable}` : 'Something went wrong. Please try again.');
}

// ── demo mode: object URL cache (one per version, revoked on delete / eviction) ──

const objectUrls = new Map<string, string>();
const MAX_OBJECT_URLS = 8;

function objectUrlFor(row: StoredResume): string {
  const hit = objectUrls.get(row.id);
  if (hit) {
    // refresh LRU position
    objectUrls.delete(row.id);
    objectUrls.set(row.id, hit);
    return hit;
  }
  const url = URL.createObjectURL(row.blob.type ? row.blob : new Blob([row.blob], { type: 'application/pdf' }));
  objectUrls.set(row.id, url);
  while (objectUrls.size > MAX_OBJECT_URLS) {
    const [oldId, oldUrl] = objectUrls.entries().next().value as [string, string];
    objectUrls.delete(oldId);
    URL.revokeObjectURL(oldUrl);
  }
  return url;
}

function revokeObjectUrl(id: string) {
  const url = objectUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(id);
}

// ── supabase: plain URLs (no client needed) ──────────────────────────────────

const sbBase = config.supabaseUrl.replace(/\/+$/, '');

/** Public object URL, e.g. <project>/storage/v1/object/public/resumes/<path>?v=<uploaded_at>. */
function publicUrl(v: ResumeVersion, download?: string): string {
  const path = v.file_path.split('/').map(encodeURIComponent).join('/');
  const q = [
    ...(download ? [`download=${encodeURIComponent(download)}`] : []),
    `v=${Date.parse(v.uploaded_at) || 0}`, // new upload → new URL (the bucket sends cache headers)
  ];
  return `${sbBase}/storage/v1/object/public/${RESUME_BUCKET}/${path}?${q.join('&')}`;
}

/** Keeps the original name, always ending in .pdf. */
const downloadNameFor = (v: ResumeVersion) => (/\.pdf$/i.test(v.file_name) ? v.file_name : `${v.file_name}.pdf`);

/** The current row via one anonymous REST call (RLS: anon may read only the current row). */
async function fetchCurrentRow(): Promise<ResumeVersion | null> {
  const key = config.supabaseAnonKey;
  const res = await fetch(`${sbBase}/rest/v1/resume_versions?select=*&is_current=eq.true&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`resume_versions HTTP ${res.status}`);
  const rows: unknown = await res.json();
  return Array.isArray(rows) ? asVersion(rows[0]) : null;
}

async function ownerClient(action: 'upload' | 'manage' | 'read'): Promise<SupabaseClient> {
  const sb = await getSupabase().catch((e: unknown) => {
    throw friendly(e, action);
  });
  if (!sb) throw new ResumeError('unknown', 'Resume storage is not configured.');
  return sb;
}

// ── static fallback ─────────────────────────────────────────────────────────

let staticCheck: Promise<CurrentResume | null> | null = null;

function staticResume(): Promise<CurrentResume | null> {
  if (!staticCheck) {
    const url = asset('resume/resume.pdf');
    // A tiny ranged GET instead of HEAD: same answer, but Chrome logs every HEAD fetch as "aborted".
    // SPA hosts (and Vite dev) answer missing files with index.html → rejected by the content-type check.
    staticCheck = fetch(url, { headers: { Range: 'bytes=0-7' }, cache: 'no-cache' })
      .then(async (res) => {
        const type = res.headers.get('content-type') ?? '';
        const ok = res.ok && /pdf/i.test(type);
        // Drain small bodies (8-byte range / SPA index.html); only cancel a full PDF from a host without Range support.
        if (ok && res.status === 200) res.body?.cancel().catch(() => undefined);
        else await res.arrayBuffer().catch(() => undefined);
        if (!ok) return null;
        const modified = res.headers.get('last-modified');
        const abs = new URL(url, window.location.href).href;
        return {
          url,
          fileName: 'resume.pdf',
          uploadedAt: modified ? new Date(modified).toISOString() : null,
          version: null,
          source: 'static' as const,
          downloadUrl: url,
          shareUrl: abs,
        };
      })
      .catch(() => null);
  }
  return staticCheck;
}

// ── the store ───────────────────────────────────────────────────────────────

/** Owner only: every version, newest first. */
async function list(): Promise<ResumeVersion[]> {
  if (!isDemoMode) {
    const sb = await ownerClient('read');
    const { data, error } = await sb.from('resume_versions').select('*').order('uploaded_at', { ascending: false });
    if (error) throw friendly(error, 'read');
    return ((data ?? []) as unknown[]).map(asVersion).filter((v): v is ResumeVersion => !!v);
  }
  const rows = await idbAll().catch((e: unknown) => {
    throw friendly(e, 'read');
  });
  return rows.map(stripBlob).sort(byNewest);
}

interface GetCurrentOptions {
  /** Demo mode only: read this browser's demo uploads (owner preview). Visitors skip IndexedDB entirely. */
  demoUploads?: boolean;
}

async function getCurrent({ demoUploads = false }: GetCurrentOptions = {}): Promise<CurrentResume | null> {
  try {
    if (!isDemoMode) {
      const v = await fetchCurrentRow();
      if (v) {
        const url = publicUrl(v);
        return {
          url,
          fileName: v.file_name,
          uploadedAt: v.uploaded_at,
          version: v,
          source: 'supabase',
          downloadUrl: publicUrl(v, downloadNameFor(v)),
          shareUrl: url,
        };
      }
    } else if (demoUploads) {
      const rows = await idbAll();
      const row = rows.find((r) => r.is_current) ?? rows.sort(byNewest)[0];
      if (row) {
        const url = objectUrlFor(row);
        return {
          url,
          fileName: row.file_name,
          uploadedAt: row.uploaded_at,
          version: stripBlob(row),
          source: 'demo',
          downloadUrl: url,
          shareUrl: null,
        };
      }
    }
  } catch (e) {
    // A broken / unconfigured backend should never hide the resume: fall through to the static file.
    console.warn('[resumeStore] could not read the current resume, falling back', e);
  }
  return staticResume();
}

/** URL for any version (used for "preview this version"). */
async function urlFor(v: ResumeVersion): Promise<{ url: string; downloadUrl: string; shareUrl: string | null }> {
  if (!isDemoMode) {
    const url = publicUrl(v);
    return { url, downloadUrl: publicUrl(v, downloadNameFor(v)), shareUrl: url };
  }
  const row = await idbGet(v.id).catch((e: unknown) => {
    throw friendly(e, 'read');
  });
  if (!row) throw new ResumeError('not-found', GONE);
  const url = objectUrlFor(row);
  return { url, downloadUrl: url, shareUrl: null };
}

async function setCurrent(id: string): Promise<void> {
  assertId(id);
  if (!isDemoMode) {
    const sb = await ownerClient('manage');
    // set_current_resume raises for an unknown id, so a stale id can never clear the live flag.
    const { error } = await sb.rpc('set_current_resume', { version_id: id });
    if (error) throw friendly(error, 'manage');
    return;
  }
  let found = false;
  try {
    await idbMutate((store, rows) => {
      found = rows.some((r) => r.id === id);
      if (!found) return; // never demote the live version for an id that is gone
      for (const r of rows) {
        const want = r.id === id;
        if (r.is_current !== want) store.put({ ...r, is_current: want });
      }
    });
  } catch (e) {
    throw friendly(e, 'manage');
  }
  if (!found) throw new ResumeError('not-found', GONE);
}

async function upload(file: File, label?: string): Promise<ResumeVersion> {
  await assertValid(file);
  const cleanLabel = label?.trim() ? label.trim().slice(0, 80) : null;
  const now = new Date();

  if (!isDemoMode) {
    const sb = await ownerClient('upload');
    const path = storagePathFor(file.name, now);
    const bucket = sb.storage.from(RESUME_BUCKET);
    const up = await bucket.upload(path, file, { contentType: 'application/pdf', cacheControl: '3600', upsert: false });
    if (up.error) throw friendly(up.error, 'upload');
    const dropObject = () => bucket.remove([path]).then(({ error }) => !error, () => false);

    // Preferred: one owner-checked RPC that demotes the old version and inserts the new one atomically.
    if (!missingRpcs.has('add_resume_version')) {
      const atomic = await sb.rpc('add_resume_version', {
        p_file_path: path,
        p_file_name: file.name,
        p_size: file.size,
        p_label: cleanLabel,
      });
      if (!atomic.error) {
        const row = asVersion(Array.isArray(atomic.data) ? atomic.data[0] : atomic.data);
        if (row) return { ...row, is_current: true };
      } else if (isMissingRpc(atomic.error)) {
        missingRpcs.add('add_resume_version');
      } else {
        await dropObject(); // nothing points at it: don't leave an orphan behind
        throw friendly(atomic.error, 'upload');
      }
    }

    // Fallback for schemas without add_resume_version: insert (not current), then switch atomically.
    const ins = await sb
      .from('resume_versions')
      .insert({ file_path: path, file_name: file.name, size_bytes: file.size, label: cleanLabel })
      .select()
      .single();
    const row = asVersion(ins.data);
    if (ins.error || !row) {
      await dropObject();
      throw friendly(ins.error ?? new Error('insert returned no row'), 'upload');
    }
    const rpc = await sb.rpc('set_current_resume', { version_id: row.id });
    if (rpc.error) {
      // Roll back so the history doesn't gain a version that never went live.
      const rolledBack =
        !(await sb.from('resume_versions').delete().eq('id', row.id)).error && (await dropObject());
      if (rolledBack) throw friendly(rpc.error, 'upload');
      throw new ResumeError(
        'partial',
        'The PDF was saved, but it could not be made the live resume. Use "Make current" in the version history.',
      );
    }
    return { ...row, is_current: true };
  }

  const version: ResumeVersion = {
    id: newId(),
    file_path: storagePathFor(file.name, now),
    file_name: file.name,
    size_bytes: file.size,
    uploaded_at: now.toISOString(),
    is_current: true,
    label: cleanLabel,
  };
  try {
    const blob = new Blob([await file.arrayBuffer()], { type: 'application/pdf' });
    // one transaction: the old version is demoted only if the new one is stored
    await idbMutate((store, rows) => {
      for (const r of rows) if (r.is_current) store.put({ ...r, is_current: false });
      store.put({ ...version, blob } satisfies StoredResume);
    });
  } catch (e) {
    throw friendly(e, 'upload');
  }
  return version;
}

async function remove(id: string): Promise<void> {
  assertId(id);
  if (!isDemoMode) {
    const sb = await ownerClient('manage');
    const dropObject = async (path: string) => {
      const st = await sb.storage.from(RESUME_BUCKET).remove([path]);
      if (st.error) console.warn('[resumeStore] storage object not removed', st.error);
    };

    // Preferred: one RPC deletes the row, promotes the newest remaining version if needed, returns the path.
    if (!missingRpcs.has('delete_resume_version')) {
      const atomic = await sb.rpc('delete_resume_version', { p_id: id });
      if (!atomic.error) {
        if (typeof atomic.data === 'string' && atomic.data) await dropObject(atomic.data);
        return;
      }
      if (isNotFound(atomic.error)) return; // already gone (another tab / device): the refresh shows it
      if (!isMissingRpc(atomic.error)) throw friendly(atomic.error, 'manage');
      missingRpcs.add('delete_resume_version');
    }

    // Fallback for schemas without delete_resume_version.
    const { data: found, error } = await sb.from('resume_versions').select('*').eq('id', id).maybeSingle();
    if (error) throw friendly(error, 'manage');
    const v = asVersion(found);
    if (!v) return;

    const del = await sb.from('resume_versions').delete().eq('id', id).select('id');
    if (del.error) throw friendly(del.error, 'manage');
    // RLS silently filters deletes for non-owners: 0 rows back means "not allowed".
    if (!del.data?.length) throw friendly(new Error('permission denied'), 'manage');
    await dropObject(v.file_path);

    if (v.is_current) {
      const next = await sb.from('resume_versions').select('id').order('uploaded_at', { ascending: false }).limit(1);
      const nextId = (next.data?.[0] as { id?: string } | undefined)?.id;
      if (next.error || (nextId && (await sb.rpc('set_current_resume', { version_id: nextId })).error)) {
        throw new ResumeError(
          'partial',
          'Deleted, but no version is live right now. Pick one with "Make current" (visitors see the web edition meanwhile).',
        );
      }
    }
    return;
  }

  try {
    await idbMutate((store, rows) => {
      const target = rows.find((r) => r.id === id);
      if (!target) return;
      store.delete(id);
      if (target.is_current) {
        const next = rows.filter((r) => r.id !== id).sort(byNewest)[0];
        if (next) store.put({ ...next, is_current: true });
      }
    });
  } catch (e) {
    throw friendly(e, 'manage');
  }
  revokeObjectUrl(id);
}

export const ResumeStore = {
  getCurrent,
  list,
  upload,
  setCurrent,
  remove,
  /** Extra: resolve a URL for any version (preview). */
  urlFor,
};

export type ResumeStoreApi = typeof ResumeStore;
