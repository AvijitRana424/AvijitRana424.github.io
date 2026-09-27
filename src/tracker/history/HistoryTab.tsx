import { useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Mail, MailX, TriangleAlert } from 'lucide-react';
import type { FetchRun } from '@/lib/types';
import { RunPill, Skeleton } from '../components/Bits';
import { EmptyState } from '../components/EmptyState';
import { useTracker } from '../data';
import { dateTime, duration, num, plural, relTime, RUN_META, scanTimeLocal } from '../lib/format';
import styles from './History.module.css';

function RunCard({ run, index }: { run: FetchRun; index: number }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  return (
    <motion.li
      className={styles.item}
      style={{ '--c': RUN_META[run.status].color } as CSSProperties}
      initial={reduce ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26, delay: reduce ? 0 : Math.min(index, 8) * 0.05 }}
    >
      <span className={styles.node} aria-hidden="true" />
      <article className={styles.card} style={{ '--tilt': `${index % 2 ? 0.35 : -0.35}deg` } as CSSProperties}>
        <header className={styles.head}>
          <div className={styles.when}>
            <time dateTime={run.started_at} className={styles.date}>
              {dateTime(run.started_at)}
            </time>
            <span className={styles.rel}>{relTime(run.started_at)}</span>
          </div>
          <span className={styles.trigger}>{run.trigger}</span>
          <RunPill status={run.status} />
        </header>
        <dl className={styles.stats}>
          <div>
            <dt>took</dt>
            <dd>{duration(run.started_at, run.finished_at)}</dd>
          </div>
          <div>
            <dt>companies</dt>
            <dd>{num(run.companies_checked)}</dd>
          </div>
          <div>
            <dt>postings scanned</dt>
            <dd>{num(run.jobs_scanned)}</dd>
          </div>
          <div>
            <dt>new matches</dt>
            <dd className={run.new_matches ? styles.hot : undefined}>{num(run.new_matches)}</dd>
          </div>
          <div>
            <dt>email</dt>
            <dd className={styles.mail}>
              {run.email_sent ? <Mail size={16} aria-label="sent" /> : <MailX size={16} aria-label="not sent" />}
              <span aria-hidden="true">{run.email_sent ? 'sent' : '—'}</span>
            </dd>
          </div>
        </dl>
        {run.errors.length > 0 && (
          <>
            <button
              type="button"
              className={styles.errToggle}
              aria-expanded={open}
              aria-controls={`errs-${run.id}`}
              onClick={() => setOpen((o) => !o)}
            >
              <TriangleAlert size={15} aria-hidden="true" />
              {plural(run.errors.length, 'error')}
              <ChevronDown size={15} className={open ? styles.flip : undefined} aria-hidden="true" />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.ul
                  id={`errs-${run.id}`}
                  className={styles.errors}
                  initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  {run.errors.map((e, i) => (
                    <li key={i}>
                      <b>{e.company}</b> <span>{e.message}</span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </>
        )}
      </article>
    </motion.li>
  );
}

export function HistoryTab() {
  const { runs, state } = useTracker();
  const reduce = useReducedMotion();

  const summary = useMemo(() => {
    if (!runs.length) return null;
    const ok = runs.filter((r) => r.status === 'success').length;
    const secs = runs
      .filter((r) => r.finished_at)
      .map((r) => (new Date(r.finished_at!).getTime() - new Date(r.started_at).getTime()) / 1000);
    const avg = secs.length ? secs.reduce((a, b) => a + b, 0) / secs.length : 0;
    return {
      rate: Math.round((ok / runs.length) * 100),
      avg: avg < 60 ? `${Math.round(avg)}s` : `${Math.floor(avg / 60)}m ${Math.round(avg % 60)}s`,
      matches: runs.reduce((a, r) => a + r.new_matches, 0),
      bars: [...runs].reverse(),
    };
  }, [runs]);

  if (state === 'loading') {
    return (
      <div className={styles.wrap} aria-busy="true">
        <Skeleton h={110} r={14} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} h={130} r={12} />
        ))}
      </div>
    );
  }

  if (!runs.length || !summary) {
    return (
      <EmptyState kind="clock" title="No scans yet">
        The GitHub Action runs every day at 03:30 UTC ({scanTimeLocal()} your time). Each run shows up here with its counts and any
        errors.
      </EmptyState>
    );
  }

  const maxBar = Math.max(1, ...summary.bars.map((r) => r.new_matches));

  return (
    <div className={styles.layout}>
      <ol className={styles.timeline} aria-label="Scan runs, newest first">
        {runs.map((r, i) => (
          <RunCard key={r.id} run={r} index={i} />
        ))}
      </ol>
      <aside className={styles.summary} aria-label="Scan summary">
        <div className={styles.sumStats}>
          <div>
            <span className={styles.sumNum}>{summary.rate}%</span>
            <span className={styles.sumLabel}>clean runs</span>
          </div>
          <div>
            <span className={styles.sumNum}>{summary.avg}</span>
            <span className={styles.sumLabel}>avg duration</span>
          </div>
          <div>
            <span className={styles.sumNum}>{summary.matches}</span>
            <span className={styles.sumLabel}>new matches</span>
          </div>
        </div>
        <figure className={styles.chart}>
          <figcaption className={styles.chartCap}>New matches per run · last {plural(runs.length, 'run')}</figcaption>
          <div className={styles.bars} role="list">
            {summary.bars.map((r, i) => (
              <div
                key={r.id}
                role="listitem"
                className={styles.barCol}
                title={`${dateTime(r.started_at)} — ${plural(r.new_matches, 'new match', 'new matches')} (${RUN_META[r.status].label})`}
                aria-label={`${dateTime(r.started_at)}: ${plural(r.new_matches, 'new match', 'new matches')}, ${RUN_META[r.status].label}`}
              >
                <span className={styles.barVal}>{r.new_matches}</span>
                <motion.span
                  className={styles.bar}
                  style={{ '--c': RUN_META[r.status].color } as CSSProperties}
                  initial={reduce ? false : { height: 0 }}
                  whileInView={{ height: `${Math.max(6, (r.new_matches / maxBar) * 100)}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            ))}
          </div>
          <ul className={styles.legend} aria-label="Legend">
            {(['success', 'partial', 'failed'] as const).map((k) => (
              <li key={k}>
                <span style={{ background: RUN_META[k].color }} aria-hidden="true" />
                {RUN_META[k].label}
              </li>
            ))}
          </ul>
        </figure>
        <p className={styles.sumNote}>
          Runs come from the <b>job-fetch</b> GitHub Action — daily at 03:30 UTC, or whenever you trigger it by hand.
        </p>
      </aside>
    </div>
  );
}
