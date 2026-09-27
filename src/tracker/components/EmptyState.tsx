import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './EmptyState.module.css';

type DoodleKind = 'radar' | 'building' | 'clock' | 'search' | 'column';

const DOODLES: Record<DoodleKind, string[]> = {
  // satellite dish scanning the sky
  radar: [
    'M22 78c10-2 34-2 46 0',
    'M44 78c-1-8 0-15 2-21',
    'M20 50c6 14 26 20 40 10 9-6 12-16 10-24-12 6-32 12-50 14Z',
    'M46 43c5-5 11-10 18-13',
    'M66 26c2-1 5 0 5 3s-3 4-5 3-2-5 0-6Z',
    'M76 18c5 3 7 8 7 13',
    'M80 10c8 5 12 13 12 22',
  ],
  // little office building + flag
  building: [
    'M22 82c16-1 42-1 60 0',
    'M30 81c-1-16 0-34 1-48 9-1 18-1 27 0 1 15 1 32 0 48',
    'M58 81c0-10 0-21 1-30 6 0 12 0 17 1 1 9 1 19 0 29',
    'M38 42h5M47 42h5M38 52h5M47 52h5M38 62h5M47 62h5M65 60h5M65 69h5',
    'M44 81c0-4 0-8 1-11h6c1 3 1 7 0 11',
    'M44 33c0-7 0-13 1-19',
    'M45 14c5 2 9 1 13 3-4 2-8 1-13 4',
  ],
  // alarm clock
  clock: [
    'M50 22c17-1 29 12 29 28 0 17-13 29-29 29-17 0-29-13-29-29 0-16 12-28 29-28Z',
    'M50 34c0 6 0 11 1 16l10 7',
    'M26 24c3-6 8-9 14-9',
    'M74 24c-3-6-8-9-14-9',
    'M33 76l-5 7M67 76l5 7',
  ],
  // magnifying glass over a card
  search: [
    'M18 30c14-1 30-1 44 0 1 12 1 26 0 38-14 1-30 1-44 0-1-12-1-26 0-38Z',
    'M26 42h26M26 50h18M26 58h22',
    'M66 44c9 0 15 7 15 15s-7 15-15 15-15-7-15-15 7-15 15-15Z',
    'M77 70l11 12',
  ],
  // arrow pointing down into a column
  column: ['M50 18c-2 14-1 30 1 44', 'M40 52c4 5 7 9 11 12 3-4 7-8 10-12', 'M28 76c14 2 30 2 44 0'],
};

interface Props {
  kind?: DoodleKind;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  tone?: 'board' | 'paper';
}

/** Chalk doodle that draws itself in, with a handwritten title. */
export function EmptyState({ kind = 'radar', title, children, action, compact, tone = 'board' }: Props) {
  const reduce = useReducedMotion();
  return (
    <div className={[styles.wrap, compact && styles.compact, tone === 'paper' && styles.paper].filter(Boolean).join(' ')}>
      <svg className={styles.doodle} viewBox="0 0 100 100" aria-hidden="true">
        {DOODLES[kind].map((d, i) => (
          <motion.path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </svg>
      <p className={styles.title}>{title}</p>
      {children && <p className={styles.body}>{children}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
