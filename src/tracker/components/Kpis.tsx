import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { Company, Job } from '@/lib/types';
import { CountUp, TiltCard } from '@/ui';
import { Skeleton } from './Bits';
import { useMediaQuery } from './Drawer';
import styles from './Kpis.module.css';

interface Props {
  jobs: Job[];
  companies: Company[];
  loading?: boolean;
}

/** CountUp on first view; afterwards tween smoothly from the previous value (no recount from 0). */
function LiveNumber({ value }: { value: number }) {
  const first = useRef(value);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (value !== first.current) setChanged(true);
  }, [value]);
  return changed ? <Tween from={first.current} value={value} /> : <CountUp value={value} duration={1.1} />;
}

function Tween({ from, value }: { from: number; value: number }) {
  const reduce = useReducedMotion();
  const prev = useRef(from);
  const [n, setN] = useState(from);
  useEffect(() => {
    if (reduce) {
      setN(value);
      prev.current = value;
      return;
    }
    const c = animate(prev.current, value, { duration: 0.45, ease: [0.22, 1, 0.36, 1], onUpdate: setN });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce]);
  return <span>{Math.round(n)}</span>;
}

const reachedApplied = (j: Job) => !!j.applied_at || ['applied', 'interview', 'offer'].includes(j.status);
const reachedInterview = (j: Job) => j.status === 'interview' || j.status === 'offer';

export function Kpis({ jobs, companies, loading }: Props) {
  const reduce = useReducedMotion();
  const k = useMemo(() => {
    const active = companies.filter((c) => c.active).length;
    const count = (s: Job['status']) => jobs.filter((j) => j.status === s).length;
    return {
      tiles: [
        { key: 'companies', label: 'Companies tracked', value: active, sub: companies.length > active ? `${companies.length - active} paused` : 'all watching', color: 'var(--chalk-blue)' },
        { key: 'matches', label: 'Matches found', value: jobs.filter((j) => j.is_active).length, sub: 'postings still live', color: 'var(--kraft)' },
        { key: 'new', label: 'New', value: count('new'), sub: 'waiting for review', color: 'var(--st-new)' },
        { key: 'applied', label: 'Applied', value: count('applied'), sub: 'awaiting reply', color: 'var(--st-applied)' },
        { key: 'interview', label: 'Interviews', value: count('interview'), sub: 'in the loop', color: 'var(--st-interview)' },
        { key: 'offer', label: 'Offers', value: count('offer'), sub: 'on the table', color: 'var(--st-offer)' },
      ],
      funnel: [
        { key: 'found', label: 'Found', value: jobs.length, color: 'var(--st-new)' },
        { key: 'applied', label: 'Applied', value: jobs.filter(reachedApplied).length, color: 'var(--st-applied)' },
        { key: 'interview', label: 'Interview', value: jobs.filter(reachedInterview).length, color: 'var(--st-interview)' },
        { key: 'offer', label: 'Offer', value: jobs.filter((j) => j.status === 'offer').length, color: 'var(--st-offer)' },
      ],
    };
  }, [jobs, companies]);

  const max = Math.max(1, k.funnel[0].value);
  // phones: a one-line pipeline summary; the tiles + funnel open on tap
  const narrow = useMediaQuery('(max-width: 640px)');
  const [open, setOpen] = useState(false);
  const showAll = !narrow || open;
  const brief = [
    { key: 'new', one: 'new', many: 'new' },
    { key: 'applied', one: 'applied', many: 'applied' },
    { key: 'interview', one: 'interview', many: 'interviews' },
    { key: 'offer', one: 'offer', many: 'offers' },
  ].map((b) => ({ ...b, tile: k.tiles.find((t) => t.key === b.key)! }));

  return (
    <section className={[styles.wrap, narrow && styles.wrapNarrow].filter(Boolean).join(' ')} aria-label="Pipeline summary">
      {narrow && (
        <button type="button" className={styles.summary} aria-expanded={open} aria-controls="kpi-details" onClick={() => setOpen((o) => !o)}>
          <span className={styles.briefs}>
            {brief.map((b) => (
              <span key={b.key} className={styles.brief} style={{ '--c': b.tile.color } as CSSProperties}>
                <b>{loading ? '–' : b.tile.value}</b> {b.tile.value === 1 ? b.one : b.many}
              </span>
            ))}
          </span>
          <span className={styles.summaryMore}>
            {open ? 'less' : 'stats'}
            <ChevronDown size={16} className={open ? styles.flip : undefined} aria-hidden="true" />
          </span>
        </button>
      )}
      <div id="kpi-details" className={styles.details} hidden={!showAll}>
      <ul className={styles.tiles}>
        {k.tiles.map((t, i) => (
          <li key={t.key} className={styles.tileItem}>
            <TiltCard max={7} lift={14} rest={[-0.8, 0.6, -0.4, 0.9, -0.6, 0.5][i]} className={styles.tiltWrap}>
              <div className={styles.tile} style={{ '--c': t.color } as CSSProperties}>
                <span className={styles.tileLabel}>{t.label}</span>
                <span className={styles.tileValue}>
                  {loading ? <Skeleton h={37} w={44} className={styles.skel} /> : <LiveNumber value={t.value} />}
                </span>
                <span className={styles.tileSub}>{t.sub}</span>
              </div>
            </TiltCard>
          </li>
        ))}
      </ul>

      <div className={styles.funnel}>
        <div className={styles.funnelHead}>
          <h2 className={styles.funnelTitle}>Pipeline funnel</h2>
          <span className={styles.funnelNote}>jobs that reached each stage</span>
        </div>
        <ol className={styles.bars}>
          {k.funnel.map((f, i) => {
            const prev = i > 0 ? k.funnel[i - 1].value : null;
            const conv = prev ? Math.round((f.value / prev) * 100) : null;
            const pct = (f.value / max) * 100;
            return (
              <li key={f.key} className={styles.barRow} title={`${f.label}: ${f.value}${conv !== null ? ` (${conv}% of previous stage)` : ''}`}>
                <span className={styles.barLabel}>{f.label}</span>
                <span className={styles.track}>
                  <motion.span
                    className={styles.bar}
                    style={{ '--c': f.color } as CSSProperties}
                    initial={reduce ? false : { width: 0 }}
                    whileInView={{ width: `${Math.max(pct, f.value ? 6 : 0)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <span className={styles.barValue}>{loading ? '–' : f.value}</span>
                </span>
                <span className={styles.conv}>{conv !== null && !loading ? `${conv}%` : ''}</span>
              </li>
            );
          })}
        </ol>
      </div>
      </div>
    </section>
  );
}
