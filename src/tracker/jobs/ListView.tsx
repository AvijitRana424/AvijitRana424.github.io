import { useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, ChevronDown, ChevronRight, Ellipsis, MapPin, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { Company, Job, JobStatus } from '@/lib/types';
import { JOB_STATUSES } from '@/lib/types';
import { Monogram, ScoreRing, StatusPill, Switch } from '../components/Bits';
import { EmptyState } from '../components/EmptyState';
import { Menu, StatusMenu } from '../components/Menu';
import { useMediaQuery } from '../components/Drawer';
import { ago, relTime, STATUS_META } from '../lib/format';
import form from '../components/Form.module.css';
import styles from './List.module.css';

export interface ListFilters {
  company: string;
  statuses: JobStatus[];
  minScore: number;
  activeOnly: boolean;
}

export const DEFAULT_FILTERS: ListFilters = { company: '', statuses: [], minScore: 0, activeOnly: false };

type SortKey = 'title' | 'company' | 'location' | 'score' | 'found' | 'status';

interface Props {
  jobs: Job[];
  companies: Company[];
  companyById: Map<string, Company>;
  filters: ListFilters;
  setFilters: (f: ListFilters) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, s: JobStatus) => void;
  onMoveMany: (ids: string[], s: JobStatus) => void;
  /** asks first (see DeleteJobDialog) */
  onDelete: (id: string) => void;
}

const QUICK: JobStatus[] = ['applied', 'interview', 'rejected'];

export function applyListFilters(jobs: Job[], f: ListFilters) {
  return jobs.filter(
    (j) =>
      (!f.company || j.company_id === f.company) &&
      (!f.statuses.length || f.statuses.includes(j.status)) &&
      j.match_score >= f.minScore &&
      (!f.activeOnly || j.is_active),
  );
}

