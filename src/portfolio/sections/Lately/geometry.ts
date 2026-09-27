// Geometry for the clothesline: responsive layout + a catenary rope that the pins ride on.

export interface LineLayout {
  /** Width of the visible viewport of the line (the section's width). */
  viewW: number;
  /** Width of the drawn content (== viewW when everything fits, wider when scrolling). */
  W: number;
  /** Height of the drawn content. */
  H: number;
  /** True when the cards do not fit and the line becomes a horizontal scroll track. */
  scroll: boolean;
  /** Phone-sized layout. */
  compact: boolean;
  /** Card width / height (px). */
  cw: number;
  ch: number;
  gap: number;
  /** x of each card's clothespin (card center). */
  xs: number[];
  /** Rope anchor x (left / right) — where the paper planes hold the line. */
  aL: number;
  aR: number;
  /** Anchor height and sag depth at the middle of the span. */
  y0: number;
  sag: number;
  /** Where the "drag me" note points: the gap after this card index. */
  noteGap: number;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** Offset from a card's slot top (the rope contact point) to the top edge of its paper. */
export const PAPER_OFFSET = 8;

/** Curvature of the catenary — higher = more "U", lower = closer to a parabola. */
const K = 1.35;
const COSH_K = Math.cosh(K);

/** Normalised catenary sag: 0 at both anchors, 1 in the middle. */
export function sagShape(u: number) {
  return (COSH_K - Math.cosh(K * (2 * u - 1))) / (COSH_K - 1);
}

export interface RopeState {
  aL: number;
  aR: number;
  yL: number;
  yR: number;
  sag: number;
}

/** Height of the (un-pulled) rope at x. */
export function ropeBase(x: number, s: RopeState) {
  const u = clamp01((x - s.aL) / (s.aR - s.aL));
  return s.yL + (s.yR - s.yL) * u + s.sag * sagShape(u);
}

/** A point where someone is pulling the rope (a dragged card's clothespin). */
export interface Pull {
  index: number;
  px: number;
  off: number;
}

/** Rope pulled at px: two straight-ish legs from the anchors (a triangle added to the catenary). */
export function pullOffset(x: number, p: Pull, s: RopeState) {
  if (x <= p.px) return p.off * clamp01((x - s.aL) / Math.max(1, p.px - s.aL));
  return p.off * clamp01((s.aR - x) / Math.max(1, s.aR - p.px));
}

export function ropeY(x: number, s: RopeState, pulls: Pull[], skip = -1) {
  let y = ropeBase(x, s);
  for (const p of pulls) if (p.index !== skip) y += pullOffset(x, p, s);
  return y;
}

/** SVG path for the rope, sampled finely and including the exact pull points (so kinks stay crisp). */
export function ropePath(s: RopeState, pulls: Pull[], step = 14) {
  const xs: number[] = [];
  for (let x = s.aL; x < s.aR; x += step) xs.push(x);
  xs.push(s.aR);
  for (const p of pulls) if (p.px > s.aL && p.px < s.aR) xs.push(p.px);
  xs.sort((a, b) => a - b);
  let d = '';
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${ropeY(x, s, pulls).toFixed(1)}`;
  }
  return d;
}

/** Deterministic pseudo-random in [-1, 1] from a string (stable card tilt). */
export function seeded(id: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2000) / 1000 - 1;
}

/** Bottom room below the lowest card for its swing + shadow. */
export const BOTTOM_ROOM = 36;
export const trackHeight = (y0: number, sag: number, ch: number) => Math.round(y0 + sag + PAPER_OFFSET + ch + BOTTOM_ROOM);

export function computeLayout(viewW: number, n: number): LineLayout {
  const compact = viewW < 640;
  const pad = compact ? 52 : 58; // anchor inset (room for the paper planes)
  const inset = compact ? 8 : 10; // anchor → first card
  let gap = compact ? 18 : 20;
  const minFit = 212;
  const maxCw = 262;
  const fit = (viewW - 2 * (pad + inset) - (n - 1) * gap) / n;
  const scroll = fit < minFit;

  let cw: number;
  let W: number;
  let start: number;
  if (!scroll) {
    cw = Math.min(maxCw, Math.floor(fit));
    W = viewW;
    const extra = viewW - 2 * (pad + inset) - n * cw - (n - 1) * gap;
    if (n > 1) gap = Math.min(64, gap + extra / (n - 1));
    const group = n * cw + (n - 1) * gap;
    start = (W - group) / 2;
  } else {
    cw = compact ? 250 : 244;
    W = Math.round(2 * (pad + inset) + n * cw + (n - 1) * gap);
    start = pad + inset;
  }
  const xs = Array.from({ length: n }, (_, i) => start + cw / 2 + i * (cw + gap));
  const ch = cw < 232 ? 356 : 340; // first guess — replaced by the measured content height
  const y0 = compact ? 74 : 66;
  const sag = compact ? 54 : clamp(W * 0.055, 46, 84);
  const H = trackHeight(y0, sag, ch);
  return {
    viewW,
    W,
    H,
    scroll,
    compact,
    cw,
    ch,
    gap,
    xs,
    aL: pad,
    aR: W - pad,
    y0,
    sag,
    noteGap: scroll ? 0 : Math.max(0, Math.floor(n / 2)),
  };
}
