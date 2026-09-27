// Hero entrance choreography + a "should decorative loops run?" hook.
import type { RefObject } from 'react';
import { useInView, usePageInView, type UseInViewOptions } from 'framer-motion';

/**
 * Entrance timeline (seconds after mount). Most important first: name → taglines → polaroid → note.
 * Everything a visitor needs to read has landed by ~0.9s; decoration (doodles, hints) comes after.
 */
export const T = {
  name: 0.04,
  letterStagger: 0.028,
  tagline: 0.16,
  socials: 0.26,
  badge: 0.4,
  polaroid: 0.24,
  /** portrait doodle starts drawing once the polaroid has landed */
  portrait: 0.42,
  note: 0.32,
  noteItems: 0.4,
  noteStagger: 0.06,
  foot: 0.62,
  decor: 1.0,
} as const;

/** Decorative JS-driven loops only run while `ref` is near the viewport and the tab is visible. */
export function useLive(ref: RefObject<Element | null>, margin: UseInViewOptions['margin'] = '200px 0px 200px 0px') {
  const inView = useInView(ref, { margin });
  const pageVisible = usePageInView();
  return inView && pageVisible;
}
