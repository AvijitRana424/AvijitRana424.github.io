import { useCallback, useEffect, useMemo, useState } from 'react';
import { Kanban, List, Plus, Search, X } from 'lucide-react';
import type { Job, JobStatus } from '@/lib/types';
import { Button } from '@/ui';
import { Segmented, Skeleton, Switch } from '../components/Bits';
import { Drawer } from '../components/Drawer';
import { EmptyState } from '../components/EmptyState';
import { useTracker } from '../data';
import { scanTimeLocal } from '../lib/format';
import form from '../components/Form.module.css';
import { AddJobModal } from './AddJobModal';
import { Board } from './Board';
import { DeleteJobDialog } from './DeleteJobDialog';
import { JobDetail } from './JobDetail';
import { DEFAULT_FILTERS, ListView, type ListFilters } from './ListView';
import styles from './Jobs.module.css';

type View = 'board' | 'list';
const VIEW_KEY = 'job-radar-view';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}

export function JobsTab({ onGoCompanies }: { onGoCompanies: () => void }) {
  const { state, jobs, companies, companyById, moveJob, moveJobs, removeJob } = useTracker();
  const [view, setViewState] = useState<View>(readView);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Job | null>(null);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((j) =>
      [j.title, companyById.get(j.company_id)?.name, j.location, j.notes, j.department]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(needle)),
    );
  }, [jobs, q, companyById]);

  // archived jobs stay out of both views unless asked for (or filtered for explicitly in the list)
  const visible = useMemo(
    () => (showArchived || filters.statuses.includes('archived') ? searched : searched.filter((j) => j.status !== 'archived')),
    [searched, showArchived, filters.statuses],
  );

  const onMove = useCallback((id: string, s: JobStatus) => void moveJob(id, s), [moveJob]);
  const onAskDelete = useCallback((id: string) => setDeleting(jobs.find((j) => j.id === id) ?? null), [jobs]);
  const onOpen = useCallback((id: string) => setOpenId(id), []);
  const closeDrawer = useCallback(() => setOpenId(null), []);
  const closeAdd = useCallback(() => setAdding(false), []);

  const openJob = openId ? jobs.find((j) => j.id === openId) : undefined;
  useEffect(() => {
    if (openId && state === 'ready' && !openJob) setOpenId(null);
  }, [openId, openJob, state]);

  const archivedCount = jobs.filter((j) => j.status === 'archived').length;

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        <span className={styles.seg}>
        <Segmented<View>
          label="Jobs view"
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: 'Board', icon: <Kanban /> },
            { value: 'list', label: 'List', icon: <List /> },
          ]}
        />
        </span>
        <label className={[form.searchWrap, styles.search].join(' ')}>
          <Search size={16} className={form.searchIcon} aria-hidden="true" />
          <span className="sr-only">Search jobs</span>
          <input
            className={form.chalkInput}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, company, location, notes…"
          />
          {q && (
            <button type="button" className={styles.clearSearch} onClick={() => setQ('')} aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </label>
        <div className={styles.toolbarEnd}>
          <span className={styles.archived}>
            <Switch tone="board" checked={showArchived} onChange={setShowArchived} label={`Show archived${archivedCount ? ` (${archivedCount})` : ''}`} />
          </span>
          <span className={styles.add}>
            <Button variant="marker" icon={<Plus />} onClick={() => setAdding(true)} disabled={!companies.length && state === 'ready'}>
              Add job
            </Button>
          </span>
        </div>
      </div>

      {state === 'loading' ? (
        <div className={styles.skelBoard} aria-busy="true" aria-label="Loading jobs">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skelCol}>
              <Skeleton h={22} w="60%" />
              {Array.from({ length: 3 - (i % 3) }).map((__, k) => (
                <Skeleton key={k} h={118} r={10} />
              ))}
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          kind="radar"
          title="Nothing on the radar yet"
          action={
            companies.length ? (
              <Button variant="paper" icon={<Plus />} onClick={() => setAdding(true)}>
                Add a job by hand
              </Button>
            ) : (
              <Button variant="paper" onClick={onGoCompanies}>
                Add your first company
              </Button>
            )
          }
        >
          The scanner checks every company you watch each day at {scanTimeLocal()} and drops matching roles here.
        </EmptyState>
      ) : q.trim() && searched.length === 0 ? (
        <EmptyState
          kind="search"
          title={
            <>
              No jobs match <q className={styles.query}>{q.trim()}</q>
            </>
          }
          action={
            <Button variant="paper" icon={<X />} onClick={() => setQ('')}>
              Clear search
            </Button>
          }
        >
          Search looks at titles, companies, locations, departments and your notes.
        </EmptyState>
      ) : view === 'board' ? (
        <Board jobs={visible} companyById={companyById} showArchived={showArchived} searching={!!q.trim()} onOpen={onOpen} onMove={onMove} />
      ) : (
        <ListView
          jobs={visible}
          companies={companies}
          companyById={companyById}
          filters={filters}
          setFilters={setFilters}
          onOpen={onOpen}
          onMove={onMove}
          onMoveMany={(ids, s) => void moveJobs(ids, s)}
          onDelete={onAskDelete}
        />
      )}

      <DeleteJobDialog job={deleting} onClose={() => setDeleting(null)} onArchive={(id) => void moveJob(id, 'archived')} onDelete={(id) => removeJob(id)} />

      <Drawer open={!!openJob} onClose={closeDrawer} label={openJob ? `Job details: ${openJob.title}` : 'Job details'}>
        {openJob && <JobDetail key={openJob.id} job={openJob} company={companyById.get(openJob.company_id)} onClose={closeDrawer} />}
      </Drawer>

      <AddJobModal open={adding} onClose={closeAdd} />
    </div>
  );
}
