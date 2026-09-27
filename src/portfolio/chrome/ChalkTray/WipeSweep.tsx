import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { EraserArt } from './Props';
import { WIPE_MS, eraserX, wipeEase } from './strokes';
import styles from './ChalkTray.module.css';

/**
 * A big felt eraser zig-zags across the viewport (right → left) whenever the board is
 * wiped. The drawing canvas clips its strokes to the same curve, so ink vanishes
 * exactly where the eraser passes.
 */
export function WipeSweep({ signal, reduced }: { signal: number; reduced: boolean }) {
  const [run, setRun] = useState<{ key: number; vw: number; vh: number } | null>(null);
  const last = useRef(signal);

  useEffect(() => {
    if (signal === last.current) return;
    last.current = signal;
    if (reduced) return;
    setRun({ key: signal, vw: document.documentElement.clientWidth || window.innerWidth, vh: window.innerHeight });
  }, [signal, reduced]);

  useEffect(() => {
    if (!run) return;
    const t = window.setTimeout(() => setRun(null), WIPE_MS + 450);
    return () => window.clearTimeout(t);
  }, [run]);

  if (!run) return null;
  const { vw, vh } = run;
  const d = WIPE_MS / 1000;
  const ys = [0.16, 0.66, 0.26, 0.6, 0.36].map((f) => f * vh - 40);
  return (
    <div className={styles.sweepLayer} aria-hidden="true">
      <motion.div
        key={run.key}
        className={styles.sweeper}
        initial={{ x: eraserX(0, vw), y: ys[0], rotate: -12, opacity: 1 }}
        animate={{ x: eraserX(1, vw), y: ys, rotate: [-12, 9, -9, 7, -4], opacity: [1, 1, 1, 1, 0] }}
        transition={{
          x: { duration: d, ease: wipeEase },
          y: { duration: d, ease: 'easeInOut' },
          rotate: { duration: d, ease: 'easeInOut' },
          opacity: { duration: d + 0.25, times: [0, 0.3, 0.6, 0.85, 1] },
        }}
      >
        <span className={styles.wake} />
        <span className={styles.puffs}>
          {Array.from({ length: 7 }, (_, i) => (
            <motion.span
              key={i}
              className={styles.puff}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
              animate={{ opacity: [0, 0.55, 0], x: 40 + i * 26, y: (i % 2 ? 1 : -1) * (14 + i * 5), scale: 1.4 }}
              transition={{ duration: 0.7, delay: 0.08 + i * 0.1, repeat: 1, repeatDelay: 0.05, ease: 'easeOut' }}
            />
          ))}
        </span>
        <EraserArt big />
      </motion.div>
    </div>
  );
}
