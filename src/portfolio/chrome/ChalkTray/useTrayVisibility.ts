import { useEffect, useRef, useState, type RefObject } from 'react';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const INTERACTIVE = 'a[href],button,input,select,textarea,label,summary,[role="button"],[tabindex]:not([tabindex="-1"])';

/** Is this hit-tested element real page content (not the board, a full-bleed wrapper or decoration)? */
function isContent(el: Element, vw: number) {
  if (el === document.documentElement || el === document.body) return false;
  if (el.closest('[data-board-decor]')) return false; // stickers, the chalk canvas: decoration by design
  const r = el.getBoundingClientRect();
  if (r.width >= vw - 2) return false; // section roots / full-bleed wrappers
  if (el.matches(INTERACTIVE)) return true;
  if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLCanvasElement) return true;
  for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) return true;
  const cs = getComputedStyle(el);
  if (cs.backgroundImage !== 'none') return true;
  const bg = cs.backgroundColor;
  return bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg);
}

/**
 * Hit-test a small grid of points inside `rect` and report whether any page content is
 * underneath (ignoring elements inside `exclude`). Cheap: 9 elementsFromPoint calls.
 */
export function areaHasContent(rect: Rect, exclude: (Element | null | undefined)[]) {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const inset = 4;
  const xs = [rect.left + inset, (rect.left + rect.right) / 2, rect.right - inset];
  const ys = [rect.top + inset, (rect.top + rect.bottom) / 2, rect.bottom - inset];
  for (const x of xs) {
    for (const y of ys) {
      for (const el of document.elementsFromPoint(x, y)) {
        if (exclude.some((e) => e && e.contains(el))) continue;
        if (isContent(el, vw)) return true;
      }
    }
  }
  return false;
}

export interface TrayVisibility {
  /** The footer (#contact) is on screen — its links sit in the tray's corner. */
  footer: boolean;
  /** A real modal is open (#root is inert, or an aria-modal dialog exists). */
  modal: boolean;
  /** Any dialog / popover is open (includes non-modal popovers such as the skill card). */
  dialog: boolean;
  /** Keyboard focus landed on something the tray would cover (WCAG 2.4.11). */
  tucked: boolean;
  /** The user is scrolling down (only reported when `scrollAware` is on). */
  scrolledAway: boolean;
  /** Still on the first screen (only reported when `scrollAware` is on). */
  atTop: boolean;
  /** Page content is under the tray's spot (only reported when `probe` is on). */
  covered: boolean;
}

interface Options {
  /** Element that must never be treated as "covered" (the tray itself + its bar). */
  selfRefs: RefObject<HTMLElement | null>[];
  /** Screen rect the tray occupies when shown (viewport coordinates). */
  homeRect: () => { left: number; top: number; right: number; bottom: number };
  /** Hide while scrolling down (used when the collapsed button overlaps content). */
  scrollAware: boolean;
  /**
   * Hide whenever page content scrolls under the tray (used when the tray lives in the
   * gutter — a few sections, e.g. the clothesline, run wider than the content column).
   */
  probe: boolean;
}

const SCROLL_IDLE_MS = 900;

/** Decides when the chalk tray should step out of the way. */
export function useTrayVisibility({ selfRefs, homeRect, scrollAware, probe }: Options): TrayVisibility {
  const [footer, setFooter] = useState(false);
  const [modal, setModal] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [tucked, setTucked] = useState(false);
  const [scrolledAway, setScrolledAway] = useState(false);
  const [atTop, setAtTop] = useState(false);
  const [covered, setCovered] = useState(false);
  const homeRef = useRef(homeRect);
  homeRef.current = homeRect;
  const selfRef = useRef(selfRefs);
  selfRef.current = selfRefs;

  // ── footer in view ────────────────────────────────────────────────────────
  useEffect(() => {
    let io: IntersectionObserver | null = null;
    let tries = 0;
    let timer = 0;
    const attach = () => {
      const el = document.getElementById('contact') ?? (tries > 30 ? document.querySelector('body footer') : null);
      if (!el) {
        tries++;
        timer = window.setTimeout(attach, 400);
        return;
      }
      io = new IntersectionObserver(([e]) => setFooter(e.isIntersecting), { rootMargin: '0px 0px -40px 0px' });
      io.observe(el);
    };
    attach();
    return () => {
      window.clearTimeout(timer);
      io?.disconnect();
    };
  }, []);

  // ── modals / popovers ─────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const root = document.getElementById('root');
    const check = () => {
      raf = 0;
      const isModal = !!root?.inert || !!document.querySelector('[aria-modal="true"]');
      const anyDialog = isModal || !!document.querySelector('[role="dialog"]');
      setModal(isModal);
      setDialog(anyDialog);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    if (root) mo.observe(root, { attributes: true, attributeFilter: ['inert'] });
    check();
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, []);

  // ── keyboard focus under the tray → tuck it away ──────────────────────────
  useEffect(() => {
    let raf = 0;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      cancelAnimationFrame(raf);
      if (!(t instanceof Element) || selfRef.current.some((r) => r.current?.contains(t))) {
        setTucked(false);
        return;
      }
      // measure after the browser has scrolled the focused element into view
      raf = requestAnimationFrame(() => {
        if (!t.matches(':focus-visible')) return setTucked(false);
        const r = t.getBoundingClientRect();
        const h = homeRef.current();
        const pad = 6;
        const overlaps = r.right > h.left - pad && r.left < h.right + pad && r.bottom > h.top - pad && r.top < h.bottom + pad;
        setTucked(overlaps);
      });
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!e.relatedTarget) setTucked(false);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  // ── scroll-aware hide (scrolling down → away; up / idle → back) ───────────
  useEffect(() => {
    if (!scrollAware) {
      setScrolledAway(false);
      setAtTop(false);
      return;
    }
    let raf = 0;
    let idle = 0;
    let lastY = window.scrollY;
    const read = () => {
      raf = 0;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      setAtTop(y < window.innerHeight * 0.5);
      if (dy > 4 && y > 120) setScrolledAway(true);
      else if (dy < -4) setScrolledAway(false);
    };
    read();
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setScrolledAway(false), SCROLL_IDLE_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idle);
      window.removeEventListener('scroll', onScroll);
    };
  }, [scrollAware]);

  // ── content probe (throttled while scrolling, plus a trailing check) ──────
  useEffect(() => {
    if (!probe) {
      setCovered(false);
      return;
    }
    let raf = 0;
    let last = 0;
    let trail: number[] = [];
    const check = () => {
      raf = 0;
      last = performance.now();
      setCovered(areaHasContent(homeRef.current(), selfRef.current.map((r) => r.current)));
    };
    const soon = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    const schedule = () => {
      // throttled while scrolling, then a few trailing checks: entrance animations keep
      // moving cards around for a moment after the scroll stops
      trail.forEach((t) => window.clearTimeout(t));
      trail = [140, 700, 1600, 2600].map((t) => window.setTimeout(soon, t));
      if (performance.now() - last > 110) soon();
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    // sections stream in and change height for a while after mount; content can also move
    // without any scroll (drags, carousels), so keep a slow heartbeat too
    const timers = [300, 1200, 3000].map((t) => window.setTimeout(soon, t));
    const beat = window.setInterval(() => !document.hidden && soon(), 1000);
    // sections above growing (lazy content, "show more") shift everything without a scroll event
    const ro = new ResizeObserver(schedule);
    const main = document.querySelector('main');
    if (main) ro.observe(main);
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      trail.forEach((t) => window.clearTimeout(t));
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(beat);
      ro.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [probe]);

  return { footer, modal, dialog, tucked, scrolledAway, atTop, covered };
}
