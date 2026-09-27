import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TiltCard } from '@/ui';
import type { Project } from '@/data/profile';
import { ProjectCard } from './ProjectCard';
import { PuppyTrack } from './Puppy';
import { clamp, dwell } from './hooks';
import s from './Wall.module.css';

/** Scroll distance (vh) spent per card. 5 cards → 100vh + 4×50vh = 300vh track. */
const PER_CARD_VH = 50;
/** Angle between neighbouring cards on the cylinder, and its radius (px). */
const STEP = 36;
const RADIUS = 700;
/** Must match `.scene { perspective }` in Wall.module.css. */
const PERSPECTIVE = 1400;
/** Cards fade out between these angles *to the viewer's eye ray* (not the cylinder angle), so a
 *  card never shows as an edge-on sliver before backface-visibility hides it. */
const FACE_SHOW = Math.cos((72 * Math.PI) / 180);
const FACE_HIDE = Math.cos((82 * Math.PI) / 180);
/** Share of the viewport height, after the pinned stage releases, over which the pager fades out. */
const EXIT_FADE = 0.13;
/** Horizontal drag distance (px) that turns the wall by one card. */
const DRAG_PX = 300;
const REST_TILT = [-1.4, 1.1, -0.7, 1.5, -1.1, 0.9];

interface Props {
  projects: Project[];
  header: ReactNode;
  onOpen: (id: string) => void;
}

/**
 * Desktop: a sticky 100vh stage inside a tall track. Scroll progress turns a 3D cylinder
 * of pinned project cards; drag, arrow keys, the chevrons or clicking a side card also turn it.
 * The scroll position stays the single source of truth (drag/keys scroll to a card's point).
 */
