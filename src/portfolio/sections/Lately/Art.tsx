import { useId, type CSSProperties } from 'react';
import type { LatelyItem } from '@/data/profile';
import styles from './Art.module.css';

type Kind = LatelyItem['tagIcon'];

interface Props {
  kind: Kind;
  /** Idle animation on/off (off for reduced motion). */
  animate?: boolean;
  className?: string;
}

// ── tiny path helpers ────────────────────────────────────────────────────────
const f = (n: number) => n.toFixed(1);

function star(cx: number, cy: number, r: number, ri = r * 0.45, points = 5, rot = -90) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    const rr = i % 2 ? ri : r;
    d += `${i ? 'L' : 'M'}${f(cx + rr * Math.cos(a))} ${f(cy + rr * Math.sin(a))}`;
  }
  return d + 'Z';
}

/** Four-point "twinkle" sparkle with curved-in sides. */
function sparkle(cx: number, cy: number, r: number) {
  return `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;
}

/** Rosette edge: a circle with soft bumps. */
function scallop(cx: number, cy: number, r: number, bumps = 14, depth = 4) {
  let d = '';
  const steps = bumps * 8;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r + depth * Math.cos(a * bumps);
    d += `${i ? 'L' : 'M'}${f(cx + rr * Math.cos(a))} ${f(cy + rr * Math.sin(a))}`;
  }
  return d + 'Z';
}

const d = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

/** Scattered faint doodles so every panel feels hand-made. */
function Scribbles({ seed = 0 }: { seed?: number }) {
  const spots = [
    [22, 22],
    [214, 128],
    [206, 20],
    [28, 124],
  ];
  return (
    <g className={styles.faint}>
      {spots.map(([x, y], i) =>
        (i + seed) % 2 ? (
          <path key={i} d={`M${x - 4} ${y}L${x + 4} ${y}M${x} ${y - 4}L${x} ${y + 4}`} />
        ) : (
          <circle key={i} cx={x} cy={y} r="2.6" />
        ),
      )}
    </g>
  );
}

// ── illustrations ────────────────────────────────────────────────────────────
function Trophy() {
  return (
    <>
      <Scribbles />
      <g className={styles.confetti}>
        <rect x="58" y="36" width="6" height="3" rx="1" className={`${styles.fAccent} ${styles.fall}`} style={d(0)} />
        <rect x="176" y="46" width="6" height="3" rx="1" className={`${styles.fBlue} ${styles.fall}`} style={d(1.1)} />
        <rect x="70" y="88" width="5" height="3" rx="1" className={`${styles.fGreen} ${styles.fall}`} style={d(2)} />
        <path d="M168 94 q4 -5 8 0 t8 0" className={`${styles.ink} ${styles.thin}`} />
        <path d="M52 62 q4 -5 8 0" className={`${styles.ink} ${styles.thin}`} />
      </g>
      <ellipse cx="120" cy="127" rx="42" ry="5" className={styles.shadow} />
      <g className={styles.bob}>
        {/* handles: dark tube with a gold core */}
        <path d="M94 44 C 72 42, 72 72, 99 73" className={styles.tubeInk} />
        <path d="M94 44 C 72 42, 72 72, 99 73" className={styles.tubeGold} />
        <path d="M146 44 C 168 42, 168 72, 141 73" className={styles.tubeInk} />
        <path d="M146 44 C 168 42, 168 72, 141 73" className={styles.tubeGold} />
        {/* cup */}
        <path d="M90.5 30 L149.5 30.6 C 150.4 58, 142 82.5, 120.3 88.6 C 98.4 82, 89.4 58.2, 90.5 30 Z" className={`${styles.fGold} ${styles.ink}`} />
        <path d="M88.8 30.2 C 101 25.6, 139 25.4, 151.2 30.6" className={styles.ink} />
        <path d="M100.5 38 C 99.8 54, 103.6 68, 111.5 78" className={styles.shineLine} />
        <path d={star(121, 54, 10.5, 4.6)} className={`${styles.fPaper} ${styles.ink} ${styles.thin}`} />
        {/* stem + base */}
        <path d="M113.2 88 C 114.4 94, 114 98.6, 110.6 104.4 L129.6 104.4 C 126.2 98.6, 125.8 94, 127 88" className={`${styles.fGold} ${styles.ink}`} />
        <path d="M97.6 104.4 L142.6 104.2 L143.4 120.4 L96.8 120.8 Z" className={`${styles.fInk} ${styles.ink}`} />
        <path d="M109 112.6 L131 112.4" className={styles.paperLine} />
      </g>
      <g className={styles.fYellowSoft}>
        <path d={sparkle(70, 30, 7)} className={`${styles.twinkle} ${styles.ink} ${styles.thin}`} style={d(0)} />
        <path d={sparkle(172, 24, 6)} className={`${styles.twinkle} ${styles.ink} ${styles.thin}`} style={d(0.7)} />
        <path d={sparkle(184, 74, 8)} className={`${styles.twinkle} ${styles.ink} ${styles.thin}`} style={d(1.4)} />
        <path d={sparkle(58, 84, 5)} className={`${styles.twinkle} ${styles.ink} ${styles.thin}`} style={d(2.1)} />
      </g>
    </>
  );
}

function Rocket() {
  return (
    <>
      <Scribbles seed={1} />
      {/* planet */}
      <g className={styles.drift}>
        <circle cx="196" cy="34" r="11" className={`${styles.fGreen} ${styles.ink}`} />
        <path d="M180.6 38.6 C 176 43, 188 43.6, 200 38.8 C 211.6 34.2, 216.4 27.6, 211.2 28" className={`${styles.ink} ${styles.thin}`} />
      </g>
      <path d={star(42, 30, 5, 2.2)} className={`${styles.fYellowSoft} ${styles.ink} ${styles.thin} ${styles.twinkle}`} style={d(0.3)} />
      <circle cx="30" cy="70" r="1.8" className={`${styles.fInk} ${styles.twinkle}`} style={d(1.2)} />
      <circle cx="210" cy="96" r="1.8" className={`${styles.fInk} ${styles.twinkle}`} style={d(0.6)} />
      <path d={sparkle(178, 118, 5)} className={`${styles.fYellowSoft} ${styles.ink} ${styles.thin} ${styles.twinkle}`} style={d(1.8)} />
      <g transform="rotate(38 120 78)">
        {/* speed lines + smoke trail */}
        <g className={styles.speed}>
          <path d="M108 142 L108 168" />
          <path d="M120 146 L120 178" />
          <path d="M132 142 L132 166" />
        </g>
        <circle cx="113" cy="150" r="6" className={`${styles.fPaper} ${styles.ink} ${styles.thin} ${styles.puff}`} style={d(0)} />
        <circle cx="128" cy="156" r="4.6" className={`${styles.fPaper} ${styles.ink} ${styles.thin} ${styles.puff}`} style={d(0.6)} />
        <g className={styles.shake}>
          <g className={styles.flame}>
            <path d="M109.6 99 C 107.6 114, 114 124, 120 139 C 126 124, 132.4 114, 130.4 99 Z" className={`${styles.fGold} ${styles.ink}`} />
            <path d="M114.4 99 C 114 110, 117.2 118, 120 126.5 C 122.8 118, 126 110, 125.6 99 Z" className={styles.fAccent} />
          </g>
          <path d="M106.4 76 C 95.8 82, 91.6 93, 91.8 104.6 L108.2 98.4 Z" className={`${styles.fAccent} ${styles.ink}`} />
          <path d="M133.6 76 C 144.2 82, 148.4 93, 148.2 104.6 L131.8 98.4 Z" className={`${styles.fAccent} ${styles.ink}`} />
          <path d="M120 15 C 138.4 29.4, 142.2 62, 134.4 100.4 L105.6 100.4 C 97.8 62, 101.6 29.4, 120 15 Z" className={`${styles.fPaper} ${styles.ink}`} />
          <path d="M120 15 C 128.8 22, 134 30.6, 136.4 39.6 L103.6 39.6 C 106 30.6, 111.2 22, 120 15 Z" className={`${styles.fAccent} ${styles.ink}`} />
          <path d="M104.2 88.4 L135.8 88.4" className={styles.ink} />
          <circle cx="120" cy="60" r="9.4" className={`${styles.fBlue} ${styles.ink}`} />
          <path d="M114.6 57.6 A6 6 0 0 1 120.6 53.4" className={styles.shineLine} />
          <path d="M120 84 L120 104.4" className={styles.inkBold} />
        </g>
      </g>
    </>
  );
}

function Zap() {
  const lanes = [40, 75, 110];
  return (
    <>
      <Scribbles seed={1} />
      {lanes.map((y, li) => (
        <g key={y}>
          <path d={`M22 ${y} L218 ${y}`} className={styles.lane} />
          <path d={`M22 ${y - 7} L22 ${y + 7} M218 ${y - 7} L218 ${y + 7}`} className={`${styles.ink} ${styles.thin}`} />
          {[0, 1, 2].map((k) => (
            <rect
              key={k}
              x="24"
              y={y - 5}
              width="13"
              height="10"
              rx="2.4"
              className={`${k === 1 && li === 1 ? styles.fAccent : styles.fPaper} ${styles.ink} ${styles.thin} ${styles.msg}`}
              style={d(li * 0.45 + k * 1.1)}
            />
          ))}
        </g>
      ))}
      <circle cx="120" cy="76" r="40" className={`${styles.halo} ${styles.pulse}`} />
      <g className={styles.buzz}>
        <path
          d="M132 12 L91.6 84.2 L116.6 84.2 L102.4 139 L150.4 61.6 L124.4 61.6 L141.6 12.4 Z"
          className={`${styles.fGold} ${styles.inkBold}`}
        />
        <path d="M130 22 L106 70" className={styles.shineLine} />
      </g>
      <g className={`${styles.ink} ${styles.spark}`}>
        <path d="M86 57 L77 53 M88 64 L79 66" />
        <path d="M156 55 L165 51 M156 63 L165 65" />
        <path d="M84 92 L75 96 M154 90 L163 94" />
      </g>
    </>
  );
}

function Phone() {
  return (
    <>
      <Scribbles />
      {/* signal arcs */}
      <g className={styles.ink}>
        <path d="M70 36 A 14 14 0 0 1 82 26" className={`${styles.thin} ${styles.wave}`} style={d(0)} />
        <path d="M62 34 A 22 22 0 0 1 80 18" className={`${styles.thin} ${styles.wave}`} style={d(0.3)} />
      </g>
      <ellipse cx="120" cy="138" rx="36" ry="4" className={styles.shadow} />
      <g className={styles.rock}>
        <rect x="90" y="12" width="60" height="122" rx="11" className={`${styles.fInk} ${styles.ink}`} />
        <rect x="95.5" y="23" width="49" height="100" rx="4" className={styles.fPaper} />
        <path d="M112 17.6 L128 17.6" className={styles.paperLine} />
        <path d="M95.5 27 Q95.5 23 99.5 23 L140.5 23 Q144.5 23 144.5 27 L144.5 38 L95.5 38 Z" className={styles.fAccent} />
        <path d="M101 31 L117 31" className={styles.paperLine} />
        <rect x="101" y="45" width="17" height="17" rx="4.5" className={`${styles.fBlue} ${styles.ink} ${styles.thin}`} />
        <rect x="122" y="45" width="17" height="17" rx="4.5" className={`${styles.fGold} ${styles.ink} ${styles.thin}`} />
        <rect x="101" y="67" width="17" height="17" rx="4.5" className={`${styles.fGreen} ${styles.ink} ${styles.thin}`} />
        <rect x="122" y="67" width="17" height="17" rx="4.5" className={`${styles.fAccentSoft} ${styles.ink} ${styles.thin}`} />
        <path d="M101 94 L139 94 M101 102 L128 102" className={`${styles.ink} ${styles.thin} ${styles.dim}`} />
        <path d="M112 116.4 L128 116.4" className={`${styles.ink} ${styles.thin}`} />
      </g>
      {/* download badge */}
      <g className={styles.bob}>
        <circle cx="174" cy="46" r="15" className={`${styles.fGreen} ${styles.ink}`} />
        <path d="M174 37.6 L174 53 M167.6 47.2 L174 53.6 L180.4 47.2" className={styles.inkBold} />
      </g>
      <g className={styles.rise}>
        <path d={star(182, 96, 6, 2.6)} className={`${styles.fYellowSoft} ${styles.ink} ${styles.thin}`} />
      </g>
      <g className={styles.rise} style={d(1.2)}>
        <path d="M60 104 C 52 96, 60 88, 64 95 C 68 88, 76 96, 68 104 L64 108 Z" className={`${styles.fAccent} ${styles.ink} ${styles.thin}`} />
      </g>
      <path d={sparkle(62, 68, 5)} className={`${styles.fYellowSoft} ${styles.ink} ${styles.thin} ${styles.twinkle}`} style={d(0.8)} />
    </>
  );
}

function Radar({ uid }: { uid: string }) {
  const g = `sweep-${uid}`;
  const blips: [number, number, number][] = [
    // [x, y, clock angle° → ping delay]
    [146, 58, 60],
    [96, 102, 222],
    [138, 108, 152],
    [98, 60, 305],
  ];
  const P = 4;
  return (
    <>
      <Scribbles seed={1} />
      <defs>
        <linearGradient id={g} gradientUnits="userSpaceOnUse" x1="80" y1="66" x2="120" y2="32">
          <stop offset="0" className={styles.sweepStop0} />
          <stop offset="1" className={styles.sweepStop1} />
        </linearGradient>
      </defs>
      {/* little paper tags pinned around the scope */}
      <g className={styles.drift}>
        <rect x="178" y="30" width="36" height="22" rx="3" transform="rotate(6 196 41)" className={`${styles.fPaper} ${styles.ink} ${styles.thin}`} />
        <path d="M184 38 L204 39 M184 44 L198 45" transform="rotate(6 196 41)" className={`${styles.ink} ${styles.thin} ${styles.dim}`} />
      </g>
      <g className={styles.drift} style={d(1.4)}>
        <rect x="24" y="96" width="34" height="22" rx="3" transform="rotate(-7 41 107)" className={`${styles.fPaper} ${styles.ink} ${styles.thin}`} />
        <path d="M30 104 L50 103 M30 110 L44 109" transform="rotate(-7 41 107)" className={`${styles.ink} ${styles.thin} ${styles.dim}`} />
      </g>
      <circle cx="120" cy="76" r="60" className={`${styles.fInk} ${styles.ink}`} />
      <circle cx="120" cy="76" r="53" className={styles.scope} />
      <g className={styles.rings}>
        <circle cx="120" cy="76" r="17" />
        <circle cx="120" cy="76" r="34" />
        <circle cx="120" cy="76" r="50" />
        <path d="M120 24 L120 128 M68 76 L172 76" />
      </g>
      <g className={styles.spin} style={{ animationDuration: `${P}s` }}>
        <path d="M120 76 L76.7 51 A50 50 0 0 1 120 26 Z" fill={`url(#${g})`} />
        <path d="M120 76 L120 26" className={styles.sweepEdge} />
      </g>
      {blips.map(([x, y, a], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="3.4"
          className={styles.blip}
          style={{ animationDuration: `${P}s`, animationDelay: `${(a / 360) * P}s` }}
        />
      ))}
      <circle cx="120" cy="76" r="3" className={styles.fGreen} />
      {/* bezel ticks */}
      <g className={`${styles.paperLine} ${styles.thin}`}>
        <path d="M120 17.6 L120 21.6 M178.4 76 L174.4 76 M120 134.4 L120 130.4 M61.6 76 L65.6 76" />
      </g>
    </>
  );
}

