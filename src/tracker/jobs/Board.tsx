import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import type { Company, Job, JobStatus } from '@/lib/types';
import { EmptyState } from '../components/EmptyState';
import { BOARD_STATUSES, STATUS_META } from '../lib/format';
import { JobCard } from './JobCard';
import styles from './Board.module.css';

interface Props {
  jobs: Job[];
  companyById: Map<string, Company>;
  showArchived: boolean;
  /** a search is filtering the cards (empty columns then say "No matches") */
  searching?: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, status: JobStatus) => void;
}

interface DragState {
  id: string;
  from: JobStatus;
  over: JobStatus | null;
  w: number;
  h: number;
  dropping: boolean;
}

const byFound = (a: Job, b: Job) => b.date_found.localeCompare(a.date_found);

export function Board({ jobs, companyById, showArchived, searching, onOpen, onMove }: Props) {
  const reduce = useReducedMotion();
  const statuses = useMemo<JobStatus[]>(() => (showArchived ? [...BOARD_STATUSES, 'archived'] : BOARD_STATUSES), [showArchived]);
  const columns = useMemo(() => {
    const m = new Map<JobStatus, Job[]>(statuses.map((s) => [s, []]));
    for (const j of jobs) m.get(j.status)?.push(j);
    for (const list of m.values()) list.sort(byFound);
    return m;
  }, [jobs, statuses]);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef(new Map<JobStatus, HTMLElement>());
  const placeholderRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const origin = useRef({ x: 0, y: 0 });

  // does the board scroll sideways? → fade the clipped edge(s) and show the jump chips
  const [edges, setEdges] = useState({ any: false, l: false, r: false });
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const update = () => {
      const max = sc.scrollWidth - sc.clientWidth;
      const next = { any: max > 4, l: sc.scrollLeft > 4, r: sc.scrollLeft < max - 4 };
      setEdges((o) => (o.any === next.any && o.l === next.l && o.r === next.r ? o : next));
    };
    update();
    sc.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(sc);
    return () => {
      sc.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [statuses.length]);

  const hitColumn = useCallback((x: number, y: number): JobStatus | null => {
    const sc = scrollerRef.current?.getBoundingClientRect();
    if (!sc || y < sc.top - 80 || y > sc.bottom + 160) return null;
    for (const [s, el] of colRefs.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left - 6 && x <= r.right + 6) return s;
    }
    return null;
  }, []);

  // auto-scroll the board / page while dragging near an edge
  useEffect(() => {
    if (!drag || drag.dropping) return;
    let raf = 0;
    const tick = () => {
      const sc = scrollerRef.current;
      const { x, y } = pointer.current;
      if (sc) {
        const r = sc.getBoundingClientRect();
        const edge = 70;
        if (x < r.left + edge) sc.scrollLeft -= Math.ceil((r.left + edge - x) / 5);
        else if (x > r.right - edge) sc.scrollLeft += Math.ceil((x - (r.right - edge)) / 5);
      }
      if (y < 90) window.scrollBy(0, -Math.ceil((90 - y) / 6));
      else if (y > window.innerHeight - 70) window.scrollBy(0, Math.ceil((y - (window.innerHeight - 70)) / 6));
      const over = hitColumn(x, y);
      setDrag((d) => (d && !d.dropping && d.over !== over ? { ...d, over } : d));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag?.id, drag?.dropping, hitColumn]); // eslint-disable-line react-hooks/exhaustive-deps

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, job: Job, viaHandle: boolean) => {
      if (e.button !== 0 || dragRef.current) return;
      if (e.pointerType !== 'mouse' && !viaHandle) return; // touch: scroll normally, drag via the grip
      const card = (e.currentTarget.closest('[data-job-id]') as HTMLElement) ?? e.currentTarget;
      const rect = card.getBoundingClientRect();
      const off = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const start = { x: e.clientX, y: e.clientY };
      const pid = e.pointerId;
      let started = false;
      if (viaHandle) e.preventDefault();

      const begin = () => {
        started = true;
        origin.current = { x: rect.left, y: rect.top };
        gx.set(rect.left);
        gy.set(rect.top);
        document.body.classList.add(styles.dragging);
        setDrag({ id: job.id, from: job.status, over: job.status, w: rect.width, h: rect.height, dropping: false });
      };

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        if (!started) {
          if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < (viaHandle ? 3 : 7)) return;
          begin();
        }
        ev.preventDefault();
        pointer.current = { x: ev.clientX, y: ev.clientY };
        gx.set(ev.clientX - off.x);
        gy.set(ev.clientY - off.y);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', esc);
        document.body.classList.remove(styles.dragging);
      };

      const snapBack = () => {
        if (reduce) {
          setDrag(null);
          return;
        }
        setDrag((d) => (d ? { ...d, over: null, dropping: true } : d));
        const spring = { type: 'spring' as const, stiffness: 420, damping: 26 };
        animate(gx, origin.current.x, spring);
        animate(gy, origin.current.y, { ...spring, onComplete: () => setDrag(null) });
      };

      const finish = (ev: PointerEvent | null, cancelled: boolean) => {
        cleanup();
        if (!started) return;
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
        const target = cancelled || !ev ? null : hitColumn(ev.clientX, ev.clientY);
        if (!target || target === job.status) {
          snapBack();
          return;
        }
        const ph = placeholderRef.current?.getBoundingClientRect();
        if (reduce || !ph) {
          setDrag(null);
          onMove(job.id, target);
          return;
        }
        setDrag((d) => (d ? { ...d, over: target, dropping: true } : d));
        const t = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };
        animate(gx, ph.left, t);
        animate(gy, ph.top, {
          ...t,
          onComplete: () => {
            setDrag(null);
            onMove(job.id, target);
          },
        });
      };

      const up = (ev: PointerEvent) => ev.pointerId === pid && finish(ev, false);
      const cancel = (ev: PointerEvent) => ev.pointerId === pid && finish(null, true);
      const esc = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') finish(null, true);
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', esc);
    },
    [gx, gy, hitColumn, onMove, reduce],
  );

  const open = useCallback(
    (id: string) => {
      if (suppressClick.current || dragRef.current) return;
      onOpen(id);
    },
    [onOpen],
  );

  const keyMove = useCallback(
    (job: Job, dir: -1 | 1) => {
      const i = statuses.indexOf(job.status);
      const next = statuses[i + dir];
      if (next) {
        onMove(job.id, next);
        // keep keyboard focus on the moved card once it re-renders in its new column
        // (the old copy may still be animating out of the source column, so look inside the target column)
        window.setTimeout(
          () => document.querySelector<HTMLElement>(`section[aria-labelledby="col-${next}"] [data-job-id="${job.id}"]`)?.focus({ preventScroll: false }),
          80,
        );
      }
    },
    [statuses, onMove],
  );

  const jumpTo = (s: JobStatus) => {
    const el = colRefs.current.get(s);
    const sc = scrollerRef.current;
    if (el && sc) sc.scrollTo({ left: el.offsetLeft - 4, behavior: reduce ? 'auto' : 'smooth' });
  };

  const dragged = drag ? jobs.find((j) => j.id === drag.id) : undefined;

  return (
    <div className={styles.boardWrap} data-edge={edges.any ? `${edges.l ? 'l' : ''}${edges.r ? 'r' : ''}` || undefined : undefined}>
      <nav className={[styles.jump, edges.any && styles.jumpShow].filter(Boolean).join(' ')} aria-label="Jump to column">
        {statuses.map((s) => (
          <button key={s} type="button" className={styles.jumpChip} style={{ '--c': STATUS_META[s].color } as CSSProperties} onClick={() => jumpTo(s)}>
            <span className={styles.jumpDot} aria-hidden="true" />
            {STATUS_META[s].label}
            <b>{columns.get(s)?.length ?? 0}</b>
          </button>
        ))}
      </nav>

      <div ref={scrollerRef} className={styles.scroller} data-cols={statuses.length}>
        {statuses.map((s) => {
          const list = columns.get(s) ?? [];
          const isOver = !!drag && drag.over === s && drag.from !== s;
          // where the dragged card would land (lists are sorted by date found)
          let phIndex = -1;
          if (isOver && dragged) {
            phIndex = list.findIndex((j) => byFound(dragged, j) < 0);
            if (phIndex < 0) phIndex = list.length;
          }
          const placeholder = (
            <motion.div
              key="__placeholder"
              ref={placeholderRef}
              className={styles.placeholder}
              style={{ height: drag?.h ?? 120 }}
              initial={reduce ? false : { opacity: 0, scaleY: 0.6 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            />
          );
          return (
            <section
              key={s}
              ref={(el) => {
                if (el) colRefs.current.set(s, el);
                else colRefs.current.delete(s);
              }}
              className={[styles.column, isOver && styles.columnOver].filter(Boolean).join(' ')}
              style={{ '--c': STATUS_META[s].color } as CSSProperties}
              aria-labelledby={`col-${s}`}
            >
              <header className={styles.colHead}>
                <span className={styles.colDot} aria-hidden="true" />
                <h3 id={`col-${s}`} className={styles.colTitle}>
                  {STATUS_META[s].label}
                </h3>
                <span className={styles.colCount} aria-label={`${list.length} jobs`}>
                  {list.length}
                </span>
              </header>
              <div className={styles.colBody}>
                <AnimatePresence initial={false} mode="popLayout">
                  {list.map((j, i) => [
                    i === phIndex ? placeholder : null,
                    <motion.div
                      key={j.id}
                      layout={reduce ? false : 'position'}
                      initial={reduce ? false : { opacity: 0, scale: 0.92, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    >
                      <JobCard
                        job={j}
                        company={companyById.get(j.company_id)}
                        onOpen={open}
                        onMove={onMove}
                        onKeyMove={keyMove}
                        onDragStart={startDrag}
                        hole={drag?.id === j.id}
                      />
                    </motion.div>,
                  ])}
                  {phIndex === list.length && placeholder}
                </AnimatePresence>
                {list.length === 0 && !isOver && (
                  <div className={styles.emptyCol}>
                    <EmptyState compact kind={searching ? 'search' : 'column'} title={searching ? 'No matches' : s === 'new' ? 'All caught up' : 'Drop jobs here'} />
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {drag &&
        dragged &&
        createPortal(
          <motion.div
            className={styles.ghost}
            style={{ x: gx, y: gy, width: drag.w }}
            initial={reduce ? false : { rotate: 0, scale: 1 }}
            animate={reduce ? undefined : { rotate: drag.dropping ? 0 : 3, scale: drag.dropping ? 1 : 1.04 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            aria-hidden="true"
          >
            <JobCard job={dragged} company={companyById.get(dragged.company_id)} ghost />
          </motion.div>,
          document.body,
        )}

    </div>
  );
}
