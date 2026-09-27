import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import styles from './Paper.module.css';

export interface PaperProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'paper' | 'sticky' | 'kraft';
  /** Masking-tape strips: two top corners, one top-center, or none. */
  tape?: 'corners' | 'top' | 'none';
  /** Red push-pin at the top center. */
  pin?: boolean;
  /** Resting rotation in degrees (small values like -1.2 look natural). */
  tilt?: number;
  /** Lined notebook paper background. */
  lined?: boolean;
  children?: ReactNode;
}

/** A sheet of paper sitting on the chalkboard. */
export function Paper({ variant = 'paper', tape = 'none', pin, tilt = 0, lined, className, style, children, ...rest }: PaperProps) {
  return (
    <div
      className={[styles.paper, styles[variant], lined && styles.lined, className].filter(Boolean).join(' ')}
      style={{ ...(style as CSSProperties), ['--tilt' as string]: `${tilt}deg` }}
      {...rest}
    >
      {tape === 'corners' && (
        <>
          <Tape className={styles.tapeLeft} />
          <Tape className={styles.tapeRight} />
        </>
      )}
      {tape === 'top' && <Tape className={styles.tapeTop} />}
      {pin && <Pin className={styles.pin} />}
      {children}
    </div>
  );
}

/** A strip of masking tape. Position it with className. */
export function Tape({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={[styles.tape, className].filter(Boolean).join(' ')} style={style} />;
}

/** A red push-pin (SVG). */
export function Pin({ className, color = 'var(--pin)' }: { className?: string; color?: string }) {
  return (
    <svg className={className} width="22" height="30" viewBox="0 0 22 30" aria-hidden="true">
      <ellipse cx="11" cy="27" rx="4" ry="1.6" fill="rgba(0,0,0,.35)" />
      <line x1="11" y1="12" x2="11" y2="26" stroke="#8a8378" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="11" cy="8" r="7" fill={color} />
      <circle cx="8.5" cy="5.5" r="2.2" fill="rgba(255,255,255,.55)" />
    </svg>
  );
}
