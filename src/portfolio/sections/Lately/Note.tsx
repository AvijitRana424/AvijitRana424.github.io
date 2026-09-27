import { motion } from 'framer-motion';
import styles from './Lately.module.css';

interface Props {
  /** Point on the rope the arrow aims at (content coordinates). */
  tx: number;
  ty: number;
  reveal: boolean;
  entered: boolean;
  /** The visitor has already dragged / swiped / opened a card: fade the hint away. */
  done?: boolean;
}

/** Handwritten chalk note — "drag me!" (or "swipe me!" on touch) with a curly arrow down to the rope. */
export function Note({ tx, ty, reveal, entered, done = false }: Props) {
  const h = Math.max(70, ty);
  const W = 70;
  const ex = 40; // arrow tip x inside the svg
  const path = `M6 22 C 22 10, 46 14, 46 30 C 46 44, 27 44, 29 31 C 31 18, 55 20, 54 40 C 53 ${h - 34}, 45 ${h - 20}, ${ex} ${h - 4}`;
  const head = `M${ex - 8.5} ${h - 13} L${ex} ${h - 3} L${ex + 5.5} ${h - 14.5}`;
  const anim = (delay: number) =>
    reveal
      ? {
          initial: { pathLength: 0 },
          animate: entered ? { pathLength: 1 } : undefined,
          transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
        }
      : {};
  return (
    <motion.div
      className={styles.note}
      style={{ left: tx - ex, top: 0, width: W, height: h }}
      aria-hidden="true"
      initial={false}
      animate={{ opacity: done ? 0 : 1 }}
      transition={{ duration: 0.5, delay: done ? 0.6 : 0 }}
    >
      <motion.span
        className={styles.noteText}
        initial={reveal ? { opacity: 0, y: 6 } : false}
        animate={entered ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.4, delay: 1.35 }}
      >
        <span className={styles.noteMouse}>drag me!</span>
        <span className={styles.noteTouch}>swipe me!</span>
      </motion.span>
      <svg width={W} height={h} viewBox={`0 0 ${W} ${h}`} className={styles.noteSvg}>
        <motion.path d={path} {...anim(1.5)} />
        <motion.path d={head} {...anim(2.1)} />
      </svg>
    </motion.div>
  );
}
