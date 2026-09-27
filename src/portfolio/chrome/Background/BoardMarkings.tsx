import { motion } from 'framer-motion';
import styles from './Background.module.css';

/* Deterministic wobble so hand-drawn paths are identical on every render. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

/** A slightly wobbly arc (polyline) from a0 to a1 degrees; y axis points up like a protractor. */
function wobblyArc(cx: number, cy: number, r: number, a0: number, a1: number, seed: number, wobble = 0.9) {
  const rand = rng(seed);
  const steps = Math.max(8, Math.round(Math.abs(a1 - a0) / 4));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    const rr = r + (rand() - 0.5) * wobble * 2;
    d += `${i ? 'L' : 'M'}${f(cx + rr * Math.cos(a))} ${f(cy - rr * Math.sin(a))}`;
  }
  return d;
}

function ticks(cx: number, cy: number, r: number, a0: number, a1: number, every: number, seed: number) {
  const rand = rng(seed);
  let d = '';
  for (let a = a0; a <= a1 + 0.01; a += every) {
    const major = a % 15 === 0;
    const len = major ? 10 : 5;
    const rad = (a * Math.PI) / 180;
    const j = (rand() - 0.5) * 0.8;
    d += `M${f(cx + r * Math.cos(rad))} ${f(cy - r * Math.sin(rad))}L${f(cx + (r - len) * Math.cos(rad) + j)} ${f(cy - (r - len) * Math.sin(rad))}`;
  }
  return d;
}

const LABELS = [15, 30, 45, 60];

function labelPos(cx: number, cy: number, r: number, a: number) {
  const rad = (a * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

// ── pre-computed geometry ───────────────────────────────────────────────────
// Semicircle protractor (220 × 130)
const P1 = { cx: 110, cy: 118, r: 96 };
const p1Arc = wobblyArc(P1.cx, P1.cy, P1.r, 0, 180, 7);
const p1Inner = wobblyArc(P1.cx, P1.cy, 22, 0, 180, 11, 0.5);
const p1Ticks = ticks(P1.cx, P1.cy, P1.r, 0, 180, 5, 3);
const p1Base = `M4 ${P1.cy + 0.6}L${P1.cx * 2 - 4} ${P1.cy - 0.4}`;
const p1Ray = (() => {
  const e = labelPos(P1.cx, P1.cy, P1.r + 14, 45);
  return `M${P1.cx} ${P1.cy}L${f(e.x)} ${f(e.y)}`;
})();

// Quarter protractor (150 × 150), origin bottom-left
const P2 = { cx: 14, cy: 136, r: 112 };
const p2Arc = wobblyArc(P2.cx, P2.cy, P2.r, 0, 90, 19);
const p2Ticks = ticks(P2.cx, P2.cy, P2.r, 0, 90, 5, 23);
const p2Axes = `M${P2.cx} ${P2.cy}L${P2.cx + P2.r + 16} ${P2.cy - 0.8}M${P2.cx} ${P2.cy}L${P2.cx + 0.6} ${P2.cy - P2.r - 16}`;
const p2Angle = (() => {
  const e = labelPos(P2.cx, P2.cy, P2.r - 18, 30);
  return `M${P2.cx} ${P2.cy}L${f(e.x)} ${f(e.y)}`;
})();
const p2Theta = wobblyArc(P2.cx, P2.cy, 30, 0, 30, 29, 0.4);

// Ruler (edge) — ticks every 12px, numbers every 5th tick
const RULER_STEP = 12;
const RULER_TICKS = 220; // covers ~2640px tall viewports
const rulerPath = (() => {
  let d = 'M1 0L1 ' + RULER_TICKS * RULER_STEP;
  for (let i = 1; i < RULER_TICKS; i++) {
    const y = i * RULER_STEP;
    d += `M1 ${y}L${i % 5 === 0 ? 12 : 6} ${y}`;
  }
  return d;
})();
const rulerNums = Array.from({ length: Math.floor(RULER_TICKS / 5) }, (_, i) => (i + 1) * 5);

const CROSSES: { x: string; y: string; ring?: boolean; hideSm?: boolean }[] = [
  { x: '7%', y: '15%' },
  { x: '93%', y: '9%', ring: true },
  { x: '90%', y: '63%' },
  { x: '5%', y: '47%', ring: true, hideSm: true },
  { x: '47%', y: '95%', hideSm: true },
  { x: '63%', y: '5%', hideSm: true },
  { x: '28%', y: '82%', ring: true, hideSm: true },
];

function Ruler({ side }: { side: 'left' | 'right' }) {
  const right = side === 'right';
  return (
    <svg className={`${styles.ruler} ${right ? styles.rulerRight : styles.rulerLeft}`} width="34" height={RULER_TICKS * RULER_STEP}>
      <path d={rulerPath} transform={right ? 'translate(34 0) scale(-1 1)' : undefined} />
      {rulerNums.map((n) => (
        <text
          key={n}
          x={right ? 18 : 16}
          y={n * RULER_STEP + 4}
          textAnchor={right ? 'end' : 'start'}
          className={styles.rulerNum}
        >
          {n}
        </text>
      ))}
    </svg>
  );
}

function Draw({ d, animate, delay = 0, dur = 1.6, dash }: { d: string; animate: boolean; delay?: number; dur?: number; dash?: boolean }) {
  if (!animate) return <path d={d} strokeDasharray={dash ? '4 5' : undefined} />;
  return (
    <motion.path
      d={d}
      strokeDasharray={dash ? '4 5' : undefined}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ pathLength: { duration: dur, delay, ease: [0.65, 0, 0.35, 1] }, opacity: { duration: 0.2, delay } }}
    />
  );
}

