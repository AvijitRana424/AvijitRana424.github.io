import { motion } from 'framer-motion';
import styles from './SectionHeading.module.css';

interface Props {
  title: string;
  /** Handwritten red continuation, e.g. "upto lately". */
  accent?: string;
  /** Set when the heading sits on a paper card (dark ink) instead of the board. */
  onPaper?: boolean;
  id?: string;
  className?: string;
  align?: 'left' | 'center';
}

/** "What I've been <upto lately>" with a hand-drawn underline that draws in on scroll. */
export function SectionHeading({ title, accent, onPaper, id, className, align = 'left' }: Props) {
  return (
    <div className={[styles.wrap, onPaper && styles.onPaper, align === 'center' && styles.center, className].filter(Boolean).join(' ')}>
      <h2 id={id} className={styles.title}>
        {title}
        {accent && (
          <>
            {' '}
            <span className={styles.accent}>{accent}</span>
          </>
        )}
      </h2>
      <svg className={styles.underline} viewBox="0 0 60 8" aria-hidden="true">
        <motion.path
          d="M2 5 C 15 2, 30 7, 58 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
      </svg>
    </div>
  );
}
