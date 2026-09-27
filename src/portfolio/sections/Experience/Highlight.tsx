import { Fragment } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './Experience.module.css';

/** Metric-looking tokens: 35%, 99.5%, 500K+, 4.6★, 3x … (a bare year like 2025 is left alone). */
const METRIC_RE = /([+−-]?\d+(?:\.\d+)?(?:%|[KM]\+?|★|x(?![a-z])|\+))/g;

/** Renders text with every metric wrapped in a yellow highlighter swipe that animates in when visible. */
export function Highlighted({ text }: { text: string }) {
  const parts = text.split(METRIC_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <Mark key={i}>{part}</Mark> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

function Mark({ children }: { children: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <mark className={styles.mark}>{children}</mark>;
  return (
    <motion.mark
      className={styles.mark}
      initial={{ backgroundSize: '0% 100%' }}
      whileInView={{ backgroundSize: '100% 100%' }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
    >
      {children}
    </motion.mark>
  );
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Apr 2025" → months since year 0, or null when it can't be parsed ("Present"). */
export function monthIndex(s: string): number | null {
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  return mi < 0 ? null : Number(m[2]) * 12 + mi;
}

export const isPresent = (s: string) => /^(present|now|current)$/i.test(s.trim());
