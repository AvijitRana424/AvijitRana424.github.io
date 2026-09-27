import { useEffect, useState } from 'react';

/** Reactive matchMedia. Reads synchronously on first render to avoid a layout flash. */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * "Dwell" easing for scroll → card index: each card holds at the front for a while
 * before the wall turns to the next one. f(k) = k for every integer k.
 */
const HOLD = 0.22;
export function dwell(x: number): number {
  const k = Math.floor(x);
  const f = x - k;
  const t = clamp((f - HOLD) / (1 - 2 * HOLD), 0, 1);
  return k + t * t * (3 - 2 * t);
}
