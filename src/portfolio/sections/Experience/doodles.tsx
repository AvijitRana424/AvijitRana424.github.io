import { motion, useReducedMotion, type Variants } from 'framer-motion';
import styles from './Experience.module.css';

/**
 * Hand-drawn line art for the Experience sheet. Every stroke "draws in" once when it
 * scrolls into view (pathLength); reduced-motion users get the finished drawing.
 */

const stroke: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: (i: number = 0) => ({
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { delay: i * 0.1, duration: 0.65, ease: 'easeInOut' },
      opacity: { delay: i * 0.1, duration: 0.01 },
    },
  }),
};

const fade: Variants = {
  hidden: { opacity: 0, scale: 0.4 },
  show: (i: number = 0) => ({ opacity: 1, scale: 1, transition: { delay: i * 0.1, type: 'spring', stiffness: 380, damping: 18 } }),
};

/** Parent props that drive the draw-in, or nothing at all for reduced motion (static drawing). */
function useDrawIn(margin = '-60px') {
  const reduce = useReducedMotion();
  return reduce ? {} : { initial: 'hidden' as const, whileInView: 'show' as const, viewport: { once: true, margin } };
}

/** A chalk cat hiding behind a laptop, peeking over the top edge of the paper. */
export function CatLaptop({ className }: { className?: string }) {
  const draw = useDrawIn('0px');
  return (
    <motion.svg className={className} viewBox="0 0 200 150" aria-hidden="true" {...draw}>
      <g fill="none" stroke="var(--chalk)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {/* coffee mug + steam */}
        <motion.path variants={stroke} custom={0} d="M6 143 L 8.5 119 C 14 118, 22 118, 28 119.5 L 26 143 C 19 144, 12 144, 6 143 Z" />
        <motion.path variants={stroke} custom={1} d="M27.5 124 C 36 123, 37 136, 26.5 136" />
        <motion.path variants={stroke} custom={2} className={styles.steam} d="M13 111 C 9 105, 17 101, 13.5 94" stroke="var(--chalk-dim)" />
        <motion.path variants={stroke} custom={2.5} className={styles.steam2} d="M21 111 C 17 105, 25 101, 21.5 94" stroke="var(--chalk-dim)" />

        {/* tail curling out from behind the laptop */}
        <motion.path variants={stroke} custom={1} d="M156 118 C 175 117, 189 101, 182 87 C 177 77, 164 80, 168 91" />

        {/* head + ears */}
        <motion.path
          variants={stroke}
          custom={2}
          d="M63.5 70 C 60 55, 61.5 39, 66 22.5 C 72.5 28, 78 33.5, 84.5 38 C 94 34, 106.5 34, 116 38.2 C 122.5 33, 128 27.5, 134.5 22 C 139 38, 140 55, 136.5 70"
        />
        <motion.path variants={stroke} custom={3} d="M69.5 31 C 71 35, 74 37.5, 77.5 38.5" stroke="var(--chalk-dim)" />
        <motion.path variants={stroke} custom={3} d="M131 31 C 129.5 35, 126.5 37.5, 123 38.5" stroke="var(--chalk-dim)" />

        {/* whiskers */}
        <motion.path variants={stroke} custom={4} d="M83 60 L 64 56.5 M83 63.5 L 65 65" stroke="var(--chalk-dim)" strokeWidth="1.6" />
        <motion.path variants={stroke} custom={4} d="M117 60 L 136 56.5 M117 63.5 L 135 65" stroke="var(--chalk-dim)" strokeWidth="1.6" />
        {/* nose + mouth */}
        <motion.path variants={stroke} custom={4.5} d="M97 59.5 C 99 58.8, 101 58.8, 103 59.5 L 100 62.5 Z M100 62.5 C 99.5 65.5, 96.5 66.5, 94.5 64.8 M100 62.5 C 100.5 65.5, 103.5 66.5, 105.5 64.8" strokeWidth="1.8" />

        {/* laptop screen, paws on top */}
        <motion.path
          variants={stroke}
          custom={1.5}
          d="M46 73 C 82 71.5, 118 71.5, 154.5 72.8 C 158.5 73, 160.5 75.5, 160.3 79 L 159.6 130 L 40.6 130.5 L 40 79.5 C 40 75.5, 42 73.2, 46 73 Z"
          fill="var(--board-3)"
        />
        <motion.path variants={stroke} custom={5} d="M71 75 C 70 66.5, 86.5 66, 86 75" />
        <motion.path variants={stroke} custom={5} d="M114 75 C 113.5 66, 130 66.5, 129 75" />
        <motion.path variants={stroke} custom={5.5} d="M76 69.5 L 76.5 73 M81 69.5 L 80.5 73 M119 69.5 L 119.5 73 M124 69.5 L 123.5 73" strokeWidth="1.4" stroke="var(--chalk-dim)" />

        {/* </> on the screen */}
        <motion.path variants={stroke} custom={6} d="M83 92 L 73 101 L 83.5 110" stroke="var(--chalk-yellow)" />
        <motion.path variants={stroke} custom={6.5} d="M117 92 L 127 101 L 116.5 110" stroke="var(--chalk-yellow)" />
        <motion.path variants={stroke} custom={7} d="M106 87.5 L 94 114" stroke="var(--chalk-red)" />

        {/* keyboard base */}
        <motion.path variants={stroke} custom={2.5} d="M27 133 C 76 132, 125 132, 173 133 C 172.5 139, 168.5 143.5, 162 143.5 L 38 143.8 C 31.5 143.5, 27.5 139, 27 133 Z" />
        <motion.path variants={stroke} custom={3} d="M88 133.5 C 95 136, 105 136, 112 133.5" strokeWidth="1.6" stroke="var(--chalk-dim)" />

        {/* sparkle */}
        <motion.path variants={stroke} custom={8} d="M160 27 L 160 41 M153 34 L 167 34" stroke="var(--chalk-yellow)" strokeWidth="2" />
        <motion.path variants={stroke} custom={8.5} d="M176 48 L 176 55 M172.5 51.5 L 179.5 51.5" stroke="var(--chalk-yellow)" strokeWidth="1.6" />
      </g>
      {/* eyes (blink on a loop) */}
      <motion.g variants={fade} custom={5}>
        <g className={styles.eyes}>
          <ellipse cx="89" cy="51.5" rx="3" ry="4.2" fill="var(--chalk)" />
          <ellipse cx="111" cy="51.5" rx="3" ry="4.2" fill="var(--chalk)" />
        </g>
      </motion.g>
    </motion.svg>
  );
}