/** Faint registration crosses, protractor arcs and edge rulers "drawn" on the board. */
export function BoardMarkings({ animate }: { animate: boolean }) {
  return (
    <div className={styles.markings}>
      {/* edge rulers */}
      <Ruler side="left" />
      <Ruler side="right" />

      {/* registration crosses */}
      {CROSSES.map((c, i) => (
        <svg
          key={i}
          className={`${styles.cross} ${c.hideSm ? styles.hideSm : ''}`}
          style={{ left: c.x, top: c.y }}
          width="26"
          height="26"
          viewBox="-13 -13 26 26"
        >
          <Draw d="M-9 0.4L9 -0.4M0.3 -9L-0.3 9" animate={animate} delay={0.4 + i * 0.12} dur={0.5} />
          {c.ring && <Draw d={wobblyArc(0, 0, 5.5, 0, 360, 40 + i, 0.4)} animate={animate} delay={0.6 + i * 0.12} dur={0.7} />}
        </svg>
      ))}

      {/* semicircle protractor, upper right */}
      <svg className={`${styles.protractor} ${styles.p1}`} width="220" height="140" viewBox="0 0 220 140">
        <Draw d={p1Base} animate={animate} delay={0.2} dur={0.8} />
        <Draw d={p1Arc} animate={animate} delay={0.5} dur={1.8} />
        <Draw d={p1Inner} animate={animate} delay={0.9} dur={0.9} />
        <Draw d={p1Ticks} animate={animate} delay={1.2} dur={1.4} />
        <Draw d={p1Ray} animate={animate} delay={1.8} dur={0.7} dash />
        {LABELS.map((a) => {
          const p = labelPos(P1.cx, P1.cy, P1.r - 20, a);
          return (
            <text key={a} x={p.x} y={p.y + 4} textAnchor="middle" className={styles.deg}>
              {a}°
            </text>
          );
        })}
        {LABELS.map((a) => {
          const p = labelPos(P1.cx, P1.cy, P1.r - 20, 180 - a);
          return (
            <text key={`m${a}`} x={p.x} y={p.y + 4} textAnchor="middle" className={`${styles.deg} ${styles.degDim}`}>
              {a}°
            </text>
          );
        })}
      </svg>

      {/* quarter protractor, lower left */}
      <svg className={`${styles.protractor} ${styles.p2}`} width="150" height="150" viewBox="0 0 150 150">
        <Draw d={p2Axes} animate={animate} delay={0.3} dur={0.9} />
        <Draw d={p2Arc} animate={animate} delay={0.7} dur={1.5} />
        <Draw d={p2Ticks} animate={animate} delay={1.3} dur={1.2} />
        <Draw d={p2Angle} animate={animate} delay={1.9} dur={0.6} />
        <Draw d={p2Theta} animate={animate} delay={2.3} dur={0.5} />
        {LABELS.map((a) => {
          const p = labelPos(P2.cx, P2.cy, P2.r + 13, a);
          return (
            <text key={a} x={p.x} y={p.y + 4} textAnchor="middle" className={styles.deg}>
              {a}°
            </text>
          );
        })}
        <text x={P2.cx + 40} y={P2.cy - 8} className={styles.theta}>
          θ
        </text>
      </svg>
    </div>
  );
}
