import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronDown, Mail, MailX, TriangleAlert } from 'lucide-react';
import type { FetchRun } from '@/lib/types';
import { scanWorkflowUrl } from '@/config';
import { Tape } from '@/ui';
import { RunPill, Tooltip } from './Bits';
import { useMediaQuery } from './Drawer';
import { clockTime, countdown, dateTime, duration, nextScan, num, plural, relTime } from '../lib/format';
import styles from './ScanStrip.module.css';

/** Ticking clock that stops while the tab is hidden (or `active` is false) and catches up on return. */
function useNow(intervalMs: number, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let t = 0;
    const stop = () => {
      window.clearInterval(t);
      t = 0;
    };
    const sync = () => {
      stop();
      if (!active || document.hidden) return;
      setNow(Date.now());
      t = window.setInterval(() => setNow(Date.now()), intervalMs);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [intervalMs, active]);
  return now;
}

function NextScan() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const now = useNow(1000, inView);
  const next = nextScan(now);
  const inHours = (next - now) / 3_600_000;
  const day = new Date(next).toDateString() === new Date(now).toDateString() ? 'today' : 'tomorrow';
  return (
    <div className={styles.block} ref={ref}>
      <span className={styles.label}>Next scan</span>
      <span className={styles.countdown} aria-label={`Next scan in ${Math.floor(inHours)} hours ${Math.floor((inHours % 1) * 60)} minutes`}>
        {countdown(next - now)}
      </span>
      <span className={[styles.sub, styles.wrapSub].join(' ')}>
        {day}, {clockTime(next)} <span className={styles.faint}>· daily 03:30 UTC</span>
      </span>
    </div>
  );
}

function RunButton() {
  if (scanWorkflowUrl) {
    return (
      <a className={styles.run} href={scanWorkflowUrl} target="_blank" rel="noreferrer">
        Run scan now <ArrowUpRight size={17} aria-hidden="true" />
        <span className="sr-only">(opens GitHub Actions in a new tab)</span>
      </a>
    );
  }
  return (
    <Tooltip
      side="bottom"
      tip={
        <>
          Set <code>VITE_GITHUB_REPO=owner/repo</code> in <code>.env.local</code> (and the deploy workflow) to link this
          button to the <b>job-fetch</b> GitHub Action. Then “Run workflow” there triggers a scan.
        </>
      }
    >
      {(id) => (
        <button type="button" className={[styles.run, styles.runOff].join(' ')} aria-disabled="true" aria-describedby={id}>
          Run scan now <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      )}
    </Tooltip>
  );
}

export function ScanStrip({ runs, loading }: { runs: FetchRun[]; loading?: boolean }) {
  const [openErrors, setOpenErrors] = useState(false);
  const reduce = useReducedMotion();
  const now = useNow(30_000); // keep "3h ago" fresh
  const last = runs[0];
  // phones: one tappable line instead of a 700px panel, so the board is reachable
  const narrow = useMediaQuery('(max-width: 640px)');
  const [expanded, setExpanded] = useState(false);
  const showGrid = !narrow || expanded;

  return (
    <section className={styles.strip} aria-label="Scanner status">
      <Tape className={styles.tape} />
      {narrow && (
        <button
          type="button"
          className={styles.summary}
          aria-expanded={expanded}
          aria-controls="scan-details"
          onClick={() => setExpanded((o) => !o)}
        >
          {/* always two lines (loading included), so the page below never jumps */}
          <span className={styles.summaryText}>
            {loading ? (
              <>
                <span className={styles.summaryLine} aria-hidden="true">
                  <span className={styles.skelText}>Last scan 3 hours ago</span>
                </span>
                <span className={styles.summaryLine} aria-hidden="true">
                  <span className={styles.skelText}>3 new · next scan 09:00 am</span>
                </span>
              </>
            ) : (
              <>
                <span className={styles.summaryLine}>
                  <b>Last scan</b>{' '}
                  {last ? (last.status === 'running' ? 'running now' : relTime(last.finished_at ?? last.started_at, now)) : 'not run yet'}
                  {last && <RunPill status={last.status} />}
                </span>
                <span className={styles.summaryLine}>
                  {last && <span>{num(last.new_matches)} new</span>}
                  {last && last.errors.length > 0 && <span className={[styles.dotSep, styles.errWord].join(' ')}>{plural(last.errors.length, 'error')}</span>}
                  <span className={last ? styles.dotSep : undefined}>next scan {clockTime(nextScan(now))}</span>
                </span>
              </>
            )}
          </span>
          <ChevronDown size={17} className={expanded ? styles.flip : undefined} aria-hidden="true" />
          <span className="sr-only">{expanded ? 'Hide scanner details' : 'Show scanner details'}</span>
        </button>
      )}
      <div className={styles.grid} id="scan-details" hidden={!showGrid}>
        <div className={styles.block}>
          <span className={styles.label}>Last scan</span>
          {loading ? (
            // same elements + text as the loaded state (just invisible), so nothing below shifts when data lands
            <>
              <span className={styles.value} aria-hidden="true">
                <span className={styles.skelText}>3 hours ago</span>
              </span>
              <span className={styles.sub} aria-hidden="true">
                <span className={styles.skelText}>Sun, 27 Sept, 09:00 am · schedule</span>
              </span>
            </>
          ) : last ? (
            <>
              <span className={styles.value}>
                {last.status === 'running' ? 'Scanning now…' : relTime(last.finished_at ?? last.started_at)}
                <RunPill status={last.status} />
              </span>
              <span className={styles.sub}>
                {dateTime(last.started_at)} · {last.trigger} · took {duration(last.started_at, last.finished_at)}
              </span>
            </>
          ) : (
            <>
              <span className={styles.value}>No scans yet</span>
              <span className={styles.sub}>The first scheduled scan will appear here.</span>
            </>
          )}
        </div>

        <dl className={styles.stats}>
          <div>
            <dt>Companies</dt>
            <dd>{loading ? '–' : num(last?.companies_checked ?? 0)}</dd>
          </div>
          <div>
            <dt>Scanned</dt>
            <dd>{loading ? '–' : num(last?.jobs_scanned ?? 0)}</dd>
          </div>
          <div>
            <dt>New matches</dt>
            <dd className={last?.new_matches ? styles.hot : undefined}>{loading ? '–' : num(last?.new_matches ?? 0)}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd className={styles.email}>
              {last?.email_sent ? (
                <>
                  <Mail size={16} aria-hidden="true" /> sent
                </>
              ) : (
                <>
                  <MailX size={16} aria-hidden="true" /> {last ? 'not sent' : '–'}
                </>
              )}
            </dd>
          </div>
        </dl>

        <NextScan />

        <div className={styles.cta}>
          <RunButton />
          {last && last.errors.length > 0 && (
            <button
              type="button"
              className={styles.errToggle}
              aria-expanded={openErrors}
              aria-controls="scan-errors"
              onClick={() => setOpenErrors((o) => !o)}
            >
              <TriangleAlert size={15} aria-hidden="true" />
              {plural(last.errors.length, 'error')}
              <ChevronDown size={15} className={openErrors ? styles.flip : undefined} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {openErrors && last && showGrid && (
          <motion.ul
            id="scan-errors"
            className={styles.errors}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {last.errors.map((e, i) => (
              <li key={i}>
                <b>{e.company}</b>
                <span>{e.message}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}
