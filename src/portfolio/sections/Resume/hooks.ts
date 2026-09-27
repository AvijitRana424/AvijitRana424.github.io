import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react';

/** true once the element comes within `margin` of the viewport (stays true). */
export function useNearViewport(ref: RefObject<Element | null>, margin = '600px'): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: `${margin} 0px ${margin} 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, near]);
  return near;
}

/** Content-box width of an element, kept up to date with ResizeObserver. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? el.clientWidth;
      setW((prev) => (Math.abs(prev - cw) >= 0.5 ? cw : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Debounced copy of a value; the first non-zero value is applied immediately. */
export function useSettled<T>(value: T, delay = 160, immediate?: (prev: T) => boolean): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (immediate?.(v)) {
      setV(value);
      return;
    }
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);
  return v;
}

/** Re-renders every `ms` so relative times stay fresh (skips ticks while the tab is hidden). */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => !document.hidden && setNow(Date.now());
    const t = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms]);
  return now;
}

/** Live `matchMedia(query).matches` (false where matchMedia is unavailable). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener?.('change', cb);
      return () => mql.removeEventListener?.('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches,
    () => false,
  );
}

/** Touch-first device: copy says "tap" instead of "click". */
export const useCoarsePointer = () => useMediaQuery('(hover: none) and (pointer: coarse)');

/** The visitor asked the browser to save data (Chrome / Android "Lite" modes). */
export function prefersSaveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return c?.saveData === true;
}

const rtf = typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'recently';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'recently';
  const diff = (t - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
    ['week', 604800],
    ['month', 2629800],
    ['year', 31557600],
  ];
  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let size = 60;
  for (const [u, s] of steps) if (abs >= s) [unit, size] = [u, s];
  const n = Math.round(diff / size);
  return rtf ? rtf.format(n, unit) : `${Math.abs(n)} ${unit}${Math.abs(n) === 1 ? '' : 's'} ago`;
}

/** "Sep 12, 2026" (or "Sep 2026" with { day: false }). Empty string for bad input. */
export function formatDay(iso: string | null | undefined, { day = true }: { day?: boolean } = {}): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en', day ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', year: 'numeric' });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0' });
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