function Coffee() {
  return (
    <>
      <Scribbles />
      <g className={`${styles.ink} ${styles.thin}`}>
        <path d="M104 44 C 96 36, 112 30, 104 20" className={styles.steam} style={d(0)} />
        <path d="M120 42 C 112 34, 128 28, 120 16" className={styles.steam} style={d(0.9)} />
        <path d="M136 44 C 128 36, 144 30, 136 20" className={styles.steam} style={d(1.8)} />
      </g>
      <ellipse cx="120" cy="124" rx="52" ry="8" className={`${styles.fPaper} ${styles.ink}`} />
      <path d="M149 66 C 172 64, 172 104, 145 104" className={styles.tubeInk} />
      <path d="M149 66 C 172 64, 172 104, 145 104" className={styles.tubeAccent} />
      <path d="M86.4 56 L90.6 114 C 92 124.6, 148 124.6, 149.4 114 L153.6 56 Z" className={`${styles.fAccent} ${styles.ink}`} />
      <ellipse cx="120" cy="56" rx="33.6" ry="7" className={`${styles.fKraft} ${styles.ink}`} />
      <path d="M100 64 C 100 80, 102 96, 106 108" className={styles.shineLine} />
      <path d="M120 98 C 108 88, 116 78, 120 85 C 124 78, 132 88, 120 98 Z" className={styles.fPaper} />
      <g>
        <ellipse cx="54" cy="112" rx="7" ry="5" transform="rotate(-24 54 112)" className={`${styles.fKraft} ${styles.ink} ${styles.thin}`} />
        <path d="M49 114.6 Q54 110 59 109.4" transform="rotate(-24 54 112)" className={`${styles.ink} ${styles.thin}`} />
        <ellipse cx="186" cy="110" rx="7" ry="5" transform="rotate(20 186 110)" className={`${styles.fKraft} ${styles.ink} ${styles.thin}`} />
        <path d="M181 112.6 Q186 108 191 107.4" transform="rotate(20 186 110)" className={`${styles.ink} ${styles.thin}`} />
      </g>
    </>
  );
}

