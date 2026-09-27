import type { ComponentType } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Award, CodeXml, GraduationCap, Heart, Smartphone, Zap, type LucideProps } from 'lucide-react';
import { Paper } from '@/ui';
import { profile, type Highlight } from '@/data/profile';
import { CoffeeDoodle } from './Doodles';
import { T } from './motion';
import styles from './StickyHighlights.module.css';

const ICONS: Record<NonNullable<Highlight['icon']>, ComponentType<LucideProps>> = {
  code: CodeXml,
  zap: Zap,
  phone: Smartphone,
  cap: GraduationCap,
  award: Award,
  heart: Heart,
};

const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: T.noteStagger, delayChildren: T.noteItems } },
};

const item: Variants = {
  hidden: { opacity: 0, x: -8, clipPath: 'inset(-6px 100% -10px -30px)' },
  show: {
    opacity: 1,
    x: 0,
    clipPath: 'inset(-6px 0% -10px -30px)',
    transition: { duration: 0.42, ease: [0.3, 0.7, 0.2, 1] },
    transitionEnd: { clipPath: 'none' },
  },
};

const marker: Variants = {
  hidden: { scale: 0, rotate: -40 },
  show: { scale: 1, rotate: -8, transition: { type: 'spring', stiffness: 420, damping: 16, delay: 0.08 } },
};

/** "2025–2026" → "2025–26" */
const shortRange = (y: string) => y.replace(/^(\d{4})\s*[–-]\s*\d{2}(\d{2})$/, '$1–$2');

function Part({ part }: { part: Highlight['parts'][number] }) {
  if (typeof part === 'string') return <>{part}</>;
  if ('accent' in part) return <span className={styles.accent}>{part.accent}</span>;
  if (part.href)
    return (
      <a className={`squiggle ${styles.strong}`} href={part.href} target="_blank" rel="noreferrer">
        {part.strong}
      </a>
    );
  return <strong className={styles.strong}>{part.strong}</strong>;
}

/** Award ribbon stuck across the note's bottom edge (from profile.achievements, never invented). */
function AwardRibbon() {
  const reduce = !!useReducedMotion();
  const award = profile.achievements[0];
  if (!award) return null;
  return (
    <motion.p
      className={styles.ribbon}
      initial={reduce ? false : { opacity: 0, scale: 1.25, rotate: -8 }}
      animate={{ opacity: 1, scale: 1, rotate: -2.5 }}
      transition={{ type: 'spring', stiffness: 380, damping: 20, delay: T.foot, opacity: { duration: 0.15, delay: T.foot } }}
    >
      <svg className={styles.seal} viewBox="0 0 48 48" aria-hidden="true">
        <path
          className={styles.sealEdge}
          d="M24 2.5 L28.2 6.6 L34 5.4 L35.9 11 L41.5 12.9 L40.3 18.7 L44.5 22.9 L40.3 27.1 L41.5 32.9 L35.9 34.8 L34 40.4 L28.2 39.2 L24 43.4 L19.8 39.2 L14 40.4 L12.1 34.8 L6.5 32.9 L7.7 27.1 L3.5 22.9 L7.7 18.7 L6.5 12.9 L12.1 11 L14 5.4 L19.8 6.6 Z"
        />
        <circle className={styles.sealRing} cx="24" cy="23" r="13" />
        <path className={styles.sealStar} d="M24 15.2 L26.2 20 L31.4 20.5 L27.5 24 L28.6 29.1 L24 26.5 L19.4 29.1 L20.5 24 L16.6 20.5 L21.8 20 Z" />
      </svg>
      <span className={styles.band}>
        <span className="sr-only">Award: </span>
        <b>{award.title.replace(/\s+award$/i, '')}</b>
        <span className={styles.bandMeta}>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          {award.org && <span className={styles.org}>{award.org} </span>}
          {shortRange(award.year)}
        </span>
      </span>
    </motion.p>
  );
}

/** Big yellow sticky note with the "about me" highlights, written in line by line. */
export function StickyHighlights() {
  const reduce = !!useReducedMotion();
  const highlights: Highlight[] = profile.highlights;
  const hasAward = profile.achievements.length > 0;

  return (
    <motion.div
      className={[styles.wrap, hasAward && styles.withRibbon].filter(Boolean).join(' ')}
      initial={reduce ? false : { y: 48, opacity: 0, rotate: 2 }}
      animate={{ y: 0, opacity: 1, rotate: -0.9 }}
      transition={{ type: 'spring', stiffness: 170, damping: 20, delay: T.note, opacity: { duration: 0.22, delay: T.note } }}
    >
      <span className={styles.curl} aria-hidden="true" />
      <Paper variant="sticky" tape="top" className={styles.sticky}>
        <h2 className="sr-only">About {profile.firstName}</h2>
        <motion.ul className={styles.list} variants={list} initial={reduce ? false : 'hidden'} animate="show">
          {highlights.map((h, i) => {
            const Icon = h.icon ? ICONS[h.icon] : null;
            return (
              <motion.li key={i} className={[styles.item, !Icon && styles.dotted].filter(Boolean).join(' ')} variants={item}>
                {Icon && (
                  <motion.span className={styles.marker} variants={marker} aria-hidden="true">
                    <Icon strokeWidth={2.1} />
                  </motion.span>
                )}
                {h.parts.map((p, j) => (
                  <Part key={j} part={p} />
                ))}
              </motion.li>
            );
          })}
        </motion.ul>
        <span className={styles.fold} aria-hidden="true" />
      </Paper>
      <AwardRibbon />
      <CoffeeDoodle className={styles.coffee} delay={T.decor + 0.2} />
    </motion.div>
  );
}