/** Hand-drawn red ellipse that circles a number (e.g. the CGPA). */
export function CircleMark({ className }: { className?: string }) {
  const draw = useDrawIn('-40px');
  return (
    <motion.svg className={className} viewBox="0 0 120 50" preserveAspectRatio="none" aria-hidden="true" {...draw}>
      <motion.path
        variants={stroke}
        custom={3}
        d="M14 27 C 10 10, 96 3, 111 18 C 122 30, 88 46, 48 45 C 16 44, 3 34, 9 21 C 13 13, 32 7, 62 6"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </motion.svg>
  );
}

/** Curvy "promoted ↑" arrow that points from the older role up to the newer one. */
export function PromoArrow({ className }: { className?: string }) {
  const draw = useDrawIn('-40px');
  return (
    <motion.svg className={className} viewBox="0 0 40 68" aria-hidden="true" {...draw}>
      <g fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <motion.path variants={stroke} custom={0} d="M31 63 C 14 58, 7 44, 11 30 C 13.5 21, 17 13, 20.5 6" />
        <motion.path variants={stroke} custom={6} d="M11 14.5 L 20.5 4.5 L 28.5 14" strokeWidth="2.8" />
      </g>
    </motion.svg>
  );
}

/** Wobbly pencil line used to divide the sheet. */
export function WavyDivider({ className }: { className?: string }) {
  const draw = useDrawIn('-40px');
  return (
    <motion.svg className={className} viewBox="0 0 1000 16" preserveAspectRatio="none" aria-hidden="true" {...draw}>
      <motion.path
        variants={stroke}
        d="M3 9 C 60 4, 110 13, 170 8 S 280 3, 350 9 S 470 14, 540 8 S 660 3, 730 9 S 860 13, 997 7"
        fill="none"
        stroke="var(--ink-3)"
        strokeOpacity="0.55"
        strokeWidth="1.8"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </motion.svg>
  );
}

/** Award rosette doodle: scalloped medal, star and two ribbon tails. */
export function Rosette({ className }: { className?: string }) {
  const draw = useDrawIn('-40px');
  // scalloped edge: 12 bumps around (40, 36)
  const bumps = 12;
  const R = 23;
  const r = 19.5;
  let d = '';
  for (let i = 0; i <= bumps; i++) {
    const a0 = (i / bumps) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 0.5) / bumps) * Math.PI * 2 - Math.PI / 2;
    const x0 = 40 + Math.cos(a0) * r;
    const y0 = 36 + Math.sin(a0) * r;
    const x1 = 40 + Math.cos(a1) * R * 1.12;
    const y1 = 36 + Math.sin(a1) * R * 1.12;
    const a2 = ((i + 1) / bumps) * Math.PI * 2 - Math.PI / 2;
    const x2 = 40 + Math.cos(a2) * r;
    const y2 = 36 + Math.sin(a2) * r;
    d += i === 0 ? `M${x0.toFixed(1)} ${y0.toFixed(1)} ` : '';
    if (i < bumps) d += `Q${x1.toFixed(1)} ${y1.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)} `;
  }
  return (
    <motion.svg className={className} viewBox="0 0 80 100" aria-hidden="true" {...draw}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <motion.path variants={stroke} custom={2} d="M29 52 L 20 92 L 30 85 L 36 96 L 41 58" stroke="var(--accent)" strokeWidth="2.2" fill="var(--accent-soft)" />
        <motion.path variants={stroke} custom={2.5} d="M51 52 L 60 92 L 50 85 L 44 96 L 39 58" stroke="var(--accent)" strokeWidth="2.2" fill="var(--accent-soft)" />
        <motion.path variants={stroke} custom={0} d={d} stroke="var(--accent)" strokeWidth="2.2" fill="var(--paper)" />
        <motion.circle variants={stroke} custom={1} cx="40" cy="36" r="13" stroke="var(--ink-2)" strokeWidth="1.6" />
        <motion.path
          variants={stroke}
          custom={3}
          d="M40 27.5 L 42.6 33 L 48.4 33.4 L 44 37.2 L 45.4 43 L 40 40 L 34.6 43 L 36 37.2 L 31.6 33.4 L 37.4 33 Z"
          stroke="var(--ink)"
          strokeWidth="1.6"
          fill="var(--chalk-yellow)"
        />
      </g>
    </motion.svg>
  );
}
