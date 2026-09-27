import { useEffect, useState } from 'react';

/** Full tray footprint (unscaled) and its offsets from the viewport corner when docked. */
export const TRAY_W = 232;
export const TRAY_EDGE = 18;
/** Collapsed chalk button. */
export const FAB = 48;
export const FAB_EDGE = 16;
/** Minimum empty space between the tray (or hint) and the content column. */
const CLEAR = 12;
/** The docked tray may shrink a little to fit the gutter, never below this. */
const MIN_SCALE = 0.82;
/** Hint note width when it sits above the collapsed button. */
export const HINT_W = 150;

export interface TrayLayout {
  /** Right gutter: viewport edge → content column edge, in px. */
  gutter: number;
  /** Full tray lives permanently in the right gutter (wide screens with a mouse). */
  docked: boolean;
  /** Scale applied to the docked tray so it fits the gutter. */
  scale: number;
  /** The collapsed button sits entirely in the gutter (never over content). */
  fabInGutter: boolean;
  /** The first-visit hint note fits in the gutter without touching content. */
  hintFits: boolean;
  phone: boolean;
  /** Hover-capable fine pointer (mouse / trackpad). */
  fine: boolean;
}

const PHONE = '(max-width: 767.98px)';
const FINE = '(hover: hover) and (pointer: fine)';

function measure(): TrayLayout {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const cs = getComputedStyle(document.documentElement);
  const max = parseFloat(cs.getPropertyValue('--container')) || 1160;
  // mirrors .container: width 100%, max-width var(--container), padding-inline var(--gutter)
  const pad = Math.min(40, Math.max(16, vw * 0.04));
  const gutter = (vw - Math.min(vw, max)) / 2 + pad;
  const phone = window.matchMedia(PHONE).matches;
  const fine = window.matchMedia(FINE).matches;
  const fit = (gutter - TRAY_EDGE - CLEAR) / TRAY_W;
  const scale = Math.min(1, fit);
  const docked = fine && !phone && fit >= MIN_SCALE;
  const fabInGutter = gutter >= FAB + FAB_EDGE + CLEAR;
  const hintFits = !phone && (docked ? true : gutter >= HINT_W + FAB_EDGE + CLEAR);
  return { gutter, docked, scale: docked ? scale : 1, fabInGutter, hintFits, phone, fine };
}

const same = (a: TrayLayout, b: TrayLayout) =>
  a.docked === b.docked &&
  a.phone === b.phone &&
  a.fine === b.fine &&
  a.fabInGutter === b.fabInGutter &&
  a.hintFits === b.hintFits &&
  Math.abs(a.scale - b.scale) < 0.005 &&
  Math.abs(a.gutter - b.gutter) < 1;

/** Where the chalk tray may live at the current viewport size (re-measured on resize). */
export function useTrayLayout(): TrayLayout {
  const [layout, setLayout] = useState<TrayLayout>(measure);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const next = measure();
      setLayout((prev) => (same(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const mqs = [window.matchMedia(PHONE), window.matchMedia(FINE)];
    window.addEventListener('resize', schedule, { passive: true });
    mqs.forEach((m) => m.addEventListener('change', schedule));
    update();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      mqs.forEach((m) => m.removeEventListener('change', schedule));
    };
  }, []);
  return layout;
}
