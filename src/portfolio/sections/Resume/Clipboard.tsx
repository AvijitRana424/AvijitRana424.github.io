import { useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type Variants } from 'framer-motion';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { useCoarsePointer, useElementWidth } from './hooks';
import styles from './Clipboard.module.css';

/** How the sheet enters: new file slides onto the board, page turns flip over the clip. */
export type SheetMotion = 'fade' | 'file' | 'next' | 'prev';

interface Props {
  sheetKey: string;
  motion: SheetMotion;
  /** Render prop: receives the sheet's available width in CSS px. */
  children: (width: number) => ReactNode;
  pageCount: number;
  page: number;
  onPage: (n: number) => void;
  onOpen?: () => void;
  openLabel?: string;
  busy?: boolean;
  /** Absolutely positioned extras on the board (sticky notes, banners). */
  overlay?: ReactNode;
}

const spring = { type: 'spring' as const, stiffness: 210, damping: 26, mass: 0.9 };

const sheetVariants: Variants = {
  enter: (k: SheetMotion) =>
    k === 'file'
      ? { opacity: 0, y: -90, rotateX: -62, rotateZ: -3, scale: 0.97, zIndex: 3 }
      : k === 'next'
        ? { opacity: 1, y: 0, rotateX: 0, rotateZ: 0, scale: 1, zIndex: 1, filter: 'brightness(0.94)' }
        : k === 'prev'
          ? { opacity: 0.4, y: 0, rotateX: 96, rotateZ: 0, scale: 1, zIndex: 3 }
          : { opacity: 0, y: 6, rotateX: 0, rotateZ: 0, scale: 1, zIndex: 2 },
  center: {
    opacity: 1,
    y: 0,
    x: 0,
    rotateX: 0,
    rotateZ: 0,
    scale: 1,
    zIndex: 2,
    filter: 'brightness(1)',
    transition: spring,
  },
  exit: (k: SheetMotion) =>
    k === 'file'
      ? { opacity: 0, x: 70, y: 70, rotateZ: 7, zIndex: 1, transition: { duration: 0.45, ease: [0.4, 0, 0.6, 1] } }
      : k === 'next'
        ? { opacity: 0, rotateX: 100, zIndex: 3, transition: { duration: 0.5, ease: [0.45, 0, 0.3, 1] } }
        : k === 'prev'
          ? { opacity: 0, zIndex: 1, transition: { duration: 0.2, delay: 0.3 } }
          : { opacity: 0, zIndex: 1, transition: { duration: 0.2 } },
};

const reducedVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/** A wood-brown clipboard with a metal clip, tilting in 3D under the pointer. */
export function Clipboard({ sheetKey, motion: kind, children, pageCount, page, onPage, onOpen, openLabel = 'Open full view', busy, overlay }: Props) {
  const reduce = useReducedMotion();
  const wellRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wellRef);
  const pagerId = useId();
  const verb = useCoarsePointer() ? 'tap' : 'click';

  // pointer tilt
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const hover = useMotionValue(0);
  const cfg = { stiffness: 160, damping: 18, mass: 0.7 };
  const rotateY = useSpring(useTransform(mx, (v) => v * 9), cfg);
  const rotateX = useSpring(useTransform(my, (v) => -v * 7), cfg);
  const lift = useSpring(hover, cfg);
  const y = useTransform(lift, (l) => l * -10);
  const rotateZ = useTransform(lift, (l) => -1.1 * (1 - l));
  const boxShadow = useTransform([rotateX, rotateY, lift] as never, ([rx, ry, l]: number[]) => {
    const sx = -ry * 1.6;
    const sy = 18 + l * 22 + rx * 1.4;
    return [
      'inset 0 1px 0 rgba(255,255,255,.28)',
      'inset 0 -2px 0 rgba(0,0,0,.18)',
      `0 6px 0 var(--clip-edge)`,
      `${sx.toFixed(1)}px ${sy.toFixed(1)}px ${(34 + l * 26).toFixed(0)}px -12px rgba(0,0,0,${(0.62 + l * 0.12).toFixed(2)})`,
      `${(sx * 0.4).toFixed(1)}px ${(8 + l * 6).toFixed(1)}px 14px -6px rgba(0,0,0,.45)`,
    ].join(', ');
  });

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
    hover.set(1);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
    hover.set(0);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' && page < pageCount) {
      e.preventDefault();
      onPage(page + 1);
    } else if (e.key === 'ArrowLeft' && page > 1) {
      e.preventDefault();
      onPage(page - 1);
    }
  };

  const under = Math.min(Math.max(pageCount - page, 0), 2);

  return (
    <div className={styles.stage} onPointerMove={onMove} onPointerLeave={onLeave} onKeyDown={onKey}>
      <motion.div
        className={styles.board}
        style={reduce ? { rotateZ: -0.8 } : { rotateX, rotateY, rotateZ, y, boxShadow }}
      >
        <span className={styles.hole} aria-hidden="true" />
        <Clip className={styles.clip} />

        <div className={styles.well} ref={wellRef}>
          {Array.from({ length: under }, (_, i) => (
            <span key={i} className={styles.under} data-depth={i + 1} aria-hidden="true" />
          ))}
          <div className={styles.stack}>
            <AnimatePresence initial={false} custom={kind}>
              <motion.div
                key={sheetKey}
                className={styles.sheet}
                custom={kind}
                variants={reduce ? reducedVariants : sheetVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {children(width)}
              </motion.div>
            </AnimatePresence>
          </div>
          {onOpen && (
            <button type="button" className={styles.hit} onClick={onOpen} aria-label={openLabel} tabIndex={-1}>
              <span className={styles.hitHint} aria-hidden="true">
                <Maximize2 size={14} /> {verb} to read
              </span>
            </button>
          )}
          {busy && <span className={styles.busy} role="status" aria-label="Loading new resume" />}
        </div>

        <div className={styles.footer}>
          {pageCount > 1 ? (
            <nav className={styles.pager} aria-label="Resume pages">
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => onPage(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
                aria-controls={pagerId}
              >
                <ChevronLeft size={18} />
              </button>
              <span className={styles.pageNum} id={pagerId} aria-live="polite">
                {page} <span aria-hidden="true">/</span>
                <span className="sr-only"> of </span> {pageCount}
              </span>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => onPage(page + 1)}
                disabled={page >= pageCount}
                aria-label="Next page"
                aria-controls={pagerId}
              >
                <ChevronRight size={18} />
              </button>
            </nav>
          ) : (
            <span className={styles.stamp} aria-hidden="true">
              {onOpen ? `${verb} the page to read it big` : '1 page'}
            </span>
          )}
          {onOpen && (
            <button type="button" className={styles.expand} onClick={onOpen} aria-label={openLabel}>
              <Maximize2 size={17} />
            </button>
          )}
        </div>
        {overlay}
      </motion.div>
    </div>
  );
}

