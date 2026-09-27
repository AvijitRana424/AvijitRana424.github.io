import { useId } from 'react';
import type { ChalkColor } from './strokes';
import styles from './ChalkTray.module.css';

const FILL: Record<ChalkColor, string> = {
  white: 'var(--chalk)',
  red: 'var(--chalk-red)',
  yellow: 'var(--chalk-yellow)',
};

/** A stick of chalk: a shaded cylinder with a worn, dusty rounded tip. */
export function ChalkStickArt({ color, className }: { color: ChalkColor; className?: string }) {
  const id = useId().replace(/:/g, '');
  const fill = FILL[color];
  return (
    <svg className={className} width="16" height="76" viewBox="0 0 16 76" aria-hidden="true">
      <defs>
        <linearGradient id={`cyl${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--board)" stopOpacity="0.26" />
          <stop offset="0.28" stopColor="var(--paper)" stopOpacity="0.42" />
          <stop offset="0.5" stopColor="var(--paper)" stopOpacity="0.08" />
          <stop offset="1" stopColor="var(--board)" stopOpacity="0.34" />
        </linearGradient>
        <linearGradient id={`tip${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--paper)" stopOpacity="0.75" />
          <stop offset="1" stopColor="var(--paper)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* body with a worn, slightly slanted dome */}
      <path d="M1.5 76 L1.5 12.5 C1.5 6 4.2 2 8.4 1.6 C12.2 1.9 14.5 6.4 14.5 11 L14.5 76 Z" fill={fill} />
      <path d="M1.5 76 L1.5 12.5 C1.5 6 4.2 2 8.4 1.6 C12.2 1.9 14.5 6.4 14.5 11 L14.5 76 Z" fill={`url(#cyl${id})`} />
      {/* dusty worn tip */}
      <path d="M2.6 11.8 C3 6.4 5.2 3.2 8.4 2.9 C11.3 3.1 13.2 6.5 13.4 10.4 C10.2 12.4 6 12.9 2.6 11.8 Z" fill={`url(#tip${id})`} />
      <g fill="var(--paper)" opacity="0.7">
        <circle cx="5.2" cy="7.2" r="0.6" />
        <circle cx="9.8" cy="5.4" r="0.45" />
        <circle cx="11.6" cy="9.1" r="0.55" />
        <circle cx="7.4" cy="10.2" r="0.4" />
      </g>
      {/* a nick in the side, and a faint paper-wrapper edge lower down */}
      <path d="M14.5 30 q-1.4 1.6 0 3.4" stroke="var(--board)" strokeOpacity="0.3" strokeWidth="0.8" fill="none" />
      <path d="M1.5 52 L14.5 51.4" stroke="var(--board)" strokeOpacity="0.16" strokeWidth="0.8" />
    </svg>
  );
}

/** Felt blackboard eraser: wooden back, dusty felt pad. */
export function EraserArt({ className, big }: { className?: string; big?: boolean }) {
  return (
    <span className={[styles.eraserArt, big && styles.eraserBig, className].filter(Boolean).join(' ')} aria-hidden="true">
      <span className={styles.eraserWood}>
        <span className={styles.eraserGroove} />
      </span>
      <span className={styles.eraserFelt} />
    </span>
  );
}

/** Hand-drawn swoosh arrow pointing down (hint bubble → chalk sticks). */
export function DownArrow({ className }: { className?: string }) {
  return (
    <svg className={className} width="34" height="46" viewBox="0 0 34 46" aria-hidden="true" fill="none">
      <path d="M3 3.5 C17 4.5 28 13 24 26 C22.4 31.4 19.6 36.6 17.2 41.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11.6 36.4 L17 42.4 L22.4 37.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
