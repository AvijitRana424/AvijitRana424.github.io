import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Company, FetchRun, Job, JobStatus, NewJob, SearchCriteria } from '@/lib/types';
import {
  errorKind,
  getStore,
  type CompanyPatch,
  type CriteriaPatch,
  type JobPatch,
  type NewCompanyInput,
  type TrackerErrorKind,
  type TrackerStore,
} from '@/lib/tracker/store';
import { useToast } from './components/Toast';
import { nextScan, plural, STATUS_META } from './lib/format';

export type LoadState = 'loading' | 'ready' | 'error';

export type NotesSaveState = 'saving' | 'retrying' | 'error' | 'saved';
export interface NotesStatus {
  state: NotesSaveState;
  /** epoch ms of the next automatic retry (state 'retrying') */
  retryAt?: number;
}

export interface TrackerData {
  store: TrackerStore;
  state: LoadState;
  error: string | null;
  errorKind: TrackerErrorKind | null;
  /** false in a demo whose browser blocks storage — changes only last until reload */
  persistent: boolean;
  companies: Company[];
  jobs: Job[];
  criteria: SearchCriteria | null;
  runs: FetchRun[];
  companyById: Map<string, Company>;
  reload(opts?: { quiet?: boolean; background?: boolean }): Promise<void>;
  refreshing: boolean;
  moveJob(id: string, status: JobStatus, opts?: { undo?: boolean; quiet?: boolean }): Promise<boolean>;
  moveJobs(ids: string[], status: JobStatus): Promise<void>;
  patchJob(id: string, patch: JobPatch, opts?: { quiet?: boolean; restore?: boolean }): Promise<boolean>;
  addJob(input: NewJob): Promise<Job | null>;
  /** Hides the job at once and deletes it for good after a few seconds unless the toast's Undo is pressed. */
  removeJob(id: string): boolean;
  addCompany(input: NewCompanyInput): Promise<Company | null>;
  patchCompany(id: string, patch: CompanyPatch, opts?: { quiet?: boolean; message?: ReactNode }): Promise<boolean>;
  /** Same undo window as removeJob; the company's jobs go with it. */
  removeCompany(id: string): boolean;
  saveCriteria(patch: CriteriaPatch): Promise<boolean>;
  resetDemo(): Promise<void>;
  /** Save a job's notes: retries with backoff and keeps a draft in this browser until it lands.
   *  surface → if every retry fails, show a sticky toast with Retry / Copy notes. */
  saveNotes(id: string, value: string, opts?: { surface?: boolean }): Promise<boolean>;
  notesStatus: Record<string, NotesStatus>;
}

const Ctx = createContext<TrackerData | null>(null);

export function useTracker() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTracker must be used inside <TrackerDataProvider>');
  return v;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/[.\s]+$/, '');
const short = (t: string) => (t.length > 38 ? `${t.slice(0, 36)}…` : t);
const byFound = (a: Job, b: Job) => b.date_found.localeCompare(a.date_found);
const byName = (a: Company, b: Company) => a.name.localeCompare(b.name);

/** How long a delete can be undone before it is sent to the store. */
export const UNDO_MS = 6000;
const NOTES_BACKOFF = [2000, 5000, 15000];
const AUTO_REFRESH_MS = 5 * 60_000;
const REFOCUS_STALE_MS = 60_000;

// ── notes drafts (kept until the save lands, so a failed save or a crash never loses them) ──
const DRAFT_PREFIX = 'job-radar-notes-draft:';
export function readNotesDraft(id: string): string | null {
  try {
    return localStorage.getItem(DRAFT_PREFIX + id);
  } catch {
    return null;
  }
}
export function writeNotesDraft(id: string, value: string) {
  try {
    localStorage.setItem(DRAFT_PREFIX + id, value);
  } catch {
    /* storage blocked: the in-memory queue still retries */
  }
}
function clearNotesDraft(id: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + id);
  } catch {
    /* ignore */
  }
}

/** Optimistically mirror what the DB trigger does, so the UI is instantly right. */
function applyJobPatch(j: Job, patch: JobPatch, restore: boolean): Job {
  const next = { ...j, ...patch };
  if (restore) return next; // Undo: the patch carries the old timestamps
  next.status_updated_at = j.status_updated_at;
  next.applied_at = j.applied_at;
  if (patch.status && patch.status !== j.status) {
    next.status_updated_at = new Date().toISOString();
    if (patch.status === 'applied' && !j.applied_at) next.applied_at = next.status_updated_at;
  }
  return next;
}