/** Nickel clipboard clip: base plate with rivets, rolled hinge, jaw and a wire lever. */
function Clip({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 240 96" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--chalk)' }} />
          <stop offset="0.45" style={{ stopColor: 'var(--paper-3)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--ink-3)' }} />
          <stop offset="1" style={{ stopColor: 'var(--paper-3)' }} />
        </linearGradient>
        <linearGradient id={`${id}j`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--chalk)' }} />
          <stop offset="0.3" style={{ stopColor: 'var(--paper-2)' }} />
          <stop offset="0.8" style={{ stopColor: 'var(--ink-3)' }} />
          <stop offset="1" style={{ stopColor: 'var(--ink-2)' }} />
        </linearGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--ink-3)' }} />
          <stop offset="0.2" style={{ stopColor: 'var(--chalk)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--paper-3)' }} />
          <stop offset="0.8" style={{ stopColor: 'var(--chalk)' }} />
          <stop offset="1" style={{ stopColor: 'var(--ink-3)' }} />
        </linearGradient>
        <radialGradient id={`${id}r`} cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" style={{ stopColor: 'var(--chalk)' }} />
          <stop offset="1" style={{ stopColor: 'var(--ink-3)' }} />
        </radialGradient>
        <filter id={`${id}s`} x="-10%" y="-10%" width="120%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodOpacity="0.45" />
        </filter>
      </defs>
      <g filter={`url(#${id}s)`}>
        {/* base plate riveted to the board */}
        <path d="M58 14 H182 Q192 14 192 24 V46 H48 V24 Q48 14 58 14 Z" fill={`url(#${id}m)`} />
        <circle cx="68" cy="28" r="5" fill={`url(#${id}r)`} />
        <circle cx="172" cy="28" r="5" fill={`url(#${id}r)`} />
        <circle cx="68" cy="28" r="1.6" fill="rgba(0,0,0,.35)" />
        <circle cx="172" cy="28" r="1.6" fill="rgba(0,0,0,.35)" />
        {/* wire lever */}
        <path d="M92 46 C 92 6, 148 6, 148 46" fill="none" stroke="rgba(0,0,0,.3)" strokeWidth="8" strokeLinecap="round" transform="translate(0 2)" />
        <path d="M92 46 C 92 6, 148 6, 148 46" fill="none" stroke={`url(#${id}h)`} strokeWidth="7" strokeLinecap="round" />
        <path d="M95 40 C 96 13, 144 13, 145 40" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" strokeLinecap="round" />
        {/* rolled hinge */}
        <rect x="76" y="40" width="88" height="12" rx="6" fill={`url(#${id}h)`} />
        {/* jaw pressing the paper */}
        <path d="M16 52 Q16 46 22 46 H218 Q224 46 224 52 L217 74 Q215 80 208 80 H32 Q25 80 23 74 Z" fill={`url(#${id}j)`} />
        <path d="M24 50 H216" stroke="rgba(255,255,255,.7)" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M30 77 H210" stroke="rgba(0,0,0,.25)" strokeWidth="1" strokeLinecap="round" />
      </g>
    </svg>
  );
}
