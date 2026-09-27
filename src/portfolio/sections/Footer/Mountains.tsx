import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import styles from './Footer.module.css';

// ── drawing helpers ────────────────────────────────────────────────────────────
type Pt = [number, number];

/** deterministic PRNG so the "hand-drawn" wobble is identical on every render */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Polyline → slightly bowed quadratic segments: reads as a confident chalk line, not a ruler. */
function wobble(points: Pt[], amp = 2.2, seed = 7) {
  const r = rng(seed);
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const off = (r() - 0.5) * 2 * amp * Math.min(1, len / 40);
    const cx = mx + (-(y1 - y0) / len) * off;
    const cy = my + ((x1 - x0) / len) * off;
    d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1} ${y1}`;
  }
  return d;
}

function pine(x: number, base: number, h: number) {
  const w = h * 0.34;
  const t = (f: number) => (base - h * f).toFixed(1);
  const pts = [
    `M${x} ${t(1)}`,
    `L${(x - w * 0.5).toFixed(1)} ${t(0.62)}`,
    `L${(x - w * 0.22).toFixed(1)} ${t(0.64)}`,
    `L${(x - w * 0.8).toFixed(1)} ${t(0.3)}`,
    `L${(x - w * 0.3).toFixed(1)} ${t(0.33)}`,
    `L${(x - w).toFixed(1)} ${t(0.08)}`,
    `L${(x + w).toFixed(1)} ${t(0.08)}`,
    `L${(x + w * 0.3).toFixed(1)} ${t(0.33)}`,
    `L${(x + w * 0.8).toFixed(1)} ${t(0.3)}`,
    `L${(x + w * 0.22).toFixed(1)} ${t(0.64)}`,
    `L${(x + w * 0.5).toFixed(1)} ${t(0.62)}`,
    'Z',
    `M${x} ${t(0.08)} L${x} ${base}`,
  ];
  return pts.join(' ');
}

const bird = (x: number, y: number, s: number) =>
  `M${x - s} ${y - s * 0.5} Q${x - s * 0.45} ${y - s * 0.75} ${x} ${y} Q${x + s * 0.45} ${y - s * 0.75} ${x + s} ${y - s * 0.5}`;

const star = (x: number, y: number, s = 4) => `M${x - s} ${y} L${x + s} ${y} M${x} ${y - s} L${x} ${y + s}`;

// ── the scene (viewBox 0 0 1200 400) ──────────────────────────────────────────
const FRONT: Pt[] = [
  [0, 352], [60, 330], [110, 300], [150, 268], [190, 236], [228, 208], [250, 196], [272, 212], [300, 232], [330, 222],
  [360, 244], [392, 258], [430, 226], [470, 190], [505, 160], [540, 128], [575, 100], [610, 76], [636, 58], [660, 74],
  [690, 98], [720, 122], [752, 150], [790, 180], [822, 202], [850, 188], [885, 166], [918, 146], [948, 132], [975, 150],
  [1008, 176], [1045, 206], [1085, 236], [1130, 268], [1170, 296], [1200, 314],
];
const BACK: Pt[][] = [
  [[0, 296], [36, 276], [70, 258], [96, 262], [130, 284]],
  [[330, 222], [356, 196], [384, 170], [410, 150], [430, 166], [452, 206]],
  [[752, 150], [780, 128], [805, 112], [828, 122], [852, 142], [870, 175]],
  [[1008, 176], [1040, 160], [1075, 146], [1100, 152], [1130, 170], [1165, 196], [1200, 218]],
];
const SNOW: Pt[][] = [
  [[592, 88], [604, 100], [616, 90], [628, 104], [640, 92], [652, 103], [664, 91], [677, 88]],
  [[911, 150], [922, 160], [934, 151], [946, 162], [958, 152], [970, 160], [975, 150]],
  [[220, 214], [230, 222], [240, 214], [252, 224], [263, 215], [275, 214]],
];
const GROUND = 'M-10 372 C 180 367, 380 376, 600 371 S 1000 367, 1210 373';
const TRAIL =
  'M372 366 C 420 356, 470 344, 520 330 C 560 318, 560 300, 520 290 C 480 280, 470 262, 520 250 C 570 238, 600 226, 610 208 C 618 190, 590 180, 570 170 C 550 158, 560 140, 590 130 C 615 120, 628 100, 632 82 L 636 60';
const PINES = [pine(46, 371, 30), pine(74, 371, 44), pine(104, 371, 26), pine(716, 371, 30), pine(742, 371, 22), pine(1060, 371, 36), pine(1090, 371, 26), pine(1146, 371, 40)];
const BIRDS = [bird(772, 58, 9), bird(800, 42, 6.5), bird(826, 64, 5), bird(300, 96, 7), bird(322, 84, 5)];
const STARS = [star(236, 58), star(430, 36, 3), star(1010, 54), star(1112, 96, 3), star(880, 30, 3.5), star(96, 150, 3)];
const MOON = 'M186 62 C 166 60, 150 78, 152 96 C 154 114, 172 126, 190 120 C 176 116, 166 104, 167 90 C 168 76, 176 66, 186 62 Z';

type Timing = [delay: number, duration: number];
const draw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: ([delay, duration]: Timing) => ({
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { delay, duration, ease: [0.45, 0, 0.25, 1] }, opacity: { delay, duration: 0.2 } },
  }),
};
const fade: Variants = {
  hidden: { opacity: 0 },
  show: (delay: number) => ({ opacity: 1, transition: { delay, duration: 0.6 } }),
};

const HIKER_SCALE = 1.6;

/** Chalk mountain range that draws itself, with a tiny hiker that climbs to the flag as the page ends. */
export function Mountains({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const trailRef = useRef<SVGPathElement>(null);
  const hikerRef = useRef<SVGGElement>(null);
  const legA = useRef<SVGLineElement>(null);
  const legB = useRef<SVGLineElement>(null);
  const lenRef = useRef(0);
  const [summit, setSummit] = useState(!!reduce);

  // scroll progress across the footer ("the last screen of the page")
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end end'] });
  const climb = useTransform(scrollYProgress, [0.18, 0.96], [0, 1], { clamp: true });
  const smooth = useSpring(climb, { stiffness: 90, damping: 22, restDelta: 0.0005 });
  const trailProgress = useTransform(smooth, (v) => Math.max(0.001, v));

  const place = (v: number) => {
    const path = trailRef.current;
    const g = hikerRef.current;
    if (!path || !g) return;
    if (!lenRef.current) lenRef.current = path.getTotalLength();
    const L = lenRef.current;
    const d = Math.min(L, Math.max(0, v * L));
    const p = path.getPointAtLength(d);
    const a = path.getPointAtLength(Math.min(L, d + 3));
    const b = path.getPointAtLength(Math.max(0, d - 3));
    const dir = a.x - b.x >= -0.01 ? 1 : -1;
    g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${dir * HIKER_SCALE} ${HIKER_SCALE})`);
    const swing = v >= 0.995 ? 2.4 : Math.sin(d / 3.2) * 3.2;
    legA.current?.setAttribute('x2', swing.toFixed(2));
    legB.current?.setAttribute('x2', (-swing).toFixed(2));
    setSummit(v >= 0.985);
  };

  useMotionValueEvent(smooth, 'change', (v) => {
    if (!reduce) place(v);
  });
  useEffect(() => {
    place(reduce ? 1 : smooth.get());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  const v = reduce ? undefined : draw;
  const f = reduce ? undefined : fade;

  return (
    <motion.svg
      className={styles.mountains}
      viewBox="0 0 1200 400"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="Chalk drawing of a mountain range with a hiker climbing toward a flag on the highest peak"
      initial={reduce ? undefined : 'hidden'}
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
    >
      {/* sky: moon, stars, birds */}
      <g className={styles.faint}>
        <motion.path d={MOON} variants={v} custom={[0.2, 1.2] as Timing} />
      </g>
      <g className={styles.stars}>
        {STARS.map((d, i) => (
          <motion.path key={d} d={d} variants={v} custom={[0.5 + i * 0.12, 0.35] as Timing} style={{ animationDelay: `${i * 0.7}s` }} />
        ))}
      </g>
      <g className={styles.birds}>
        {BIRDS.map((d, i) => (
          <motion.path key={d} d={d} variants={v} custom={[2 + i * 0.12, 0.5] as Timing} />
        ))}
      </g>

      {/* back ridges (fainter, thinner) */}
      <g className={styles.back}>
        {BACK.map((pts, i) => (
          <motion.path key={i} d={wobble(pts, 2, 11 + i)} variants={v} custom={[0.9 + i * 0.15, 1] as Timing} />
        ))}
      </g>

      {/* front ridge + ground */}
      <g className={styles.front}>
        <motion.path d={GROUND} variants={v} custom={[0, 1.4] as Timing} />
        <motion.path d={wobble(FRONT, 2.6, 3)} variants={v} custom={[0.15, 2.2] as Timing} />
      </g>

      {/* snow lines */}
      <g className={styles.snow}>
        {SNOW.map((pts, i) => (
          <motion.path key={i} d={wobble(pts, 0.8, 21 + i)} variants={v} custom={[1.5 + i * 0.12, 0.6] as Timing} />
        ))}
      </g>

      {/* pines */}
      <g className={styles.pines}>
        {PINES.map((d, i) => (
          <motion.path key={i} d={d} variants={v} custom={[1.4 + i * 0.08, 0.8] as Timing} />
        ))}
      </g>

      {/* trail: dotted guide + red chalk showing how far you've climbed */}
      <motion.path ref={trailRef} d={TRAIL} className={styles.trail} variants={f} custom={2} />
      {!reduce && <motion.path d={TRAIL} className={styles.trailDone} style={{ pathLength: trailProgress }} variants={f} custom={2} />}

      {/* flag on the summit */}
      <g className={styles.flagPole}>
        <motion.path d="M636 60 C 635 46, 637 33, 636 20" variants={v} custom={[1.9, 0.4] as Timing} />
      </g>
      <motion.g className={styles.flagWrap} variants={f} custom={2.2}>
        <path className={styles.flag} d="M636 21 C 646 22, 657 25, 669 28 C 659 31, 647 35, 636 38" />
      </motion.g>

      <AnimatePresence>
        {summit && (
          <motion.g
            key="yay"
            className={styles.yay}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18 }}
            style={{ transformOrigin: '636px 36px', transformBox: 'view-box' }}
          >
            <path d="M618 20 L608 12 M614 34 L602 34 M676 12 L686 4 M682 30 L694 32 M650 6 L652 -6" />
            <text x="700" y="22" className={styles.yayText}>
              made it!
            </text>
          </motion.g>
        )}
      </AnimatePresence>

      {/* hiker (positioned imperatively along the trail) */}
      <motion.g variants={f} custom={2.3}>
        <g ref={hikerRef} className={styles.hiker} transform={`translate(372 366) scale(${HIKER_SCALE})`}>
          <rect x="-5.6" y="-15.5" width="4" height="6.5" rx="1.4" className={styles.pack} />
          <circle cx="0" cy="-19.2" r="3" />
          <path d="M0 -16 L0 -8" />
          <path d="M0 -13.5 L3.8 -10.2" />
          <path d="M5.2 -15.5 L4.2 0" className={styles.stick} />
          <line ref={legA} x1="0" y1="-8" x2="2.5" y2="0" />
          <line ref={legB} x1="0" y1="-8" x2="-2.5" y2="0" />
        </g>
      </motion.g>
    </motion.svg>
  );
}