export function Wall({ projects, header, onOpen }: Props) {
  const n = projects.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const nRef = useRef(n);
  nRef.current = n;

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });
  // 0 when the pinned stage releases → 1 when the track's end reaches the top of the viewport
  const { scrollYProgress: exitProgress } = useScroll({ target: trackRef, offset: ['end end', 'end start'] });
  const controlsOpacity = useTransform(exitProgress, [0, EXIT_FADE], [1, 0]);
  const controlsVisibility = useTransform(controlsOpacity, (o) => (o < 0.02 ? 'hidden' : 'visible'));
  /** desired (float) card index at the front */
  const target = useMotionValue(0);
  const idx = useSpring(target, { stiffness: 150, damping: 26, mass: 0.7 });
  const progress = useTransform(idx, (v) => (nRef.current > 1 ? clamp(v / (nRef.current - 1), 0, 1) : 0));

  const [goal, setGoal] = useState(0); // rounded target — drives tab order + counter
  const [dragging, setDragging] = useState(false);
  const lockUntil = useRef(0);
  const drag = useRef<null | { id: number; x: number; y: number; start: number; active: boolean; lastX: number; lastT: number; v: number }>(null);
  const suppressClick = useRef(false);

  const fromScroll = (p: number) => dwell(clamp(p, 0, 1) * Math.max(0, nRef.current - 1));

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (drag.current?.active) return;
    if (performance.now() < lockUntil.current) return;
    target.set(fromScroll(p));
  });
  useMotionValueEvent(target, 'change', (v) => {
    const g = clamp(Math.round(v), 0, Math.max(0, nRef.current - 1));
    setGoal((prev) => (prev === g ? prev : g));
  });

  // Release a programmatic-scroll lock as soon as the user scrolls on their own.
  useEffect(() => {
    const cancel = () => {
      if (lockUntil.current) {
        lockUntil.current = 0;
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (['PageUp', 'PageDown', ' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) cancel();
    };
    const onEnd = () => {
      if (!lockUntil.current) return;
      lockUntil.current = 0;
      target.set(fromScroll(scrollYProgress.get()));
    };
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchmove', cancel, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('scrollend', onEnd);
    return () => {
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchmove', cancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scrollend', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointFor = (k: number) => {
    const track = trackRef.current;
    if (!track) return window.scrollY;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const scrollable = track.offsetHeight - window.innerHeight;
    const m = nRef.current;
    return top + (m > 1 ? (k / (m - 1)) * scrollable : 0);
  };

  /** Bring card k to the front: spring there now, and scroll to its progress point. */
  const goTo = useCallback(
    (k: number, behavior: ScrollBehavior = 'smooth') => {
      const m = nRef.current;
      if (!m) return;
      const kk = clamp(Math.round(k), 0, m - 1);
      lockUntil.current = performance.now() + 1100;
      target.set(kk);
      window.scrollTo({ top: pointFor(kk), behavior });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Filter changed → keep the stage visually in place and the same project in front when possible.
  const layoutMemo = useRef<{ ids: string; height: number; frontId: string | null }>({ ids: '', height: 0, frontId: null });
  const ids = projects.map((p) => p.id).join('|');
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const prev = layoutMemo.current;
    const height = track.offsetHeight;
    if (prev.ids && prev.ids !== ids) {
      const top = track.getBoundingClientRect().top + window.scrollY;
      const y = window.scrollY;
      const prevEnd = top + prev.height - window.innerHeight;
      const keep = projects.findIndex((p) => p.id === prev.frontId);
      const k = keep >= 0 ? keep : 0;
      if (y >= top - 2 && y <= prevEnd + 2) {
        lockUntil.current = performance.now() + 250;
        target.set(k);
        window.scrollTo({ top: pointFor(k), behavior: 'instant' });
      } else if (y > prevEnd + 2) {
        window.scrollTo({ top: y - (prev.height - height), behavior: 'instant' });
        target.set(Math.max(0, n - 1));
      } else {
        target.set(0);
      }
    }
    layoutMemo.current = { ids, height, frontId: layoutMemo.current.frontId };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  useEffect(() => {
    layoutMemo.current.frontId = projects[goal]?.id ?? null;
  }, [goal, projects]);

  // Horizontal trackpad swipes turn the wall one card at a time.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let acc = 0;
    let cool = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 2) return;
      e.preventDefault();
      const now = performance.now();
      if (now < cool) return;
      acc += e.deltaX;
      if (Math.abs(acc) > 60) {
        const cur = Math.round(target.get());
        goTo(cur + Math.sign(acc));
        acc = 0;
        cool = now + 420;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [goTo, target]);

  /* ── drag to rotate ─────────────────────────────────────────── */
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a, [data-no-drag]')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: target.get(), active: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dx) < 7) {
        if (Math.abs(dy) > 10) drag.current = null; // it's a vertical gesture
        return;
      }
      d.active = true;
      lockUntil.current = 0;
      stageRef.current?.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = 0.8 * ((e.clientX - d.lastX) / dt) + 0.2 * d.v;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    const max = Math.max(0, n - 1);
    const raw = d.start - dx / DRAG_PX;
    const over = raw < 0 ? raw : raw > max ? raw - max : 0;
    const rubber = over ? Math.sign(over) * 0.55 * (1 - 1 / (1 + Math.abs(over) * 1.6)) : 0; // elastic past the ends
    target.set(clamp(raw, 0, max) + rubber);
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    setDragging(false);
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 60);
    if (stageRef.current?.hasPointerCapture(e.pointerId)) stageRef.current.releasePointerCapture(e.pointerId);
    const fling = clamp(-d.v * 0.2, -1, 1); // px/ms → cards
    goTo(target.get() + fling);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let k: number | null = null;
    if (e.key === 'ArrowRight') k = goal + 1;
    else if (e.key === 'ArrowLeft') k = goal - 1;
    else if (e.key === 'Home' && e.target === e.currentTarget) k = 0;
    else if (e.key === 'End' && e.target === e.currentTarget) k = n - 1;
    if (k === null) return;
    e.preventDefault();
    goTo(k);
  };

  const onCardActivate = (i: number) => {
    if (suppressClick.current) return;
    if (Math.round(target.get()) !== i) goTo(i);
    else onOpen(projects[i].id);
  };

  // chalk notes that fill the empty side of the wall at the first / last card
  const startNote = useTransform(idx, (v) => 1 - clamp(v * 2.4, 0, 1));
  const endNote = useTransform(idx, (v) => (nRef.current > 1 ? clamp((v - (nRef.current - 1) + 0.42) * 2.4, 0, 1) : 0));

  const floorTransform = useTransform(idx, (v) => `translate3d(-50%, -50%, 0) translate3d(0, calc(var(--card-h) / 2 + 30px), ${-RADIUS}px) rotateX(90deg) rotateZ(${v * STEP}deg)`);

  const front = projects[goal];

  return (
    <div ref={trackRef} className={s.track} style={{ height: `calc(100vh + ${Math.max(0, n - 1) * PER_CARD_VH}vh)` }}>
      <div
        ref={stageRef}
        className={[s.stage, dragging && s.dragging].filter(Boolean).join(' ')}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label="Projects wall — use the left and right arrow keys to turn it"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className={`container ${s.head}`}>{header}</div>

        <motion.div
          className={s.scene}
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        >
          <motion.div className={`${s.note} ${s.noteStart}`} style={{ opacity: startNote }} aria-hidden="true">
            <span>drag it, scroll it</span>
            <span>or use ← →</span>
            <svg viewBox="0 0 120 60" className={s.noteArrow}>
              <path d="M6 12 C 30 50, 74 58, 110 34" />
              <path d="M98 28 L111 33.5 L103 45" />
            </svg>
          </motion.div>
          <motion.div className={`${s.note} ${s.noteEnd}`} style={{ opacity: endNote }} aria-hidden="true">
            <svg viewBox="0 0 40 40" className={s.noteStar}>
              <path d="M20 4 L24 15 L36 15.6 L26.6 23 L30 35 L20 28 L10 35 L13.4 23 L4 15.6 L16 15 Z" />
            </svg>
            <span>that&apos;s the</span>
            <span>whole wall!</span>
          </motion.div>

          <div className={s.ring}>
            <motion.div className={s.floor} style={{ transform: floorTransform }} aria-hidden="true">
              <svg viewBox="-720 -720 1440 1440" className={s.floorSvg}>
                <circle r={RADIUS} className={s.floorRing} />
                <circle r={RADIUS - 46} className={s.floorRingInner} />
                {Array.from({ length: 10 }, (_, i) => {
                  const a = (i * STEP * Math.PI) / 180;
                  const on = i < n;
                  return (
                    <g key={i} transform={`translate(${(RADIUS * Math.sin(a)).toFixed(1)} ${(RADIUS * Math.cos(a)).toFixed(1)}) rotate(${-i * STEP})`}>
                      <path d={on ? 'M-34 0 H34 M0 -14 V14' : 'M-10 0 H10'} className={on ? s.floorMark : s.floorMarkDim} />
                    </g>
                  );
                })}
              </svg>
            </motion.div>

            <AnimatePresence initial={false}>
              {projects.map((p, i) => (
                <WallCard
                  key={p.id}
                  project={p}
                  slot={i}
                  idx={idx}
                  goal={goal}
                  restTilt={REST_TILT[i % REST_TILT.length]}
                  onActivate={() => onCardActivate(i)}
                  onFocusCard={() => {
                    if (Math.round(target.get()) !== i) goTo(i);
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.div className={`container ${s.controls}`} style={{ opacity: controlsOpacity, visibility: controlsVisibility }}>
          <div className={s.nav}>
            <button type="button" className={s.navBtn} onClick={() => goTo(goal - 1)} disabled={goal <= 0} aria-label="Previous project" data-no-drag>
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <span className={s.counter} aria-hidden="true">
              <b>{String(goal + 1).padStart(2, '0')}</b>
              <span> / {String(n).padStart(2, '0')}</span>
            </span>
            <button type="button" className={s.navBtn} onClick={() => goTo(goal + 1)} disabled={goal >= n - 1} aria-label="Next project" data-no-drag>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
          <PuppyTrack progress={progress} stops={n} className={s.puppyTrack} />
          <p className={s.hint} aria-hidden="true">
            <svg viewBox="0 0 34 20" className={s.hintArrow}>
              <path d="M31 4 C22 1, 9 2, 5 12 M2 7.5 L5 13 L10.5 10.5" />
            </svg>
            scroll to turn the wall
          </p>
        </motion.div>

        <p className="sr-only" aria-live="polite">
          {front ? `Project ${goal + 1} of ${n}: ${front.title}` : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * cos of the angle between a card's outward normal and the ray from the viewer's eye to its centre,
 * for a card at cylinder angle `r` (rad). The eye sits PERSPECTIVE px in front of the front card, so
 * side cards turn edge-on (0) well before 90° — at ~70.5° for this radius/perspective.
 */
function facing(r: number): number {
  const sin = Math.sin(r);
  const cos = Math.cos(r);
  const toEyeX = -RADIUS * sin;
  const toEyeZ = PERSPECTIVE + RADIUS - RADIUS * cos;
  return (sin * toEyeX + cos * toEyeZ) / Math.hypot(toEyeX, toEyeZ);
}

interface CardProps {
  project: Project;
  slot: number;
  idx: MotionValue<number>;
  goal: number;
  restTilt: number;
  onActivate: () => void;
  onFocusCard: () => void;
}

function WallCard({ project, slot, idx, goal, restTilt, onActivate, onFocusCard }: CardProps) {
  // The slot springs too, so filtering re-shuffles the cylinder instead of jumping.
  const slotMv = useSpring(slot, { stiffness: 170, damping: 24 });
  useEffect(() => {
    slotMv.set(slot);
  }, [slot, slotMv]);

  const d = useTransform([slotMv, idx] as MotionValue<number>[], ([a, b]: number[]) => a - b);
  const transform = useTransform(d, (v) => {
    const a = v * STEP;
    const r = (a * Math.PI) / 180;
    const x = Math.sin(r) * RADIUS;
    const z = (Math.cos(r) - 1) * RADIUS;
    const k = Math.min(1, Math.abs(v));
    const tilt = restTilt * (0.3 + 0.9 * k);
    return `translate3d(${x.toFixed(2)}px, ${(k * 14).toFixed(2)}px, ${z.toFixed(2)}px) rotateY(${a.toFixed(3)}deg) rotateZ(${tilt.toFixed(3)}deg)`;
  });
  const opacity = useTransform(d, (v) => clamp((facing((v * STEP * Math.PI) / 180) - FACE_HIDE) / (FACE_SHOW - FACE_HIDE), 0, 1));
  const shade = useTransform(d, (v) => Math.min(0.6, Math.abs(v) * 0.24));
  const pointerEvents = useTransform(opacity, (o) => (o < 0.1 ? 'none' : 'auto'));
  const visibility = useTransform(opacity, (o) => (o <= 0.001 ? 'hidden' : 'visible'));

  const dist = Math.abs(slot - goal);
  const isFront = dist === 0;

  return (
    <motion.div
      className={[s.slot, isFront && s.front].filter(Boolean).join(' ')}
      style={{ transform, opacity, pointerEvents, visibility }}
      aria-hidden={dist > 1 ? true : undefined}
      onFocus={onFocusCard}
      data-front={isFront || undefined}
      data-far={dist > 1 || undefined}
    >
      <motion.div
        className={s.pop}
        initial={{ opacity: 0, scale: 0.82, y: 60 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 70, transition: { duration: 0.28 } }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      >
        <TiltCard max={isFront ? 7 : 3} lift={isFront ? 18 : 0} glare={isFront} style={{ borderRadius: 'var(--r-md)' }} className={s.tilt}>
          <ProjectCard project={project} onActivate={onActivate} fixed inactive={dist > 1} />
          <motion.div className={s.shade} style={{ opacity: shade }} aria-hidden="true" />
        </TiltCard>
      </motion.div>
    </motion.div>
  );
}