export function ListView({ jobs, companies, companyById, filters, setFilters, onOpen, onMove, onMoveMany, onDelete }: Props) {
  const reduce = useReducedMotion();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'found', dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const narrow = useMediaQuery('(max-width: 900px)');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const rows = useMemo(() => {
    const name = (j: Job) => companyById.get(j.company_id)?.name ?? '';
    const val = (j: Job): string | number => {
      switch (sort.key) {
        case 'title':
          return j.title.toLowerCase();
        case 'company':
          return name(j).toLowerCase();
        case 'location':
          return (j.location ?? '').toLowerCase();
        case 'score':
          return j.match_score;
        case 'found':
          return j.date_found;
        case 'status':
          return JOB_STATUSES.indexOf(j.status);
      }
    };
    return applyListFilters(jobs, filters).sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [jobs, filters, sort, companyById]);

  const visibleIds = rows.map((r) => r.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allOn = rows.length > 0 && selectedVisible.length === rows.length;
  const someOn = selectedVisible.length > 0 && !allOn;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setSortKey = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'score' || key === 'found' ? -1 : 1 }));

  const th = (key: SortKey, label: string, cls?: string) => {
    const on = sort.key === key;
    const Icon = !on ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th className={cls} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} scope="col">
        <button type="button" className={[styles.sortBtn, on && styles.sortOn].filter(Boolean).join(' ')} onClick={() => setSortKey(key)}>
          {label}
          <Icon size={13} aria-hidden="true" />
        </button>
      </th>
    );
  };

  const activeCount = (filters.company ? 1 : 0) + (filters.statuses.length ? 1 : 0) + (filters.minScore > 0 ? 1 : 0) + (filters.activeOnly ? 1 : 0);
  const filtersActive = activeCount > 0;
  const showFilters = !narrow || filtersOpen;

  return (
    <div className={styles.panel}>
      {narrow && (
        <div className={styles.filterToggleRow}>
          <button
            type="button"
            className={styles.filterToggle}
            aria-expanded={filtersOpen}
            aria-controls="list-filters"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filters
            {activeCount > 0 && <span className={styles.filterCount}>{activeCount}</span>}
            <ChevronDown size={15} className={filtersOpen ? styles.flip : undefined} aria-hidden="true" />
          </button>
          {filtersActive && (
            <button type="button" className={styles.clear} onClick={() => setFilters(DEFAULT_FILTERS)}>
              <X size={14} aria-hidden="true" /> Clear
            </button>
          )}
        </div>
      )}
      <div className={styles.filters} role="group" aria-label="Filters" id="list-filters" hidden={!showFilters}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Company</span>
          <select className={form.select} value={filters.company} onChange={(e) => setFilters({ ...filters, company: e.target.value })}>
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.filterField}>
          <span className={styles.filterLabel} id="status-filter-label">
            Status
          </span>
          <div className={styles.chips} role="group" aria-labelledby="status-filter-label">
            {JOB_STATUSES.map((s) => {
              const on = filters.statuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  className={[styles.chip, on && styles.chipOn].filter(Boolean).join(' ')}
                  style={{ '--c': STATUS_META[s].color } as CSSProperties}
                  onClick={() =>
                    setFilters({ ...filters, statuses: on ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s] })
                  }
                >
                  <span className={styles.chipDot} aria-hidden="true" />
                  {STATUS_META[s].label}
                </button>
              );
            })}
          </div>
        </div>
        <label className={[styles.filterField, styles.sliderField].join(' ')}>
          <span className={styles.filterLabel}>
            Min score <b className={styles.sliderVal}>{filters.minScore}</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minScore}
            className={styles.slider}
            style={{ '--p': `${filters.minScore}%` } as CSSProperties}
            onChange={(e) => setFilters({ ...filters, minScore: Number(e.target.value) })}
          />
        </label>
        <div className={styles.filterEnd}>
          <Switch checked={filters.activeOnly} onChange={(v) => setFilters({ ...filters, activeOnly: v })} label="Active only" />
          {filtersActive && !narrow ? (
            <button type="button" className={styles.clear} onClick={() => setFilters(DEFAULT_FILTERS)}>
              <X size={14} aria-hidden="true" /> Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.summary} aria-live="polite">
        Showing <b>{rows.length}</b> of {jobs.length} jobs
      </div>

      {rows.length === 0 ? (
        <EmptyState tone="paper" kind="search" title="No jobs match these filters">
          Loosen the filters or clear the search to see everything.
        </EmptyState>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.cCheck} scope="col">
                  <input
                    type="checkbox"
                    className={styles.check}
                    aria-label={allOn ? 'Deselect all' : 'Select all shown jobs'}
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = someOn;
                    }}
                    onChange={() => setSelected(allOn ? new Set() : new Set(visibleIds))}
                  />
                </th>
                {th('title', 'Role', styles.cTitle)}
                {th('company', 'Company', styles.cCompany)}
                {th('location', 'Location', styles.cLoc)}
                {th('score', 'Score', styles.cScore)}
                {th('found', 'Found', styles.cFound)}
                {th('status', 'Status', styles.cStatus)}
                <th className={styles.cActions} scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((j) => {
                  const c = companyById.get(j.company_id);
                  const sel = selected.has(j.id);
                  return (
                    <motion.tr
                      key={j.id}
                      layout={reduce ? false : 'position'}
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className={[styles.row, sel && styles.rowSel, !j.is_active && styles.rowClosed].filter(Boolean).join(' ')}
                    >
                      <td className={styles.cCheck}>
                        <label className={styles.checkHit}>
                          <input type="checkbox" className={styles.check} checked={sel} onChange={() => toggle(j.id)} aria-label={`Select ${j.title}`} />
                        </label>
                      </td>
                      <td className={styles.cTitle}>
                        <button type="button" className={styles.titleBtn} onClick={() => onOpen(j.id)}>
                          {j.title}
                        </button>
                        <span className={styles.tags}>
                          {!j.is_active && <span className={styles.closedTag}>closed</span>}
                          {j.source === 'manual' && <span className={styles.manualTag}>manual</span>}
                          {j.remote && !/remote/i.test(j.location ?? '') && <span className={styles.remoteTag}>remote</span>}
                        </span>
                      </td>
                      <td className={styles.cCompany}>
                        <span className={styles.companyCell}>
                          <Monogram name={c?.name ?? '?'} size={22} />
                          <span>{c?.name ?? 'Unknown'}</span>
                        </span>
                      </td>
                      <td className={styles.cLoc}>
                        <span className={styles.locCell}>
                          <MapPin size={12.5} aria-hidden="true" />
                          {j.location ?? '—'}
                        </span>
                      </td>
                      <td className={styles.cScore}>
                        <ScoreRing score={j.match_score} size={32} />
                      </td>
                      <td className={styles.cFound}>
                        <time dateTime={j.date_found} title={relTime(j.date_found)}>
                          {ago(j.date_found)} ago
                        </time>
                      </td>
                      <td className={styles.cStatus}>
                        <StatusPill status={j.status} />
                      </td>
                      <td className={styles.cActions}>
                        <span className={styles.quick}>
                          {!narrow &&
                            QUICK.map((s) => (
                              <button
                                key={s}
                                type="button"
                                className={[styles.quickBtn, j.status === s && styles.quickOn].filter(Boolean).join(' ')}
                                style={{ '--c': STATUS_META[s].color } as CSSProperties}
                                aria-pressed={j.status === s}
                                disabled={j.status === s}
                                onClick={() => onMove(j.id, s)}
                                aria-label={`Mark ${j.title} as ${STATUS_META[s].label}`}
                              >
                                {STATUS_META[s].label}
                              </button>
                            ))}
                          <Menu
                            label={`More actions for ${j.title}`}
                            triggerClassName={styles.more}
                            trigger={<Ellipsis size={16} />}
                            width={230}
                            items={[
                              // phones get every status here instead of the quick buttons
                              ...JOB_STATUSES.filter((s) => s !== 'archived' && (narrow || !QUICK.includes(s))).map((s) => ({
                                key: s,
                                label: `Move to ${STATUS_META[s].label}`,
                                swatch: STATUS_META[s].color,
                                disabled: j.status === s,
                                onSelect: () => onMove(j.id, s),
                              })),
                              ...(j.status !== 'archived'
                                ? [
                                    {
                                      key: 'archive',
                                      label: 'Archive',
                                      icon: <Archive />,
                                      onSelect: () => onMove(j.id, 'archived'),
                                    },
                                  ]
                                : []),
                              ...(j.url
                                ? [
                                    {
                                      key: 'open',
                                      label: 'Open posting',
                                      icon: <ArrowUpRight />,
                                      onSelect: () => window.open(j.url!, '_blank', 'noopener'),
                                    },
                                  ]
                                : []),
                              { key: 'details', label: 'Details & notes', icon: <ChevronRight />, onSelect: () => onOpen(j.id) },
                              {
                                key: 'delete',
                                label: j.source === 'scraper' ? 'Delete permanently…' : 'Delete…',
                                icon: <Trash2 />,
                                danger: true,
                                onSelect: () => onDelete(j.id),
                              },
                            ]}
                          />
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {selectedVisible.length > 0 && (
          <motion.div
            className={styles.bulk}
            role="region"
            aria-label="Bulk actions"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, rotate: -1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 30 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <span className={styles.bulkCount}>
              <b>{selectedVisible.length}</b> selected
            </span>
            <StatusMenu
              label="Set status for selected jobs"
              triggerClassName={styles.bulkBtn}
              trigger={
                <>
                  Set status <ChevronDown size={15} aria-hidden="true" />
                </>
              }
              onSelect={(s) => {
                onMoveMany(selectedVisible, s);
                setSelected(new Set());
              }}
            />
            <button type="button" className={styles.bulkClear} onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