function Award() {
  return (
    <>
      <Scribbles seed={1} />
      <g className={styles.sway}>
        <path d="M104 86 L92 136 L104.6 128.4 L113 139 L121 92 Z" className={`${styles.fAccent2} ${styles.ink}`} />
        <path d="M136 86 L148 136 L135.4 128.4 L127 139 L119 92 Z" className={`${styles.fAccent2} ${styles.ink}`} />
      </g>
      <g className={styles.wiggle}>
        <path d={scallop(120, 64, 38, 14, 3.6)} className={`${styles.fAccent} ${styles.ink}`} />
        <circle cx="120" cy="64" r="26" className={`${styles.fGold} ${styles.ink}`} />
        <circle cx="120" cy="64" r="20" className={`${styles.ink} ${styles.thin} ${styles.dim}`} />
        <path d={star(120, 65, 12, 5.2)} className={`${styles.fPaper} ${styles.ink} ${styles.thin}`} />
      </g>
      <path d={sparkle(66, 38, 7)} className={`${styles.fYellowSoft} ${styles.ink} ${styles.thin} ${styles.twinkle}`} style={d(0)} />
      <path d={sparkle(178, 44, 6)} className={`${styles.fYellowSoft} ${styles.ink} ${styles.thin} ${styles.twinkle}`} style={d(1)} />
      <path d={sparkle(176, 108, 5)} className={`${styles.fYellowSoft} ${styles.ink} ${styles.thin} ${styles.twinkle}`} style={d(1.8)} />
    </>
  );
}

/** Ink-on-tint illustration for a Lately card (viewBox 240×150). Decorative. */
export function Art({ kind, animate = true, className }: Props) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      className={[styles.art, animate && styles.live, className].filter(Boolean).join(' ')}
      viewBox="0 0 240 150"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'trophy' && <Trophy />}
      {kind === 'rocket' && <Rocket />}
      {kind === 'zap' && <Zap />}
      {kind === 'phone' && <Phone />}
      {kind === 'radar' && <Radar uid={uid} />}
      {kind === 'coffee' && <Coffee />}
      {kind === 'award' && <Award />}
    </svg>
  );
}
