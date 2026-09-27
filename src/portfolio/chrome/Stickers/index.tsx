import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { Cloud, Coffee, Database, Leaf, Smartphone, Zap, type LucideIcon } from 'lucide-react';
import styles from './Stickers.module.css';

interface StickerDef {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** section id to hang near, and how far down it (0..1) */
  anchor: string;
  at: number;
  /** fallback page offset in vh if the section isn't on the page */
  vh: number;
  side: 'left' | 'right';
  tilt: number;
  fill: string;
  dx?: number;
}

const STICKERS: StickerDef[] = [
  { id: 'java', label: 'java', Icon: Coffee, anchor: 'experience', at: 0.06, vh: 120, side: 'left', tilt: -9, fill: 'var(--ink)' },
  { id: 'spring', label: 'spring', Icon: Leaf, anchor: 'experience', at: 0.58, vh: 175, side: 'right', tilt: 8, fill: 'var(--sticky)', dx: -6 },
  { id: 'kafka', label: 'kafka', Icon: Zap, anchor: 'skills', at: 0.2, vh: 240, side: 'left', tilt: 6, fill: 'var(--sticky)', dx: 10 },
  { id: 'sql', label: 'sql', Icon: Database, anchor: 'projects', at: 0.1, vh: 300, side: 'right', tilt: -7, fill: 'var(--ink)' },
  { id: 'aws', label: 'aws', Icon: Cloud, anchor: 'projects', at: 0.64, vh: 370, side: 'left', tilt: 10, fill: 'var(--paper-3)', dx: -4 },
  { id: 'flutter', label: 'flutter', Icon: Smartphone, anchor: 'resume', at: 0.35, vh: 440, side: 'right', tilt: -4, fill: 'var(--ink)', dx: 8 },
];

const STORE_KEY = 'board:stickers:v1';
type Offsets = Record<string, { x: number; y: number }>;

function loadOffsets(): Offsets {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}');
    return v && typeof v === 'object' ? (v as Offsets) : {};
  } catch {
    return {};
  }
}
function saveOffset(id: string, x: number, y: number) {
  try {
    const all = loadOffsets();
    all[id] = { x: Math.round(x), y: Math.round(y) };
    sessionStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* session only, best effort */
  }
}

interface Layout {
  vw: number;
  docH: number;
  size: number;
  pos: { left: number; top: number }[];
}

/**
 * Stickers only exist where both gutters can hold one with room to spare, and only for a
 * mouse: they're drag toys (touch-action: none), which would swallow a thumb-scroll on a tablet.
 */
const WIDE = '(min-width: 1280px) and (hover: hover) and (pointer: fine)';
/** Min space between a sticker and the viewport edge / content column. */
const EDGE_GAP = 8;

/** Right/left gutter width (viewport edge → content column), mirroring `.container`. */
function gutterWidth(vw: number) {
  const max = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--container')) || 1160;
  const pad = Math.min(40, Math.max(16, vw * 0.04));
  return (vw - Math.min(vw, max)) / 2 + pad;
}

/** Document-space vertical ranges of sections that run wider than the content column. */
function wideBands() {
  const out: [number, number][] = [];
  for (const id of ['lately']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    out.push([r.top + window.scrollY, r.bottom + window.scrollY]);
  }
  return out;
}

/** Measure anchors → absolute document positions strictly inside the side gutters. */
function useStickerLayout(): Layout | null {
  const [layout, setLayout] = useState<Layout | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    let raf = 0;
    const compute = () => {
      raf = 0;
      const vw = document.documentElement.clientWidth;
      const gutter = gutterWidth(vw);
      const size = gutter >= 150 ? 76 : 64;
      if (!mq.matches || gutter < size + EDGE_GAP * 2 + 4) {
        setLayout(null);
        return;
      }
      const vh = window.innerHeight;
      const main = document.querySelector('main');
      const docH = main ? main.getBoundingClientRect().bottom + window.scrollY : document.documentElement.scrollHeight;
      const x = (gutter - size) / 2;
      const slack = Math.max(0, x - EDGE_GAP);
      const bands = wideBands();
      const pos = STICKERS.map((s) => {
        const el = document.getElementById(s.anchor);
        let top = el ? el.getBoundingClientRect().top + window.scrollY + el.offsetHeight * s.at : (s.vh * vh) / 100;
        // never park next to a full-bleed section (its cards reach into the gutters)
        for (const [a, b] of bands) if (top + size > a - 24 && top < b + 24) top = b + 24;
        top = Math.max(vh * 0.9, Math.min(top, docH - size - 60));
        const dx = Math.max(-slack, Math.min(slack, s.dx ?? 0));
        const left = s.side === 'left' ? x + dx : vw - x - size + dx;
        return { left: Math.round(left), top: Math.round(top) };
      });
      setLayout((prev) =>
        prev && prev.vw === vw && prev.size === size && prev.docH === docH && prev.pos.every((p, i) => p.top === pos[i].top && p.left === pos[i].left)
          ? prev
          : { vw, docH, size, pos },
      );
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    const ro = new ResizeObserver(schedule);
    const main = document.querySelector('main');
    if (main) ro.observe(main);
    ro.observe(document.body);
    window.addEventListener('resize', schedule, { passive: true });
    mq.addEventListener('change', schedule);
    // sections are lazy — re-measure a few times while they stream in
    const timers = [400, 1200, 2500, 5000].map((t) => window.setTimeout(schedule, t));
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      mq.removeEventListener('change', schedule);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);
  return layout;
}

