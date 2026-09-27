import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { SkillItem } from './skillData';
import styles from './TagSphere.module.css';

/**
 * A 3D tag sphere built from CSS 3D transforms (translate3d under a perspective parent).
 * Each item sits on a Fibonacci-sphere point; a rotation matrix is integrated on
 * requestAnimationFrame and written straight to style.transform (no React re-render per frame).
 *
 * - items are assigned to points so front-facing labels overlap as little as possible
 * - depth reads clearly: the front cap is at full strength, the back hemisphere fades, shrinks and blurs
 * - headline skills (item.core) are drawn larger
 * - auto-rotates slowly; pointer drag rotates with inertia; hovering pauses
 * - stops when off-screen (IntersectionObserver) or when the tab is hidden
 * - reduced motion: no auto-rotation or inertia (drag still works, it's user-driven)
 */

type Mat = number[]; // 3x3 row-major

interface Props {
  items: SkillItem[];
  colorFor: (group: number) => string;
  /** Category currently filtered (others dim), or null. */
  activeGroup: number | null;
  /** Highlighted skill id; when `orient` is set the sphere turns to bring it to the front. */
  selected: { id: string; orient: boolean; nonce: number } | null;
  /** Freeze rotation (e.g. while a popover is anchored to an item). */
  paused: boolean;
  onPick: (item: SkillItem, el: HTMLElement) => void;
  /** Fired once when a press turns into a drag. */
  onDragStart?: () => void;
  className?: string;
  label: string;
}

const AUTO = { x: 0.035, y: 0.16 }; // rad/s
/** Font-size multiplier for headline skills. */
const CORE_WEIGHT = 1.4;
/** Label em-size in sphere radii (≈ 22px at R ≈ 250 on desktop, 16px at R ≈ 130 on phones). */
const EM = 0.1;
const DRAG_GAIN = 0.0062; // rad per px
const MAX_V = 5;

function fibonacciSphere(n: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * golden;
    pts.push([Math.cos(phi) * r, y, Math.sin(phi) * r]);
  }
  return pts;
}

/** Deterministic shuffle so categories are mixed around the sphere, identical on every load. */
function seededOrder(n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const mul = (a: Mat, b: Mat): Mat => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
};
const rotY = (t: number): Mat => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rotX = (t: number): Mat => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
/** Rodrigues rotation about a unit axis. */
const rotAxis = (x: number, y: number, z: number, t: number): Mat => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
};
/** Gram-Schmidt so accumulated float error never skews the sphere. */
const orthonormalize = (m: Mat): Mat => {
  let [ax, ay, az] = [m[0], m[3], m[6]];
  let l = Math.hypot(ax, ay, az);
  ax /= l;
  ay /= l;
  az /= l;
  let [bx, by, bz] = [m[1], m[4], m[7]];
  const d = ax * bx + ay * by + az * bz;
  bx -= d * ax;
  by -= d * ay;
  bz -= d * az;
  l = Math.hypot(bx, by, bz);
  bx /= l;
  by /= l;
  bz /= l;
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return [ax, bx, cx, ay, by, cy, az, bz, cz];
};

const initialMatrix = (): Mat => mul(rotX(-0.32), rotY(0.5));

/**
 * Places items on Fibonacci points so that labels overlap as little as possible when they face the
 * viewer. The cost of two labels is their estimated overlap area: label box size vs. the distance of
 * their points along and across the default spin axis (which is roughly screen-vertical). Headline
 * skills also get a small pull towards the initial front, so the first (and, with reduced motion,
 * the only) view leads with them. A deterministic pairwise-swap search, starting from a seeded
 * shuffle, minimises the total.
 */
