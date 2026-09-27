import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import styles from './Nav.module.css';

/**
 * A tiny chalk cat sitting on the top edge of the nav sign. The tail dangles over the frame and swishes,
 * the eyes blink at random intervals, and hovering it gets a "mrrp?". Purely decorative.
 * The drawing's "floor" is y=34 in the viewBox — the sign CSS aligns that line with the frame's top edge.
 */
export function Cat({ className, paused = false }: { className?: string; paused?: boolean }) {
  const reduce = useReducedMotion();
  const [blink, setBlink] = useState(false);
  const [talk, setTalk] = useState(false);
  const talkTimer = useRef<number | undefined>(undefined);

  // occasional (random) blinks, sometimes a double blink; stops while out of view or the tab is hidden
  useEffect(() => {
    if (reduce || paused) return;
    let t: number | undefined;
    const timers: number[] = [];
    const schedule = () => {
      t = window.setTimeout(() => {
        if (document.hidden) return; // resumes on visibilitychange
        timers.length = 0; // the previous blink's timers (< 0.5s) have all fired by now
        setBlink(true);
        timers.push(window.setTimeout(() => setBlink(false), 140));
        if (Math.random() < 0.3) {
          timers.push(window.setTimeout(() => setBlink(true), 300));
          timers.push(window.setTimeout(() => setBlink(false), 440));
        }
        schedule();
      }, 2200 + Math.random() * 4200);
    };
    const onVisibility = () => {
      window.clearTimeout(t);
      if (!document.hidden) schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(t);
      timers.forEach((id) => window.clearTimeout(id));
      document.removeEventListener('visibilitychange', onVisibility);
      setBlink(false);
    };
  }, [reduce, paused]);

  useEffect(() => () => window.clearTimeout(talkTimer.current), []);

  const onHover = () => {
    if (reduce) return;
    setTalk(true);
    window.clearTimeout(talkTimer.current);
    talkTimer.current = window.setTimeout(() => setTalk(false), 1400);
  };

  return (
    <span className={[styles.catWrap, className].filter(Boolean).join(' ')} aria-hidden="true" onPointerEnter={onHover}>
      <svg className={styles.cat} viewBox="0 0 44 52" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {/* tail (dangles over the frame) */}
        <path className={[styles.catTail, talk && styles.catTailFast].filter(Boolean).join(' ')} d="M30 32.5 C35 32.3, 38.2 35, 37.7 40 C37.3 44.4, 34.3 46.6, 35.7 50.2" />
        {/* body */}
        <path d="M16.2 20.8 C12.6 23.8, 11.5 28.7, 12.6 34 M25.8 20.8 C29.5 23.8, 31.2 28.9, 30 34" />
        <path d="M14.3 34 C14.6 31.9, 17.8 31.9, 18.1 34 M23.9 34 C24.2 31.9, 27.4 31.9, 27.7 34" />
        <path d="M19.4 24.4 L21 25.8 L22.6 24.4" strokeWidth="1.1" opacity="0.7" />
        {/* head + ears */}
        <path
          className={talk ? styles.catHeadTilt : undefined}
          d="M13 14.5 C12.4 10.5, 12.6 7, 13.4 3.4 L18 7.3 C19.8 6.8, 22.2 6.8, 24 7.3 L28.6 3.4 C29.4 7, 29.6 10.5, 29 14.5 C28.6 19, 25.4 21.7, 21 21.7 C16.6 21.7, 13.4 19, 13 14.5 Z"
        />
        {/* eyes */}
        <g className={styles.catEyes} style={{ transform: blink ? 'scaleY(0.12)' : 'scaleY(1)' }}>
          <ellipse cx="17.8" cy="13.6" rx="1.15" ry="1.5" fill="currentColor" stroke="none" />
          <ellipse cx="24.2" cy="13.6" rx="1.15" ry="1.5" fill="currentColor" stroke="none" />
        </g>
        {/* nose, mouth, whiskers */}
        <path d="M20.3 16.5 L21.7 16.5 L21 17.4 Z" fill="currentColor" strokeWidth="0.8" />
        <path d="M21 17.4 Q20.1 18.7 19.1 18.1 M21 17.4 Q21.9 18.7 22.9 18.1" strokeWidth="1" />
        <path d="M16 16.8 L10.4 15.7 M16 18 L10.7 19 M26 16.8 L31.6 15.7 M26 18 L31.3 19" strokeWidth="0.9" opacity="0.75" />
      </svg>
      <AnimatePresence>
        {talk && (
          <motion.span
            className={styles.catBubble}
            initial={{ opacity: 0, y: 6, scale: 0.7, rotate: -8 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: -6 }}
            exit={{ opacity: 0, y: -6, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          >
            mrrp?
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
