import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AtsType, FetchRunStatus, JobStatus } from '@/lib/types';
import { ATS_LABEL } from '@/lib/tracker/ats';
import { ATS_COLOR, initials, monoColor, RUN_META, STATUS_META } from '../lib/format';
import styles from './Bits.module.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Monogram({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={cx(styles.mono, className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: monoColor(name) } as CSSProperties}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** 0–100 match score as a hand-inked ring. */
export function ScoreRing({ score, size = 36, stroke = 3.2 }: { score: number; size?: number; stroke?: number }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 80 ? 'var(--st-offer)' : score >= 60 ? 'var(--st-applied)' : score > 0 ? 'var(--st-interview)' : 'var(--paper-3)';
  return (
    <span className={styles.ring} style={{ width: size, height: size }} title={score > 0 ? `Match score ${score}/100` : 'No score (added manually)'}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`color-mix(in srgb, ${color} 72%, var(--ink))`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.ringNum} style={{ fontSize: Math.max(10, size * 0.32) }}>
        <span className="sr-only">Match score </span>
        {score > 0 ? score : '–'}
      </span>
    </span>
  );
}

export function StatusPill({ status, size = 'md' }: { status: JobStatus; size?: 'sm' | 'md' }) {
  const m = STATUS_META[status];
  return (
    <span className={cx(styles.pill, size === 'sm' && styles.pillSm)} style={{ '--c': m.color } as CSSProperties}>
      <span className={styles.dot} aria-hidden="true" />
      {m.label}
    </span>
  );
}

export function RunPill({ status }: { status: FetchRunStatus }) {
  const m = RUN_META[status];
  return (
    <span className={cx(styles.pill, styles.pillSm, status === 'running' && styles.pulse)} style={{ '--c': m.color } as CSSProperties}>
      <span className={styles.dot} aria-hidden="true" />
      {m.label}
    </span>
  );
}

/** ATS label. `auto` = not scanned yet: the type is only what the URL suggests (the scanner confirms it). */
export function AtsBadge({ type, identifier, auto }: { type: AtsType; identifier?: string | null; auto?: boolean }) {
  const title = auto
    ? `Looks like ${ATS_LABEL[type]} from the URL — the scanner confirms it on its next run`
    : identifier
      ? `${ATS_LABEL[type]} · ${identifier}`
      : ATS_LABEL[type];
  return (
    <span className={cx(styles.ats, auto && styles.atsAuto)} style={{ '--c': ATS_COLOR[type] } as CSSProperties} title={title}>
      {ATS_LABEL[type]}
      {auto && <span className={styles.atsAutoTag}>auto</span>}
    </span>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  hideLabel,
  tone = 'paper',
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hideLabel?: boolean;
  tone?: 'paper' | 'board';
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <label className={cx(styles.switchWrap, tone === 'board' && styles.switchBoard, disabled && styles.disabled)}>
      <input
        type="checkbox"
        role="switch"
        className={styles.switchInput}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={cx(styles.switch, checked && styles.switchOn)} aria-hidden="true">
        <motion.span
          className={styles.knob}
          animate={{ x: checked ? 18 : 0 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 600, damping: 32 }}
        />
      </span>
      <span className={hideLabel ? 'sr-only' : styles.switchLabel}>{label}</span>
    </label>
  );
}

/** Hover / focus tooltip. Wrap the trigger; the tip is linked with aria-describedby. */
export function Tooltip({ tip, children, side = 'top', className }: { tip: ReactNode; children: (describedBy: string) => ReactNode; side?: 'top' | 'bottom'; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cx(styles.tipWrap, className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children(id)}
      <span id={id} role="tooltip" className={cx(styles.tip, side === 'bottom' && styles.tipBottom, open && styles.tipOpen)}>
        {tip}
      </span>
    </span>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

/** Segmented control (radio group) with a sliding paper indicator. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  tone = 'board',
  size = 'md',
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  label: string;
  tone?: 'board' | 'paper';
  size?: 'sm' | 'md';
}) {
  const reduce = useReducedMotion();
  const group = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx(styles.seg, tone === 'paper' && styles.segPaper, size === 'sm' && styles.segSm)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={cx(styles.segBtn, on && styles.segOn)}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
              onChange(next.value);
              const el = (e.currentTarget.parentElement?.children[options.indexOf(next)] as HTMLElement) ?? null;
              el?.focus();
            }}
          >
            {on && (
              <motion.span
                layoutId={`seg-${group}`}
                className={styles.segThumb}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <span className={styles.segInner}>
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8, className, style }: { h?: number | string; w?: number | string; r?: number; className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={cx(styles.skel, className)} style={{ height: h, width: w, borderRadius: r, ...style }} />;
}