function placeItems(items: SkillItem[]): [number, number, number][] {
  const n = items.length;
  const pts = fibonacciSphere(n);
  const m = initialMatrix();
  const wl = Math.hypot(AUTO.x, AUTO.y);
  const [wx, wy] = [AUTO.x / wl, AUTO.y / wl];
  // spin axis in object space: M0ᵀ · w
  const ax = m[0] * wx + m[3] * wy;
  const ay = m[1] * wx + m[4] * wy;
  const az = m[2] * wx + m[5] * wy;
  const dv = new Float64Array(n * n);
  const dh = new Float64Array(n * n);
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      const dx = pts[a][0] - pts[b][0];
      const dy = pts[a][1] - pts[b][1];
      const dz = pts[a][2] - pts[b][2];
      const along = dx * ax + dy * ay + dz * az;
      dv[a * n + b] = Math.abs(along);
      dh[a * n + b] = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
    }
  const weight = (it: SkillItem) => (it.core ? CORE_WEIGHT : 1);
  const W = items.map((it) => ((it.label ?? it.name).length * 0.46 + 0.8) * EM * weight(it));
  const H = items.map((it) => 1.35 * EM * weight(it));
  // initial view direction in object space (third row of M0)
  const front = (p: [number, number, number]) => p[0] * m[6] + p[1] * m[7] + p[2] * m[8];
  const unary = (i: number) => (items[i].core ? 0.03 * (1 - front(pts[perm[i]])) : 0);
  const perm = seededOrder(n);
  const pair = (i: number, j: number) => {
    const k = perm[i] * n + perm[j];
    const ox = (W[i] + W[j]) / 2 - dh[k];
    if (ox <= 0) return 0;
    const oy = (H[i] + H[j]) / 2 - dv[k];
    return oy <= 0 ? 0 : ox * oy;
  };
  const around = (i: number) => {
    let c = 0;
    for (let k = 0; k < n; k++) if (k !== i) c += pair(i, k);
    return c;
  };
  for (let pass = 0; pass < 12; pass++) {
    let improved = false;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const before = around(i) + around(j) - pair(i, j) + unary(i) + unary(j);
        [perm[i], perm[j]] = [perm[j], perm[i]];
        const after = around(i) + around(j) - pair(i, j) + unary(i) + unary(j);
        if (after < before - 1e-9) improved = true;
        else [perm[i], perm[j]] = [perm[j], perm[i]];
      }
    if (!improved) break;
  }
  return items.map((_, i) => pts[perm[i]]);
}