interface NotesEntry {
  value: string;
  attempt: number;
  busy: boolean;
  dirty: boolean;
  surface: boolean;
  timer?: number;
  waiters: ((ok: boolean) => void)[];
}

interface PendingDelete {
  timer: number;
  commit: () => void;
}

export function TrackerDataProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => getStore(), []);
  const toast = useToast();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [errKind, setErrKind] = useState<TrackerErrorKind | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [criteria, setCriteria] = useState<SearchCriteria | null>(null);
  const [runs, setRuns] = useState<FetchRun[]>([]);
  const [notesStatus, setNotesStatus] = useState<Record<string, NotesStatus>>({});

  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const companiesRef = useRef(companies);
  companiesRef.current = companies;
  /** per-row version counters so a slow response never clobbers a newer optimistic edit */
  const versions = useRef(new Map<string, number>());
  const bump = (id: string) => {
    const v = (versions.current.get(id) ?? 0) + 1;
    versions.current.set(id, v);
    return v;
  };
  const isLatest = (id: string, v: number) => versions.current.get(id) === v;
  /** writes still on the wire — background refreshes wait so they can't undo an optimistic edit */
  const inFlight = useRef(0);
  const loading = useRef(false);
  const lastLoaded = useRef(0);
  const lastBgError = useRef<string | null>(null);
  const pendingJobDeletes = useRef(new Map<string, PendingDelete>());
  const pendingCompanyDeletes = useRef(new Map<string, PendingDelete>());

  const reload = useCallback<TrackerData['reload']>(
    async (opts) => {
      const background = !!opts?.background;
      if (background && (loading.current || inFlight.current > 0)) return;
      loading.current = true;
      if (!background) {
        if (opts?.quiet) setRefreshing(true);
        else setState('loading');
      }
      const fetchAll = () => Promise.all([store.listCompanies(), store.listJobs(), store.getCriteria(), store.listRuns(30)]);
      try {
        let res: Awaited<ReturnType<typeof fetchAll>>;
        try {
          res = await fetchAll();
        } catch (e) {
          // an expired access token: refresh it once and try again before bothering the user
          if (errorKind(e) === 'auth' && store.refreshSession && (await store.refreshSession())) res = await fetchAll();
          else throw e;
        }
        const [c, j, cr, r] = res;
        const goneJobs = pendingJobDeletes.current;
        const goneCos = pendingCompanyDeletes.current;
        setCompanies(c.filter((x) => !goneCos.has(x.id)));
        setJobs(j.filter((x) => !goneJobs.has(x.id) && !goneCos.has(x.company_id)));
        setCriteria(cr);
        setRuns(r);
        setError(null);
        setErrKind(null);
        setState('ready');
        lastLoaded.current = Date.now();
        lastBgError.current = null;
      } catch (e) {
        if (background) {
          // don't nag every five minutes with the same message
          if (lastBgError.current !== msg(e)) toast({ tone: 'error', message: `${msg(e)}.` });
          lastBgError.current = msg(e);
        } else {
          setError(`${msg(e)}.`);
          setErrKind(errorKind(e));
          if (opts?.quiet) toast({ tone: 'error', message: `${msg(e)}.` });
          else setState('error');
        }
      } finally {
        loading.current = false;
        if (!background) setRefreshing(false);
      }
    },
    [store, toast],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  // Stay fresh: when the tab comes back, every ~5 minutes while it's visible, and shortly after each daily scan.
  useEffect(() => {
    const maybe = (minAge: number) => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoaded.current < minAge) return;
      void reload({ quiet: true, background: true });
    };
    const onBack = () => maybe(REFOCUS_STALE_MS);
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    const every = window.setInterval(() => maybe(AUTO_REFRESH_MS - 5000), 60_000);
    // the scan runs at 03:30 UTC and takes a few minutes — look again 10 minutes after it starts
    let afterScan = 0;
    const arm = () => {
      const lag = 10 * 60_000;
      const at = nextScan(Date.now() - lag) + lag;
      afterScan = window.setTimeout(() => {
        maybe(0);
        arm();
      }, Math.min(Math.max(1000, at - Date.now()), 2 ** 31 - 1));
    };
    arm();
    return () => {
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
      window.clearInterval(every);
      window.clearTimeout(afterScan);
    };
  }, [reload]);

  // Demo: another tab edited the sample data → pick it up instead of overwriting it later.
  useEffect(() => store.subscribe?.(() => void reload({ quiet: true, background: true })), [store, reload]);

  const patchJob = useCallback<TrackerData['patchJob']>(
    async (id, patch, opts) => {
      const prev = jobsRef.current.find((j) => j.id === id);
      if (!prev) return false;
      const restore = !!opts?.restore;
      const v = bump(id);
      setJobs((js) => js.map((j) => (j.id === id ? applyJobPatch(j, patch, restore) : j)));
      inFlight.current++;
      try {
        const saved = await store.updateJob(id, patch, { restore });
        if (isLatest(id, v)) setJobs((js) => js.map((j) => (j.id === id ? saved : j)));
        return true;
      } catch (e) {
        if (isLatest(id, v)) {
          // roll back only the fields we touched
          const back: Partial<Job> = {};
          for (const k of Object.keys(patch) as (keyof Job)[]) (back as Record<string, unknown>)[k] = prev[k];
          back.status_updated_at = prev.status_updated_at;
          back.applied_at = prev.applied_at;
          setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...back } : j)));
        }
        if (!opts?.quiet) toast({ tone: 'error', message: `${msg(e)}. Change undone.` });
        return false;
      } finally {
        inFlight.current--;
      }
    },
    [store, toast],
  );

  /** Put a job back exactly as it was — status and both timestamps (so the funnel and timeline stay honest). */
  const restoreJob = useCallback(
    (prev: Job, opts?: { quiet?: boolean }) =>
      patchJob(prev.id, { status: prev.status, status_updated_at: prev.status_updated_at, applied_at: prev.applied_at }, { restore: true, quiet: opts?.quiet }),
    [patchJob],
  );

  const moveJob = useCallback<TrackerData['moveJob']>(
    async (id, status, opts) => {
      const prev = jobsRef.current.find((j) => j.id === id);
      if (!prev || prev.status === status) return false;
      const ok = await patchJob(id, { status });
      if (ok && !opts?.quiet) {
        toast({
          message:
            status === 'archived' ? (
              <>
                Archived <b>{short(prev.title)}</b> — the scanner won't bring it back
              </>
            ) : (
              <>
                Moved <b>{short(prev.title)}</b> to {STATUS_META[status].label}
              </>
            ),
          action: opts?.undo === false ? undefined : { label: 'Undo', onClick: () => void restoreJob(prev) },
        });
      }
      return ok;
    },
    [patchJob, restoreJob, toast],
  );

  const moveJobs = useCallback<TrackerData['moveJobs']>(
    async (ids, status) => {
      const prevs = ids
        .map((id) => jobsRef.current.find((j) => j.id === id))
        .filter((j): j is Job => !!j && j.status !== status);
      if (!prevs.length) return;
      const results = await Promise.all(prevs.map((j) => patchJob(j.id, { status }, { quiet: true })));
      const moved = prevs.filter((_, i) => results[i]);
      const failed = results.length - moved.length;
      if (moved.length) {
        toast({
          message: `Moved ${plural(moved.length, 'job')} to ${STATUS_META[status].label}`,
          action: { label: 'Undo', onClick: () => void Promise.all(moved.map((j) => restoreJob(j, { quiet: true }))) },
        });
      }
      if (failed) toast({ tone: 'error', message: `${plural(failed, 'job')} couldn't be updated — change undone.` });
    },
    [patchJob, restoreJob, toast],
  );

  const addJob = useCallback<TrackerData['addJob']>(
    async (input) => {
      try {
        const job = await store.addJob(input);
        setJobs((js) => [job, ...js]);
        toast({ message: <>Added <b>{job.title}</b></> });
        return job;
      } catch (e) {
        toast({ tone: 'error', message: `${msg(e)}.` });
        return null;
      }
    },
    [store, toast],
  );

  const removeJob = useCallback<TrackerData['removeJob']>(
    (id) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job || pendingJobDeletes.current.has(id)) return false;
      setJobs((js) => js.filter((j) => j.id !== id));
      const putBack = () => setJobs((js) => (js.some((j) => j.id === id) ? js : [...js, job].sort(byFound)));
      const commit = () => {
        const p = pendingJobDeletes.current.get(id);
        if (!p) return;
        window.clearTimeout(p.timer);
        pendingJobDeletes.current.delete(id);
        store.deleteJob(id).then(
          () => clearNotesDraft(id),
          (e) => {
            putBack();
            toast({ tone: 'error', message: `${msg(e)}. It's back on the board.` });
          },
        );
      };
      pendingJobDeletes.current.set(id, { timer: window.setTimeout(commit, UNDO_MS + 250), commit });
      toast({
        message: (
          <>
            Deleted <b>{short(job.title)}</b>
          </>
        ),
        duration: UNDO_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            const p = pendingJobDeletes.current.get(id);
            if (!p) return;
            window.clearTimeout(p.timer);
            pendingJobDeletes.current.delete(id);
            putBack();
          },
        },
      });
      return true;
    },
    [store, toast],
  );

  const addCompany = useCallback<TrackerData['addCompany']>(
    async (input) => {
      try {
        const c = await store.addCompany(input);
        setCompanies((cs) => [...cs, c].sort(byName));
        toast({ message: <>Now watching <b>{c.name}</b> — it'll be scanned on the next run</> });
        return c;
      } catch (e) {
        toast({ tone: 'error', message: `${msg(e)}.` });
        return null;
      }
    },
    [store, toast],
  );

  const patchCompany = useCallback<TrackerData['patchCompany']>(
    async (id, patch, opts) => {
      const prev = companiesRef.current.find((c) => c.id === id);
      if (!prev) return false;
      const v = bump(id);
      setCompanies((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)).sort(byName));
      inFlight.current++;
      try {
        const saved = await store.updateCompany(id, patch);
        if (isLatest(id, v)) setCompanies((cs) => cs.map((c) => (c.id === id ? saved : c)));
        if (!opts?.quiet) toast({ message: opts?.message ?? <>Updated <b>{saved.name}</b></> });
        return true;
      } catch (e) {
        if (isLatest(id, v)) setCompanies((cs) => cs.map((c) => (c.id === id ? prev : c)));
        toast({ tone: 'error', message: `${msg(e)}. Change undone.` });
        return false;
      } finally {
        inFlight.current--;
      }
    },
    [store, toast],
  );

  const removeCompany = useCallback<TrackerData['removeCompany']>(
    (id) => {
      const c = companiesRef.current.find((x) => x.id === id);
      if (!c || pendingCompanyDeletes.current.has(id)) return false;
      const itsJobs = jobsRef.current.filter((j) => j.company_id === id);
      setCompanies((cs) => cs.filter((x) => x.id !== id));
      setJobs((js) => js.filter((j) => j.company_id !== id));
      const putBack = () => {
        setCompanies((cs) => (cs.some((x) => x.id === id) ? cs : [...cs, c].sort(byName)));
        setJobs((js) => [...js, ...itsJobs.filter((j) => !js.some((x) => x.id === j.id))].sort(byFound));
      };
      const commit = () => {
        const p = pendingCompanyDeletes.current.get(id);
        if (!p) return;
        window.clearTimeout(p.timer);
        pendingCompanyDeletes.current.delete(id);
        store.deleteCompany(id).catch((e) => {
          putBack();
          toast({ tone: 'error', message: `${msg(e)}. Nothing was deleted.` });
        });
      };
      pendingCompanyDeletes.current.set(id, { timer: window.setTimeout(commit, UNDO_MS + 250), commit });
      toast({
        message: (
          <>
            Removed <b>{c.name}</b>
            {itsJobs.length ? ` and ${plural(itsJobs.length, 'job')}` : ''}
          </>
        ),
        duration: UNDO_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            const p = pendingCompanyDeletes.current.get(id);
            if (!p) return;
            window.clearTimeout(p.timer);
            pendingCompanyDeletes.current.delete(id);
            putBack();
          },
        },
      });
      return true;
    },
    [store, toast],
  );

  // Leaving the page inside an undo window: send the deletes now (best effort) rather than dropping them.
  useEffect(() => {
    const flush = () => {
      for (const p of [...pendingJobDeletes.current.values(), ...pendingCompanyDeletes.current.values()]) p.commit();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // ── notes: a small per-job save queue with retry + backoff ──
  const notesQ = useRef(new Map<string, NotesEntry>());
  const setNoteState = useCallback((id: string, s: NotesStatus) => setNotesStatus((m) => ({ ...m, [id]: s })), []);

  const pumpNotes = useCallback(
    (id: string) => {
      const e = notesQ.current.get(id);
      if (!e || e.busy) return;
      window.clearTimeout(e.timer);
      e.busy = true;
      e.dirty = false;
      const value = e.value;
      setNoteState(id, { state: 'saving' });
      void patchJob(id, { notes: value.trim() ? value : null }, { quiet: true }).then((ok) => {
        e.busy = false;
        if (e.dirty && e.value !== value) {
          pumpNotes(id); // newer text arrived while this save was on the wire
          return;
        }
        if (ok) {
          notesQ.current.delete(id);
          clearNotesDraft(id);
          setNoteState(id, { state: 'saved' });
          e.waiters.splice(0).forEach((w) => w(true));
          return;
        }
        if (!jobsRef.current.some((j) => j.id === id)) {
          // job is gone (deleted) — nothing left to save into
          notesQ.current.delete(id);
          e.waiters.splice(0).forEach((w) => w(false));
          return;
        }
        const delay = NOTES_BACKOFF[e.attempt];
        e.attempt++;
        if (delay !== undefined) {
          setNoteState(id, { state: 'retrying', retryAt: Date.now() + delay });
          e.timer = window.setTimeout(() => pumpNotes(id), delay);
          return;
        }
        setNoteState(id, { state: 'error' });
        e.waiters.splice(0).forEach((w) => w(false));
        if (e.surface) {
          const title = jobsRef.current.find((j) => j.id === id)?.title ?? 'this job';
          toast({
            tone: 'error',
            duration: 0,
            message: (
              <>
                Couldn't save your notes for <b>{short(title)}</b>. A copy is kept in this browser.
              </>
            ),
            actions: [
              { label: 'Retry', onClick: () => void saveNotesRef.current(id, e.value, { surface: true }) },
              {
                label: 'Copy notes',
                keepOpen: true,
                onClick: () =>
                  void navigator.clipboard?.writeText(e.value).then(
                    () => toast({ tone: 'info', message: 'Notes copied to the clipboard' }),
                    () => {},
                  ),
              },
            ],
          });
        }
      });
    },
    [patchJob, setNoteState, toast],
  );

  const saveNotes = useCallback<TrackerData['saveNotes']>(
    (id, value, opts) => {
      writeNotesDraft(id, value);
      let e = notesQ.current.get(id);
      if (!e) {
        e = { value, attempt: 0, busy: false, dirty: true, surface: false, waiters: [] };
        notesQ.current.set(id, e);
      }
      e.value = value;
      e.dirty = true;
      e.attempt = 0; // fresh input (or an explicit retry) restarts the backoff
      if (opts?.surface) e.surface = true;
      const entry = e;
      return new Promise<boolean>((resolve) => {
        entry.waiters.push(resolve);
        pumpNotes(id);
      });
    },
    [pumpNotes],
  );
  const saveNotesRef = useRef(saveNotes);
  saveNotesRef.current = saveNotes;

  // unsaved notes → let the browser ask before the tab closes (the draft is kept either way)
  useEffect(() => {
    const warn = (ev: BeforeUnloadEvent) => {
      if (notesQ.current.size) ev.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const saveCriteria = useCallback<TrackerData['saveCriteria']>(
    async (patch) => {
      try {
        const saved = await store.saveCriteria(patch);
        setCriteria(saved);
        toast({ message: 'Search criteria saved — the next scan will use them' });
        return true;
      } catch (e) {
        toast({ tone: 'error', message: `${msg(e)}.` });
        return false;
      }
    },
    [store, toast],
  );

  const resetDemo = useCallback(async () => {
    if (!store.resetDemo) return;
    await store.resetDemo();
    await reload();
    toast({ tone: 'info', message: 'Demo data reset to the sample pipeline' });
  }, [store, reload, toast]);

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const value: TrackerData = {
    store,
    state,
    error,
    errorKind: errKind,
    persistent: store.persistent ?? true,
    companies,
    jobs,
    criteria,
    runs,
    companyById,
    reload,
    refreshing,
    moveJob,
    moveJobs,
    patchJob,
    addJob,
    removeJob,
    addCompany,
    patchCompany,
    removeCompany,
    saveCriteria,
    resetDemo,
    saveNotes,
    notesStatus,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
