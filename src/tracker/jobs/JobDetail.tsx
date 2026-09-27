import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  Check,
  Gauge,
  Globe,
  Info,
  LoaderCircle,
  MapPin,
  RotateCw,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { Company, Job } from '@/lib/types';
import { JOB_STATUSES } from '@/lib/types';
import { Monogram, ScoreRing } from '../components/Bits';
import { dateTime, relTime, STATUS_META } from '../lib/format';
import { groupReasons, type Reason, type ReasonKind } from '../lib/reasons';
import { readNotesDraft, useTracker, writeNotesDraft } from '../data';
import styles from './Detail.module.css';

const REASON_ICON: Record<ReasonKind, LucideIcon> = {
  role: Briefcase,
  level: Gauge,
  years: CalendarClock,
  location: MapPin,
  remote: Globe,
  keywords: Check,
  other: Info,
};

function ReasonChip({ r }: { r: Reason }) {
  const Icon = r.negative ? TriangleAlert : REASON_ICON[r.kind];
  return (
    <li className={[styles.reason, r.negative && styles.reasonWarn].filter(Boolean).join(' ')} title={r.full}>
      <Icon size={13.5} aria-hidden="true" />
      <span className="sr-only">{r.full}</span>
      <span aria-hidden="true">{r.text}</span>
    </li>
  );
}

