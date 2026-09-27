import { useEffect, useState } from 'react';
import { SECTIONS } from '@/portfolio/sections';

/** Document-space top of an element (layout position, ignores transforms from entrance animations). */
function docTop(el: HTMLElement) {
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
  return y;
}

/**
 * Returns the id of the section currently under the "reading line" (38% of the viewport height).
 * Scroll-position based (not IntersectionObserver) so tall and short sections behave the same. Section
 * positions are measured once and cached; a ResizeObserver on <body> (lazy sections popping in, layout
 * shifts) and window resizes invalidate the cache, so scrolling itself only reads window.scrollY.
 */
export function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let raf = 0;
    let dirty = true;
    let tops: { id: string; top: number }[] = [];
    let docH = 0;

    const measure = () => {
      tops = [];
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el) tops.push({ id: s.id, top: docTop(el) });
      }
      docH = document.documentElement.scrollHeight;
      dirty = false;
    };

    const compute = () => {
      raf = 0;
      if (dirty) measure();
      const sy = window.scrollY;
      const line = sy + window.innerHeight * 0.38;
      let current: string | null = null;
      for (const t of tops) if (t.top <= line) current = t.id;
      const atBottom = window.innerHeight + sy >= docH - 4;
      if (atBottom && sy > 0 && tops.length) current = tops[tops.length - 1].id;
      setActive(current);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    const invalidate = () => {
      dirty = true;
      schedule();
    };

    compute();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', invalidate);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidate) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', invalidate);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return active;
}

/** Map any section id to the nav item that should be highlighted (non-nav sections borrow the previous nav item). */
export function toNavId(id: string | null): string | null {
  if (!id || id === 'contact') return null;
  const idx = SECTIONS.findIndex((s) => s.id === id);
  for (let i = idx; i >= 0; i--) if (SECTIONS[i].inNav) return SECTIONS[i].id;
  return null;
}