const BURST = 12;

function Sticker({ def, left, top, size, vw, docH, reduced, index }: { def: StickerDef; left: number; top: number; size: number; vw: number; docH: number; reduced: boolean; index: number }) {
  const saved = useRef(loadOffsets()[def.id]);
  const x = useMotionValue(saved.current?.x ?? 0);
  const y = useMotionValue(saved.current?.y ?? 0);
  const spin = useMotionValue(0);
  const pop = useMotionValue(1);
  const [dragging, setDragging] = useState(false);
  const [bursts, setBursts] = useState<number[]>([]);
  const burstId = useRef(0);
  const ref = useRef<HTMLDivElement>(null);
  const { Icon } = def;

  // The idle bob is a CSS animation (compositor-only); pause it while the sticker is off-screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) el.removeAttribute('data-offscreen');
        else el.setAttribute('data-offscreen', '');
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onTap = () => {
    if (reduced) return;
    animate(spin, spin.get() + 360, { type: 'spring', stiffness: 70, damping: 11, mass: 0.9 });
    animate(pop, [1, 1.16, 1], { duration: 0.5, ease: 'easeOut' });
    const id = ++burstId.current;
    setBursts((b) => [...b, id]);
    window.setTimeout(() => setBursts((b) => b.filter((n) => n !== id)), 1000);
  };

  const constraints = {
    left: -left + 4,
    right: vw - left - size - 4,
    top: -top + 90,
    bottom: Math.max(0, docH - top - size - 8),
  };

  return (
    <motion.div
      ref={ref}
      className={styles.sticker}
      data-dragging={dragging || undefined}
      // decorative + pointer-only: framer would otherwise make an onTap element focusable
      tabIndex={-1}
      style={{ left, top, width: size, height: size, x, y }}
      drag
      dragMomentum
      dragElastic={0.18}
      dragConstraints={constraints}
      dragTransition={{ power: 0.28, timeConstant: 260, bounceStiffness: 320, bounceDamping: 18 }}
      whileHover={reduced ? undefined : { scale: 1.06 }}
      whileDrag={reduced ? { scale: 1.04 } : { scale: 1.12, rotate: 10 }}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      onDragTransitionEnd={() => saveOffset(def.id, x.get(), y.get())}
      onTap={onTap}
    >
      <motion.div
        className={styles.enter}
        initial={reduced ? false : { opacity: 0, scale: 0.4, rotate: -40 }}
        whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
        viewport={{ once: true, margin: '0px 0px -8% 0px' }}
        transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}
      >
        <motion.div className={styles.spin} style={{ rotate: spin, scale: pop }}>
          <div
            className={styles.bob}
            style={
              {
                '--tilt': `${def.tilt}deg`,
                '--bob-dur': `${5.5 + (index % 3) * 0.9}s`,
                '--bob-delay': `${index * -0.7}s`,
              } as CSSProperties
            }
          >
            <div className={styles.face}>
              <div className={`${styles.inner} ${def.fill === 'var(--ink)' ? styles.dark : ''}`} style={{ background: def.fill }}>
                <Icon className={styles.icon} size={Math.round(size * 0.4)} strokeWidth={2.1} aria-hidden="true" />
              </div>
              <span className={styles.gloss} />
            </div>
            <span className={styles.peel} />
          </div>
        </motion.div>
      </motion.div>
      <span className={styles.label}>{def.label}</span>
      {bursts.map((b) => (
        <span key={b} className={styles.burst}>
          <motion.span
            className={styles.ring}
            style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
            initial={{ scale: 0.9, opacity: 0.7 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
          {Array.from({ length: BURST }, (_, i) => {
            const a = (i / BURST) * Math.PI * 2 + (b % 3) * 0.4;
            const r = size * (0.7 + ((i * 37) % 10) / 16);
            const d = 4 + (i % 3) * 2;
            return (
              <motion.span
                key={i}
                className={styles.mote}
                style={{ width: d, height: d, marginLeft: -d / 2, marginTop: -d / 2 }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r + 14, opacity: [1, 1, 0], scale: 0.5 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.9, times: [0, 0.55, 1] } }}
              />
            );
          })}
        </span>
      ))}
    </motion.div>
  );
}

/** Draggable die-cut tech stickers in the page gutters (wide screens only, decorative, pointer-only). */
export default function Stickers() {
  const layout = useStickerLayout();
  const reduced = !!useReducedMotion();
  if (!layout) return null;
  return (
    <div className={styles.layer} aria-hidden="true" data-board-decor="">
      {STICKERS.map((s, i) => (
        <Sticker
          key={s.id}
          def={s}
          index={i}
          left={layout.pos[i].left}
          top={layout.pos[i].top}
          size={layout.size}
          vw={layout.vw}
          docH={layout.docH}
          reduced={reduced}
        />
      ))}
    </div>
  );
}
