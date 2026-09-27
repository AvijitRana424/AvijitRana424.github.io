/**
 * Chalk stroke model + renderer.
 *
 * Strokes are stored in DOCUMENT coordinates: x relative to the viewport centre (so they
 * stay aligned with centred content when the window is resized) and y including scrollY.
 * The fixed canvas re-renders them translated by -scrollY.
 */
export type ChalkColor = 'white' | 'red' | 'yellow';

export interface Stroke {
  c: ChalkColor;
  /** line width, CSS px */
  w: number;
  /** flat [x0, y0, x1, y1, ...] */
  p: number[];
  /** seed for deterministic jitter */
  s: number;
  minY: number;
  maxY: number;
}

export const MAX_POINTS = 4000;
export const WIPE_MS = 1100;
const STORE_KEY = 'board:strokes:v1';

export const COLOR_VAR: Record<ChalkColor, string> = {
  white: '--chalk',
  red: '--chalk-red',
  yellow: '--chalk-yellow',
};

const FALLBACK: Record<ChalkColor, string> = { white: '#ece8df', red: '#e8685a', yellow: '#ecc94b' };

export function readChalkColors(): Record<ChalkColor, string> {
  const cs = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  (Object.keys(COLOR_VAR) as ChalkColor[]).forEach((k) => {
    const v = cs.getPropertyValue(COLOR_VAR[k]).trim();
    if (v) out[k] = v;
  });
  return out;
}

export function pointCount(strokes: Stroke[]) {
  let n = 0;
  for (const s of strokes) n += s.p.length / 2;
  return n;
}

/** Drop the oldest strokes until the total point budget fits. */
export function enforceBudget(strokes: Stroke[]) {
  let total = pointCount(strokes);
  while (total > MAX_POINTS && strokes.length > 1) {
    total -= strokes[0].p.length / 2;
    strokes.shift();
  }
  return strokes;
}

export function loadStrokes(): Stroke[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { v: number; strokes: Stroke[] };
    if (data?.v !== 1 || !Array.isArray(data.strokes)) return [];
    return enforceBudget(
      data.strokes.filter(
        (s) => s && Array.isArray(s.p) && s.p.length >= 2 && (s.c === 'white' || s.c === 'red' || s.c === 'yellow'),
      ),
    );
  } catch {
    return [];
  }
}

export function saveStrokes(strokes: Stroke[]) {
  try {
    if (!strokes.length) sessionStorage.removeItem(STORE_KEY);
    else
      sessionStorage.setItem(
        STORE_KEY,
        JSON.stringify({ v: 1, strokes: strokes.map((s) => ({ ...s, p: s.p.map((n) => Math.round(n * 10) / 10) })) }),
      );
  } catch {
    /* storage unavailable / full — drawings just won't survive a refresh */
  }
}

/* ── rendering ─────────────────────────────────────────────────────────────── */

/** cheap deterministic hash → [-0.5, 0.5) */
function jitter(i: number, k: number, seed: number) {
  const x = Math.sin(i * 12.9898 + k * 78.233 + seed * 37.719) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/** A grainy tile in the chalk colour: most pixels solid-ish, some skipped like chalk on slate. */
function grainTile(color: string) {
  const size = 96;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = Math.random();
    d[i + 3] = r < 0.14 ? Math.floor(Math.random() * 60) : 150 + Math.floor(Math.random() * 105);
  }
  g.putImageData(img, 0, 0);
  return c;
}

export interface Painter {
  colors: Record<ChalkColor, string>;
  patterns: Partial<Record<ChalkColor, CanvasPattern>>;
}

export function makePainter(ctx: CanvasRenderingContext2D): Painter {
  const colors = readChalkColors();
  const patterns: Painter['patterns'] = {};
  (Object.keys(colors) as ChalkColor[]).forEach((k) => {
    const tile = grainTile(colors[k]);
    const pat = tile ? ctx.createPattern(tile, 'repeat') : null;
    if (pat) patterns[k] = pat;
  });
  return { colors, patterns };
}

function trace(ctx: CanvasRenderingContext2D, s: Stroke, ox: number, oy: number, k: number, amp: number) {
  const p = s.p;
  const n = p.length / 2;
  ctx.beginPath();
  const jx = (i: number) => (amp ? jitter(i, k, s.s) * amp : 0);
  const jy = (i: number) => (amp ? jitter(i, k + 17, s.s) * amp : 0);
  const x0 = p[0] + ox + jx(0);
  const y0 = p[1] + oy + jy(0);
  ctx.moveTo(x0, y0);
  if (n === 1) {
    ctx.lineTo(x0 + 0.01, y0);
    return;
  }
  for (let i = 1; i < n - 1; i++) {
    const cx = p[i * 2] + ox + jx(i);
    const cy = p[i * 2 + 1] + oy + jy(i);
    const nx = p[i * 2 + 2] + ox + jx(i + 1);
    const ny = p[i * 2 + 3] + oy + jy(i + 1);
    ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
  }
  ctx.lineTo(p[(n - 1) * 2] + ox + jx(n - 1), p[(n - 1) * 2 + 1] + oy + jy(n - 1));
}

/** Dark rim under each colour so light chalk still reads on the cream paper cards. */
const OUTLINE = 'rgb(24, 21, 18)';
const OUTLINE_ALPHA: Record<ChalkColor, number> = { white: 0.5, yellow: 0.42, red: 0.2 };

/**
 * Paint strokes. `ox` = viewport centre x, `oy` = -scrollY.
 * Each stroke: a faint dust halo, a thin dark rim (invisible on the slate, but it
 * keeps white/yellow chalk legible over paper), a grainy core and two jittered passes.
 */
export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  painter: Painter,
  strokes: Stroke[],
  ox: number,
  oy: number,
  vh: number,
  alpha = 1,
) {
  if (!strokes.length || alpha <= 0) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const grainShift = new DOMMatrix([1, 0, 0, 1, ox % 96, oy % 96]);
  for (const s of strokes) {
    const pad = s.w * 3;
    if (s.maxY + oy < -pad || s.minY + oy > vh + pad) continue;
    const color = painter.colors[s.c];
    const pat = painter.patterns[s.c];

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.09 * alpha;
    ctx.lineWidth = s.w * 2.8;
    trace(ctx, s, ox, oy, 0, 0);
    ctx.stroke();

    // rim: a slightly wider dark pass nudged down-right, like a soft drop shadow
    ctx.strokeStyle = OUTLINE;
    ctx.globalAlpha = OUTLINE_ALPHA[s.c] * alpha;
    ctx.lineWidth = s.w + 2.2;
    trace(ctx, s, ox + 0.5, oy + 0.9, 1, 0.5);
    ctx.stroke();

    if (pat) {
      pat.setTransform(grainShift);
      ctx.strokeStyle = pat;
    }
    ctx.globalAlpha = 0.95 * alpha;
    ctx.lineWidth = s.w;
    trace(ctx, s, ox, oy, 1, 0.5);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.32 * alpha;
    ctx.lineWidth = Math.max(0.8, s.w * 0.42);
    trace(ctx, s, ox, oy, 2, s.w * 0.7);
    ctx.stroke();
    ctx.globalAlpha = 0.22 * alpha;
    trace(ctx, s, ox, oy, 3, s.w * 0.9);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ── shared wipe choreography (eraser sweep + canvas clip use the same curve) ── */
export const wipeEase = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const ERASER_W = 170;
/** x of the sweeping eraser's left edge at eased progress e (right → left). */
export const eraserX = (e: number, vw: number) => vw + 40 + (-ERASER_W - 80 - (vw + 40)) * e;