export function JobDetail({ job, company, onClose }: { job: Job; company?: Company; onClose: () => void }) {
  const { moveJob, removeJob, saveNotes, notesStatus } = useTracker();
  // a draft left by a failed save (or a closed tab) wins over the server copy until it lands
  const [init] = useState(() => {
    const server = job.notes ?? '';
    const draft = readNotesDraft(job.id);
    return { text: draft ?? server, server, restored: draft !== null && draft !== server };
  });
  const [notes, setNotes] = useState(init.text);
  const [typing, setTyping] = useState(false);
  const [edited, setEdited] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(notes);
  latest.current = notes;
  /** last value known to be stored on the server */
  const saved = useRef(init.server);
  /** last value handed to the save queue */
  const queued = useRef(init.server);

  const flush = (opts?: { surface?: boolean }) => {
    window.clearTimeout(timer.current);
    setTyping(false);
    const value = latest.current;
    if (value === saved.current && value === queued.current) return;
    queued.current = value;
    void saveNotes(job.id, value, opts).then((ok) => {
      if (ok) saved.current = queued.current;
    });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const onNotes = (v: string) => {
    setNotes(v);
    setTyping(true);
    setEdited(true);
    writeNotesDraft(job.id, v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flushRef.current(), 800);
  };

  useEffect(() => {
    if (init.restored) flushRef.current(); // push the recovered draft
    // closing the drawer: hand pending notes to the queue, which keeps retrying and shows a toast if it gives up
    return () => {
      window.clearTimeout(timer.current);
      if (latest.current !== saved.current) flushRef.current({ surface: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const ns = notesStatus[job.id];
  let saveLabel: ReactNode = null;
  if (typing) saveLabel = 'typing…';
  else if (ns?.state === 'saving')
    saveLabel = (
      <>
        <LoaderCircle size={13} className={styles.spin} aria-hidden="true" /> saving…
      </>
    );
  else if (ns?.state === 'retrying') saveLabel = <span className={styles.err}>couldn't save — retrying…</span>;
  else if (ns?.state === 'error')
    saveLabel = (
      <>
        <span className={styles.err}>couldn't save</span>
        <button type="button" className={styles.retry} onClick={() => flushRef.current()}>
          <RotateCw size={13} aria-hidden="true" /> retry
        </button>
      </>
    );
  else if (ns?.state === 'saved' && (edited || init.restored))
    saveLabel = (
      <>
        saved <Check size={14} aria-hidden="true" />
      </>
    );
  else if (init.restored) saveLabel = 'unsaved draft restored';

  const raw = [
    { key: 'posted', label: 'Posted', at: job.posted_at },
    { key: 'found', label: job.source === 'manual' ? 'Added by hand' : 'Found by scanner', at: job.date_found },
    { key: 'applied', label: 'Applied', at: job.applied_at },
    { key: 'status', label: `Moved to ${STATUS_META[job.status].label}`, at: job.status !== 'new' ? job.status_updated_at : null },
  ].filter((t): t is { key: string; label: string; at: string } => !!t.at);
  raw.sort((a, b) => a.at.localeCompare(b.at));
  // "Applied" and "Moved to Applied" at the same moment are one event
  const timeline = raw.filter(
    (t) => t.key !== 'status' || !raw.some((o) => o !== t && Math.abs(Date.parse(o.at) - Date.parse(t.at)) < 60_000),
  );

  const facts: [string, string | null][] = [
    ['Location', job.location],
    ['Remote', job.remote === null ? null : job.remote ? 'Yes' : 'No'],
    ['Department', job.department],
    ['Type', job.employment_type],
    ['Years required', job.years_required !== null ? `${job.years_required}+` : null],
    ['Source', job.source === 'manual' ? 'Added manually' : 'Scanner'],
    ['Posting', job.is_active ? 'Live' : 'Closed / no longer listed'],
  ];

  const { good, keywords, watch } = groupReasons(job.match_reasons);
  const scraped = job.source === 'scraper';

  const del = () => {
    window.clearTimeout(timer.current);
    saved.current = latest.current; // the draft stays in this browser in case the delete is undone
    onClose();
    removeJob(job.id);
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className={styles.companyRow}>
          <Monogram name={company?.name ?? '?'} size={30} />
          <span className={styles.companyName}>{company?.name ?? 'Unknown company'}</span>
          {!job.is_active && <span className={styles.closed}>closed</span>}
        </div>
        <h2 className={styles.title}>{job.title}</h2>
        {job.url && (
          <a className={styles.link} href={job.url} target="_blank" rel="noreferrer">
            Open posting <ArrowUpRight size={16} aria-hidden="true" />
            <span className="sr-only">(new tab)</span>
          </a>
        )}
      </header>

      <section className={styles.match} aria-label="Match">
        <ScoreRing score={job.match_score} size={62} stroke={5} />
        <div className={styles.matchText}>
          {good.length > 0 || keywords.length > 0 ? (
            <div className={styles.reasonGroup}>
              <span className={styles.sectionLabel}>Why it matched</span>
              {good.length > 0 && (
                <ul className={styles.reasons}>
                  {good.map((r) => (
                    <ReasonChip key={r.text} r={r} />
                  ))}
                </ul>
              )}
              {keywords.length > 0 && (
                <ul className={styles.keywords} aria-label="Keywords it mentions">
                  {keywords.map((k) => (
                    <li key={k}>+{k}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : watch.length === 0 ? (
            <>
              <span className={styles.sectionLabel}>Why it matched</span>
              <p className={styles.muted}>{scraped ? 'The scanner left no reasons for this one.' : 'No match reasons — this job was added by hand.'}</p>
            </>
          ) : null}
          {watch.length > 0 && (
            <div className={styles.reasonGroup}>
              <span className={[styles.sectionLabel, styles.watchLabel].join(' ')}>Watch out</span>
              <ul className={styles.reasons}>
                {watch.map((r) => (
                  <ReasonChip key={r.text} r={r} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="detail-status">
        <h3 id="detail-status" className={styles.sectionLabel}>
          Status
        </h3>
        <div className={styles.statusGrid} role="radiogroup" aria-labelledby="detail-status">
          {JOB_STATUSES.map((s) => {
            const on = job.status === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                className={[styles.statusBtn, on && styles.statusOn].filter(Boolean).join(' ')}
                style={{ '--c': STATUS_META[s].color } as CSSProperties}
                onClick={() => !on && void moveJob(job.id, s)}
                title={STATUS_META[s].hint}
              >
                <span className={styles.statusDot} aria-hidden="true" />
                {STATUS_META[s].label}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="detail-notes">
        <div className={styles.notesHead}>
          <label id="detail-notes" htmlFor="job-notes" className={styles.sectionLabel}>
            Notes
          </label>
          <span className={styles.saveState} aria-live="polite">
            {saveLabel}
          </span>
        </div>
        <textarea
          id="job-notes"
          className={styles.notes}
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          onBlur={() => flushRef.current()}
          placeholder="Recruiter name, referral, interview prep, salary range…"
          rows={6}
        />
      </section>

      <section aria-labelledby="detail-timeline">
        <h3 id="detail-timeline" className={styles.sectionLabel}>
          Timeline
        </h3>
        <ol className={styles.timeline}>
          {timeline.map((t) => (
            <li key={t.key}>
              <span className={styles.tDot} aria-hidden="true" />
              <span className={styles.tLabel}>{t.label}</span>
              <time className={styles.tTime} dateTime={t.at}>
                {dateTime(t.at)} · {relTime(t.at)}
              </time>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="detail-facts">
        <h3 id="detail-facts" className={styles.sectionLabel}>
          Details
        </h3>
        <dl className={styles.facts}>
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
      </section>

      <footer className={styles.foot}>
        <AnimatePresence mode="wait" initial={false}>
          {confirmDelete ? (
            <motion.div key="confirm" className={styles.confirm} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} role="group" aria-label="Confirm delete">
              {scraped ? (
                <p className={styles.confirmText}>
                  <b>Delete for good?</b> The scanner will find this posting again on its next run and add it back as <i>New</i>
                  {latest.current.trim() ? ' — without your notes' : ''}. <b>Archive</b> hides it for good instead.
                </p>
              ) : (
                <p className={styles.confirmText}>
                  <b>Delete this job{latest.current.trim() ? ' and its notes' : ''}?</b> You can undo for a few seconds.
                </p>
              )}
              <span className={styles.confirmBtns}>
                <button type="button" className={styles.cancel} onClick={() => setConfirmDelete(false)} autoFocus>
                  Keep it
                </button>
                {scraped && job.status !== 'archived' && (
                  <button
                    type="button"
                    className={styles.cancel}
                    onClick={() => {
                      onClose();
                      void moveJob(job.id, 'archived');
                    }}
                  >
                    <Archive size={15} aria-hidden="true" /> Archive
                  </button>
                )}
                <button type="button" className={styles.danger} onClick={del}>
                  <Trash2 size={15} aria-hidden="true" /> {scraped ? 'Delete anyway' : 'Delete'}
                </button>
              </span>
            </motion.div>
          ) : (
            <motion.div key="actions" className={styles.footActions} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {scraped && job.status !== 'archived' && (
                <button
                  type="button"
                  className={styles.archiveBtn}
                  onClick={() => {
                    onClose();
                    void moveJob(job.id, 'archived');
                  }}
                  title="Hide it from the board — the scanner won't bring it back"
                >
                  <Archive size={15} aria-hidden="true" /> Archive
                </button>
              )}
              <button type="button" className={styles.deleteLink} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} aria-hidden="true" /> {scraped ? 'Delete permanently…' : 'Delete job'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </div>
  );
}
