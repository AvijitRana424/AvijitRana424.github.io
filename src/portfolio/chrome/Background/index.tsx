import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { BoardScene } from '@/portfolio/three/boardScene';
import { BoardMarkings } from './BoardMarkings';
import styles from './Background.module.css';

type IdleHandle = { kind: 'idle' | 'timeout'; id: number };

function whenIdle(fn: () => void): IdleHandle {
  if (typeof window.requestIdleCallback === 'function') {
    return { kind: 'idle', id: window.requestIdleCallback(fn, { timeout: 2500 }) };
  }
  return { kind: 'timeout', id: window.setTimeout(fn, 600) };
}
function cancelIdle(h: IdleHandle | null) {
  if (!h) return;
  if (h.kind === 'idle') window.cancelIdleCallback?.(h.id);
  else window.clearTimeout(h.id);
}

const isMobileViewport = () =>
  window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches;

/** Data Saver on → skip the WebGL chunk entirely (the 2D markings still draw the board). */
const saveData = () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

/**
 * The living chalkboard behind everything: a fixed, pointer-less layer with a lazily
 * loaded Three.js scene (chalk dust + wireframe doodles) and faint 2D board markings.
 */
export default function Background() {
  const reduce = !!useReducedMotion();
  const glRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = glRef.current;
    if (!host) return;
    let cancelled = false;
    let scene: BoardScene | null = null;
    let resizeRaf = 0;
    const off: (() => void)[] = [];

    const boot = async () => {
      let mod: typeof import('@/portfolio/three/boardScene');
      try {
        mod = await import('@/portfolio/three/boardScene');
      } catch {
        return; // chunk failed → markings only
      }
      if (cancelled) return;
      const root = getComputedStyle(document.documentElement);
      const chalk = root.getPropertyValue('--chalk').trim();
      const contentMax = parseFloat(root.getPropertyValue('--container')) || 1160;
      scene = mod.createBoardScene({ container: host, mobile: isMobileViewport(), reduced: reduce, chalk, contentMax });
      if (!scene) return; // no WebGL → markings only
      const s = scene;

      s.setScroll(window.scrollY);
      s.renderOnce();
      requestAnimationFrame(() => !cancelled && setReady(true));

      const onResize = () => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => s.resize());
      };
      window.addEventListener('resize', onResize, { passive: true });
      off.push(() => window.removeEventListener('resize', onResize));

      if (reduce) return; // one static frame, nothing else

      // scrollY is read by the scene inside its own animation frame (no per-event layout reads)
      const onScroll = () => s.markScroll();
      const onPointer = (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        s.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      };
      const onLeave = () => s.setPointer(0, 0);
      const onVisibility = () => (document.hidden ? s.stop() : s.start());
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
      document.addEventListener('visibilitychange', onVisibility);
      off.push(
        () => window.removeEventListener('scroll', onScroll),
        () => window.removeEventListener('pointermove', onPointer),
        () => document.documentElement.removeEventListener('pointerleave', onLeave),
        () => document.removeEventListener('visibilitychange', onVisibility),
      );
      if (!document.hidden) s.start();
    };

    // Boot after the page has loaded and gone idle, so the three chunk never competes with
    // the hero's own chunks for bandwidth or main-thread time.
    let idle: IdleHandle | null = null;
    let paint = 0;
    const schedule = () => {
      paint = requestAnimationFrame(() => {
        idle = whenIdle(() => void boot());
      });
    };
    if (!saveData()) {
      if (document.readyState === 'complete') schedule();
      else {
        window.addEventListener('load', schedule, { once: true });
        off.push(() => window.removeEventListener('load', schedule));
      }
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(paint);
      cancelAnimationFrame(resizeRaf);
      cancelIdle(idle);
      off.forEach((f) => f());
      scene?.dispose();
      scene = null;
      setReady(false);
    };
  }, [reduce]);

  return (
    <div className={styles.root} aria-hidden="true">
      <div ref={glRef} className={styles.gl} data-ready={ready || undefined} />
      <BoardMarkings animate={!reduce} />
    </div>
  );
}