export function TagSphere({ items, colorFor, activeGroup, selected, paused, onPick, onDragStart, className, label }: Props) {
  const reduce = !!useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const points = useMemo(() => placeItems(items), [items]);
  /** Last blur bucket written per item (filter is only touched when it changes). */
  const blurs = useRef<number[]>([]);

  // Mutable simulation state (never triggers renders).
  const sim = useRef({
    M: initialMatrix(),
    vx: 0,
    vy: 0,
    R: 180,
    P: 900,
    hovering: false,
    dragging: false,
    pressed: false,
    downX: 0,
    downY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    downItem: -1,
    orient: -1,
    active: -1,
    selected: -1,
    hover: -1,
    paused: false,
    reduce: false,
    visible: false,
    dirty: true,
    raf: 0,
    last: 0,
    frames: 0,
  });

  // ── rendering ────────────────────────────────────────────────────────
  const apply = () => {
    const s = sim.current;
    const { M, R } = s;
    for (let i = 0; i < points.length; i++) {
      const el = itemRefs.current[i];
      if (!el) continue;
      const [px, py, pz] = points[i];
      const x = M[0] * px + M[1] * py + M[2] * pz;
      const y = M[3] * px + M[4] * py + M[5] * pz;
      const z = M[6] * px + M[7] * py + M[8] * pz;
      const t = (z + 1) / 2; // 0 = back, 1 = front
      const f = smooth(-0.35, 0.55, z); // 0 = back hemisphere, 1 = front cap
      const g = items[i].group;
      const lit = (s.active >= 0 && g === s.active) || i === s.selected || i === s.hover;
      let o = 0.1 + 0.9 * f;
      if (s.active >= 0 && g === s.active) o = Math.max(o, 0.5);
      if (i === s.selected || i === s.hover) o = 1;
      // perspective already shrinks the back to ~72%; this takes it to ~56% so depth reads at a glance
      const sc = 0.78 + 0.22 * f;
      const blur = lit ? 0 : z < -0.55 ? 2 : z < -0.1 ? 1 : 0;
      if (blurs.current[i] !== blur) {
        el.style.filter = blur ? `blur(${blur}px)` : '';
        blurs.current[i] = blur;
      }
      // front sits at z = 0 so the frontmost text renders at its native size (crisp), the back shrinks
      el.style.transform = `translate(-50%, -50%) translate3d(${(x * R).toFixed(2)}px, ${(y * R).toFixed(2)}px, ${((z - 1) * R).toFixed(2)}px) scale(${sc.toFixed(3)})`;
      el.style.opacity = o.toFixed(3);
      el.style.zIndex = String(Math.round(t * 1000) + (i === s.selected ? 2000 : 0) + (i === s.hover ? 3000 : 0));
      el.style.pointerEvents = f > 0.2 || lit ? 'auto' : 'none';
    }
    s.dirty = false;
  };

  const step = (dt: number) => {
    const s = sim.current;
    // orientation towards a selected skill
    if (s.orient >= 0) {
      const [px, py, pz] = points[s.orient];
      const M = s.M;
      const qx = M[0] * px + M[1] * py + M[2] * pz;
      const qy = M[3] * px + M[4] * py + M[5] * pz;
      const qz = M[6] * px + M[7] * py + M[8] * pz;
      const angle = Math.acos(Math.max(-1, Math.min(1, qz)));
      if (angle < 0.004) {
        s.orient = -1;
      } else {
        let ax = qy;
        let ay = -qx;
        const l = Math.hypot(ax, ay);
        if (l < 1e-6) {
          ax = 0;
          ay = 1;
        } else {
          ax /= l;
          ay /= l;
        }
        const k = s.reduce ? angle : angle * (1 - Math.exp(-dt * 5.5));
        s.M = mul(rotAxis(ax, ay, 0, k), s.M);
      }
      s.vx = 0;
      s.vy = 0;
      s.dirty = true;
      return;
    }
    if (s.dragging) return; // rotation is applied directly from pointer deltas
    const still = s.reduce || s.paused || s.hovering;
    const tx = still ? 0 : AUTO.x;
    const ty = still ? 0 : AUTO.y;
    const ease = 1 - Math.exp(-dt * (s.reduce ? 30 : still ? 3.2 : 1.1));
    s.vx += (tx - s.vx) * ease;
    s.vy += (ty - s.vy) * ease;
    if (Math.abs(s.vx) < 1e-4 && Math.abs(s.vy) < 1e-4 && still) {
      s.vx = 0;
      s.vy = 0;
      return;
    }
    s.M = mul(mul(rotY(s.vy * dt), rotX(s.vx * dt)), s.M);
    s.dirty = true;
  };

  const isIdle = () => {
    const s = sim.current;
    const still = s.reduce || s.paused || s.hovering;
    return still && !s.dragging && s.orient < 0 && s.vx === 0 && s.vy === 0 && !s.dirty;
  };

  const loop = (now: number) => {
    const s = sim.current;
    const dt = Math.min(0.05, s.last ? (now - s.last) / 1000 : 0.016);
    s.last = now;
    step(dt);
    if (s.dirty) apply();
    if (++s.frames % 240 === 0) s.M = orthonormalize(s.M);
    if (!s.visible || document.hidden || isIdle()) {
      s.raf = 0;
      s.last = 0;
      return;
    }
    s.raf = requestAnimationFrame(loop);
  };

  const kick = () => {
    const s = sim.current;
    if (s.raf || !s.visible || document.hidden) return;
    s.last = 0;
    s.raf = requestAnimationFrame(loop);
  };

  // ── sizing ───────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const size = stage.clientWidth;
      const s = sim.current;
      s.R = size * (size < 420 ? 0.4 : 0.46);
      s.P = size * 2.4;
      stage.style.setProperty('--persp', `${Math.round(s.P)}px`);
      stage.style.setProperty('--r', `${Math.round(s.R)}px`);
      s.dirty = true;
      apply();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // ── visibility gating ────────────────────────────────────────────────
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const s = sim.current;
    const io = new IntersectionObserver(
      ([e]) => {
        s.visible = e.isIntersecting;
        if (s.visible) kick();
      },
      { rootMargin: '80px' },
    );
    io.observe(stage);
    const onVis = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── props → sim ──────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    s.reduce = reduce;
    s.paused = paused;
    s.active = activeGroup ?? -1;
    s.dirty = true;
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, paused, activeGroup]);

  useEffect(() => {
    const s = sim.current;
    const idx = selected ? items.findIndex((it) => it.id === selected.id) : -1;
    s.selected = idx;
    s.orient = selected?.orient && idx >= 0 ? idx : -1;
    s.dirty = true;
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, items]);

  // ── pointer interaction ──────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const s = sim.current;
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-idx]');
    s.downItem = target ? Number(target.dataset.idx) : -1;
    s.pressed = true;
    s.dragging = false;
    s.downX = s.lastX = e.clientX;
    s.downY = s.lastY = e.clientY;
    s.lastT = performance.now();
    s.orient = -1;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = sim.current;
    if (!s.pressed) return;
    if (!s.dragging) {
      if (Math.hypot(e.clientX - s.downX, e.clientY - s.downY) < 6) return;
      s.dragging = true;
      s.vx = 0;
      s.vy = 0;
      stageRef.current?.setPointerCapture(e.pointerId);
      stageRef.current?.setAttribute('data-dragging', '');
      onDragStart?.();
    }
    const now = performance.now();
    const dx = e.clientX - s.lastX;
    const dy = e.clientY - s.lastY;
    const dt = Math.max(0.008, (now - s.lastT) / 1000);
    const ay = dx * DRAG_GAIN;
    const ax = -dy * DRAG_GAIN;
    s.M = mul(mul(rotY(ay), rotX(ax)), s.M);
    // smoothed velocity for inertia on release
    s.vy = Math.max(-MAX_V, Math.min(MAX_V, s.vy * 0.6 + (ay / dt) * 0.4));
    s.vx = Math.max(-MAX_V, Math.min(MAX_V, s.vx * 0.6 + (ax / dt) * 0.4));
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.lastT = now;
    s.dirty = true;
    kick();
  };

  const endPress = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const s = sim.current;
    if (!s.pressed) return;
    s.pressed = false;
    const wasDragging = s.dragging;
    s.dragging = false;
    stageRef.current?.removeAttribute('data-dragging');
    if (stageRef.current?.hasPointerCapture(e.pointerId)) stageRef.current.releasePointerCapture(e.pointerId);
    if (wasDragging) {
      // a stale move (finger held still) shouldn't fling
      if (performance.now() - s.lastT > 90 || s.reduce) {
        s.vx = 0;
        s.vy = 0;
      }
      kick();
      return;
    }
    if (!cancelled && s.downItem >= 0) {
      const el = itemRefs.current[s.downItem];
      if (el) onPick(items[s.downItem], el);
    }
  };

  const onEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    sim.current.hovering = true;
    kick();
  };
  const onLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const s = sim.current;
    s.hovering = false;
    s.hover = -1;
    s.dirty = true;
    kick();
  };
  const onOver = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-idx]');
    const idx = t ? Number(t.dataset.idx) : -1;
    const s = sim.current;
    if (idx !== s.hover) {
      s.hover = idx;
      s.dirty = true;
      kick();
    }
  };

  const selectedId = selected?.id;

  return (
    <div
      ref={stageRef}
      className={[styles.stage, className].filter(Boolean).join(' ')}
      role="img"
      aria-label={label}
      data-filtering={activeGroup != null || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPress(e, false)}
      onPointerCancel={(e) => endPress(e, true)}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onPointerOver={onOver}
    >
      <svg className={styles.outline} viewBox="0 0 200 200" aria-hidden="true">
        <path d="M100 8 C 152 7, 193 47, 192 101 C 191 152, 151 193, 99 192 C 47 191, 8 150, 9 99 C 10 50, 50 9, 104 9" />
        <path className={styles.outline2} d="M97 11 C 150 12, 190 52, 188 103 C 186 154, 146 190, 96 189 C 46 188, 11 148, 12 97 C 13 49, 53 13, 101 12" />
      </svg>
      <div className={styles.cloud} aria-hidden="true">
        {items.map((it, i) => {
          const dim = activeGroup != null && it.group !== activeGroup;
          const on = activeGroup != null && it.group === activeGroup;
          return (
            <span
              key={it.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              data-idx={i}
              className={styles.item}
              data-core={it.core || undefined}
              style={{ '--c': colorFor(it.group), '--w': it.core ? CORE_WEIGHT : 1 } as CSSProperties}
            >
              <span className={styles.inner} data-dim={dim || undefined} data-on={on || undefined} data-sel={it.id === selectedId || undefined}>
                {it.label ?? it.name}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
