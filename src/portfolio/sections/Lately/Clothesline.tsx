import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate, motionValue, useInView, usePageInView, useReducedMotion, type PanInfo } from 'framer-motion';
import type { LatelyItem } from '@/data/profile';
import { LatelyCard, type CardMotion } from './LatelyCard';
import { LatelyModal } from './LatelyModal';
import { Note } from './Note';
import { Rope, type RopeHandle } from './Rope';
import {
  clamp,
  computeLayout,
  PAPER_OFFSET,
  ropeBase,
  ropePath,
  ropeY,
  seeded,
  trackHeight,
  type Pull,
  type RopeState,
} from './geometry';
import styles from './Lately.module.css';

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

function ChalkArrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 28 24" width="26" height="22" aria-hidden="true" style={dir === 'left' ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M3 12.6 C 9 11.2, 15 13, 23.4 11.8" />
      <path d="M16.4 5.2 C 19 7.6, 21.4 9.8, 23.8 11.9 C 21 14, 18.8 16.2, 16.8 18.6" />
    </svg>
  );
}

export function Clothesline({ items }: { items: LatelyItem[] }) {
  const n = items.length;
  const reduce = !!useReducedMotion();
  const touch = useMedia('(hover: none) and (pointer: coarse)');
  const interactive = !reduce;
  const draggable = interactive && !touch;

  const outerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const ropeRef = useRef<RopeHandle>(null);
  const slotRefs = useRef<(HTMLLIElement | null)[]>([]);

  const [viewW, setViewW] = useState(() => (typeof document !== 'undefined' ? document.documentElement.clientWidth : 1280));
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    setViewW(Math.round(el.clientWidth));
    const ro = new ResizeObserver(([e]) => setViewW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const base = useMemo(() => computeLayout(viewW, n), [viewW, n]);

  // Card height = the tallest card's natural content (all polaroids share one size).
  const [natural, setNatural] = useState(0);
  const measure = useCallback(() => {
    let max = 0;
    for (const slot of slotRefs.current) {
      const paper = slot?.querySelector<HTMLElement>('[data-measure="paper"]');
      const blurb = slot?.querySelector<HTMLElement>('[data-measure="blurb"]');
      const foot = slot?.querySelector<HTMLElement>('[data-measure="foot"]');
      if (!paper || !blurb || !foot) continue;
      const padB = parseFloat(getComputedStyle(paper).paddingBottom) || 0;
      max = Math.max(max, blurb.offsetTop + blurb.offsetHeight + foot.offsetHeight + padB);
    }
    if (max) setNatural(Math.ceil(max + 6));
  }, []);
  useLayoutEffect(() => {
    measure();
    let alive = true;
    document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
    };
  }, [measure, base.cw]);
  const L = useMemo(() => {
    const ch = natural ? clamp(natural, 280, 460) : base.ch;
    return { ...base, ch, H: trackHeight(base.y0, base.sag, ch) };
  }, [base, natural]);

  const entered = useInView(outerRef, { once: true, amount: 0.2 });
  // the idle sway is a rAF loop: run it only near the viewport and while the tab is visible
  const nearView = useInView(outerRef, { margin: '200px 0px 200px 0px' });
  const pageVisible = usePageInView();
  const visible = nearView && pageVisible;

  // ── motion state (lives outside React renders) ────────────────────────────
  const mvs = useMemo<CardMotion[]>(
    () => Array.from({ length: n }, () => ({ swing: motionValue(0), dx: motionValue(0), dy: motionValue(0) })),
    [n],
  );
  const bounce = useMemo(() => motionValue(0), []);
  const tilts = useMemo(() => items.map((it) => seeded(it.id) * 2.2), [items]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const kickOne = useCallback(
    (i: number, v: number) => {
      const s = mvs[i]?.swing;
      if (!s) return;
      animate(s, 0, {
        type: 'spring',
        velocity: clamp(s.getVelocity() + v, -170, 170),
        stiffness: 64,
        damping: 3.8,
        mass: 1,
        restDelta: 0.01,
        restSpeed: 0.05,
      });
    },
    [mvs],
  );

  /** Swing card i; the breeze carries on to its neighbours, a little later and a little weaker. */
  const kick = useCallback(
    (i: number, v: number, spread = true) => {
      if (reduce) return;
      kickOne(i, v);
      if (!spread) return;
      const waves: [number, number, number][] = [
        [1, 0.38, 110],
        [2, 0.14, 230],
      ];
      for (const [k, f, ms] of waves)
        for (const j of [i - k, i + k])
          if (j >= 0 && j < n) timers.current.push(window.setTimeout(() => kickOne(j, v * f), ms));
      if (timers.current.length > 60) timers.current = timers.current.slice(-30);
    },
    [reduce, kickOne, n],
  );

  // ── the frame: rope shape → pins ride on it ───────────────────────────────
  const draw = useCallback(
    (time: number) => {
      const t = reduce ? 0 : time;
      const still = reduce ? 0 : 1;
      const s: RopeState = {
        aL: L.aL,
        aR: L.aR,
        yL: L.y0 + still * Math.sin(t * 1.05) * 4,
        yR: L.y0 + still * Math.sin(t * 0.83 + 1.9) * 4,
        sag: L.sag + still * Math.sin(t * 0.57) * 2.6 + bounce.get(),
      };
      const pulls: Pull[] = [];
      for (let i = 0; i < n; i++) {
        const dx = mvs[i].dx.get();
        const dy = mvs[i].dy.get();
        if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) continue;
        const px = clamp(L.xs[i] + dx, L.aL + 6, L.aR - 6);
        pulls.push({ index: i, px, off: ropeBase(L.xs[i], s) + dy - ropeBase(px, s) });
      }
      ropeRef.current?.draw(ropePath(s, pulls), s, t);
      for (let i = 0; i < n; i++) {
        const el = slotRefs.current[i];
        if (!el) continue;
        const x = L.xs[i];
        const y = ropeY(x, s, pulls, i);
        const slope = (ropeY(x + 8, s, pulls, i) - ropeY(x - 8, s, pulls, i)) / 16;
        const idle = still * Math.sin(t * 1.25 + i * 1.7) * 0.55;
        const rot = tilts[i] + Math.atan(slope) * (180 / Math.PI) * 0.32 + idle;
        el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) rotate(${rot.toFixed(3)}deg)`;
      }
    },
    [L, n, mvs, bounce, tilts, reduce],
  );

  useLayoutEffect(() => draw(performance.now() / 1000), [draw]);
  useEffect(() => {
    if (reduce || !visible) return;
    let raf = 0;
    const tick = (now: number) => {
      draw(now / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw, reduce, visible]);

  // ── interaction plumbing ───────────────────────────────────────────────────
  const [active, setActive] = useState<number | null>(null);
  // the "drag me!" note has done its job once someone has played with the line
  const [played, setPlayed] = useState(false);
  const onActive = useCallback((i: number, on: boolean) => setActive((cur) => (on ? i : cur === i ? null : cur)), []);
  const onGrab = useCallback((i: number) => {
    setActive(i);
    setPlayed(true);
  }, []);
  const onRelease = useCallback(
    (i: number, info: PanInfo) => {
      if (reduce) return;
      // neighbours feel the tug through the rope
      const v = clamp(-info.offset.x * 0.35, -50, 50);
      for (const j of [i - 1, i + 1]) if (j >= 0 && j < n) kickOne(j, v);
      const dy = info.offset.y;
      animate(bounce, 0, {
        type: 'spring',
        velocity: clamp(-Math.sign(dy || 1) * (Math.abs(dy) * 0.9 + 40), -160, 160),
        stiffness: 150,
        damping: 5.5,
      });
    },
    [reduce, n, kickOne, bounce],
  );

  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [stepDir, setStepDir] = useState(1);
  const onOpen = useCallback((i: number) => {
    setStepDir(1);
    setOpenIdx(i);
    setPlayed(true);
  }, []);
  const onClose = useCallback(() => setOpenIdx(null), []);
  const onStep = useCallback(
    (delta: number) => {
      setStepDir(delta);
      setOpenIdx((cur) => (cur === null ? cur : (cur + delta + n) % n));
    },
    [n],
  );

  // ── scroll track (narrow viewports) ───────────────────────────────────────
  const [edges, setEdges] = useState({ start: true, end: false, current: 0 });
  const syncScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !L.scroll) return;
    const max = el.scrollWidth - el.clientWidth;
    const mid = el.scrollLeft + el.clientWidth / 2;
    const start = el.scrollLeft < 6;
    const end = el.scrollLeft > max - 6;
    let current = 0;
    L.xs.forEach((x, i) => {
      if (Math.abs(x - mid) < Math.abs(L.xs[current] - mid)) current = i;
    });
    if (start) current = 0;
    else if (end) current = n - 1;
    if (el.scrollLeft > 24) setPlayed(true);
    const next = { start, end, current };
    setEdges((p) => (p.start === next.start && p.end === next.end && p.current === next.current ? p : next));
  }, [L, n]);
  useEffect(() => {
    syncScroll();
  }, [syncScroll]);
  const onScroll = useCallback(() => {
    window.requestAnimationFrame(syncScroll);
  }, [syncScroll]);
  const stepScroll = (delta: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    // one card pitch; scroll-snap settles it on the nearest card
    el.scrollBy({ left: delta * (L.cw + L.gap), behavior: reduce ? 'auto' : 'smooth' });
  };

  const gx = (L.xs[L.noteGap] + L.xs[Math.min(n - 1, L.noteGap + 1)]) / 2;
  const noteY = ropeBase(gx, { aL: L.aL, aR: L.aR, yL: L.y0, yR: L.y0, sag: L.sag }) - 7;

  const scrollerCls = [
    styles.scroller,
    L.scroll && styles.scrollMode,
    L.scroll && !edges.start && styles.fadeL,
    L.scroll && !edges.end && styles.fadeR,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={outerRef} className={styles.line}>
      <div
        ref={scrollerRef}
        className={scrollerCls}
        onScroll={L.scroll ? onScroll : undefined}
        role={L.scroll ? 'region' : undefined}
        aria-label={L.scroll ? 'Recent highlights — scroll sideways for more' : undefined}
      >
        <div className={styles.content} style={{ width: L.W, height: L.H }}>
          <Rope
            ref={ropeRef}
            width={L.W}
            height={L.H}
            reveal={interactive}
            entered={entered || !interactive}
            planeScale={L.compact ? 0.8 : 1}
          />
          {n > 1 && <Note tx={gx} ty={noteY} reveal={interactive} entered={entered || !interactive} done={played} />}
          {L.scroll &&
            L.xs.map((x, i) => <span key={i} className={styles.snap} style={{ left: x - L.cw / 2, width: L.cw }} aria-hidden="true" />)}
          <ul className={styles.cards}>
            {items.map((item, i) => (
              <li
                key={item.id}
                ref={(el) => {
                  slotRefs.current[i] = el;
                }}
                className={styles.slot}
                style={{
                  left: L.xs[i] - L.cw / 2,
                  width: L.cw,
                  height: L.ch + PAPER_OFFSET,
                  zIndex: active === i ? 6 : 1,
                }}
              >
                <LatelyCard
                  item={item}
                  index={i}
                  height={L.ch + PAPER_OFFSET}
                  mv={mvs[i]}
                  interactive={interactive}
                  draggable={draggable}
                  entered={entered}
                  onKick={kick}
                  onGrab={onGrab}
                  onRelease={onRelease}
                  onActive={onActive}
                  onOpen={onOpen}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {L.scroll && (
        <div className={styles.controls}>
          <button type="button" className={styles.arrowBtn} onClick={() => stepScroll(-1)} disabled={edges.start} aria-label="Previous highlight">
            <ChalkArrow dir="left" />
          </button>
          <div className={styles.dots} aria-hidden="true">
            {items.map((it, i) => (
              <span key={it.id} className={i === edges.current ? styles.dotOn : styles.dot} />
            ))}
          </div>
          <button type="button" className={styles.arrowBtn} onClick={() => stepScroll(1)} disabled={edges.end} aria-label="Next highlight">
            <ChalkArrow dir="right" />
          </button>
        </div>
      )}

      <LatelyModal items={items} index={openIdx} dir={stepDir} onClose={onClose} onStep={onStep} />
    </div>
  );
}
