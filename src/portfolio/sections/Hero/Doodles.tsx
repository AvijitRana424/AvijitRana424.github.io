// Hand-drawn chalk / ink doodles for the hero. Thin round-capped strokes with slightly wobbly paths.
import { useId, useRef } from 'react';
import { motion, useReducedMotion, type Transition } from 'framer-motion';
import { useLive } from './motion';

const draw = (delay: number, duration = 0.9): Transition => ({
  pathLength: { delay, duration, ease: [0.45, 0, 0.2, 1] },
  opacity: { delay, duration: 0.01 },
});

interface DoodleProps {
  className?: string;
  /** Start drawing when scrolled into view (default) or right away. */
  trigger?: 'view' | 'mount';
  delay?: number;
}

/** A coffee mug with curling steam. Draws itself in, then the steam drifts (only while on screen). */
export function CoffeeDoodle({ className, delay = 0, trigger = 'view' }: DoodleProps) {
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const live = useLive(ref, '0px');
  const on = { pathLength: 1, opacity: 1 };
  const anim = trigger === 'view' ? { whileInView: on, viewport: { once: true, margin: '-40px' } } : { animate: on };
  const p = (d: string, i: number, extra?: object) => (
    <motion.path
      d={d}
      initial={reduce ? false : { pathLength: 0, opacity: 0 }}
      {...anim}
      transition={draw(delay + i * 0.22)}
      {...extra}
    />
  );
  return (
    <svg ref={ref} className={className} viewBox="0 0 110 110" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* saucer */}
      {p('M14 93 C 32 99.5, 72 99, 94 92.5', 0)}
      {/* mug body */}
      {p('M24 50.5 C 23.5 64, 25 78, 31 86 C 40 91.5, 62 91, 70 85.5 C 76 77, 76.5 63, 75.5 50 C 58 52.5, 40 52.5, 24 50.5 Z', 1)}
      {/* rim highlight */}
      {p('M29 55.5 C 42 57.5, 58 57.5, 70.5 55', 2)}
      {/* handle */}
      {p('M75.5 58 C 88 55, 94 63, 89 71.5 C 86 76.5, 80 78, 73.5 77', 3)}
      {/* tiny heart on the mug */}
      {p('M49.5 75 C 44 70.5, 43.5 66, 47 65 C 48.6 64.6, 49.4 65.6, 49.8 66.6 C 50.3 65.4, 51.4 64.5, 53 65.1 C 56.3 66.4, 55 71, 49.5 75 Z', 4)}
      {/* steam */}
      <motion.g
        animate={reduce ? undefined : live ? { y: [0, -3.5, 0], opacity: [0.9, 0.45, 0.9] } : { y: 0, opacity: 0.9 }}
        transition={live ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: delay + 1.6 } : { duration: 0.4 }}
      >
        {p('M38 42 C 33 35, 42 30, 37 22', 5)}
        {p('M50 44 C 45 35, 55 29, 49 17', 5.4)}
        {p('M62 42 C 57 35, 66 30, 61 23', 5.8)}
      </motion.g>
    </svg>
  );
}

/** Curly chalk arrow used by the "click to flip" hint. */
export function CurlyArrow({ className, delay = 0, trigger = 'mount' }: DoodleProps) {
  const reduce = useReducedMotion();
  const on = { pathLength: 1, opacity: 1 };
  const anim = trigger === 'view' ? { whileInView: on, viewport: { once: true } } : { animate: on };
  return (
    <svg className={className} viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <motion.path
        d="M58 42 C 44 44, 30 40, 27 30 C 24.5 21, 34 17, 37 24 C 40 31, 28 36, 19 28 C 13 22.5, 10.5 14, 11 6"
        initial={reduce ? false : { pathLength: 0, opacity: 0 }}
        {...anim}
        transition={draw(delay, 0.9)}
      />
      <motion.path
        d="M5 12.5 C 7.5 9.5, 9.5 7.5, 11 5.5 C 13 8, 15 10, 17.5 12"
        initial={reduce ? false : { pathLength: 0, opacity: 0 }}
        {...anim}
        transition={draw(delay + 0.8, 0.35)}
      />
    </svg>
  );
}

/** Bouncing down arrow for the scroll hint. */
export function DownArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.2 3 C 11.2 12, 13 22, 12 35" />
      <path d="M4.5 26.5 C 7.5 29.5, 10 32.5, 12 36 C 14.2 32.3, 16.6 29.4, 19.8 26" />
    </svg>
  );
}

/**
 * Placeholder "portrait" for the polaroid when no photo exists yet:
 * a friendly ink doodle of a person on a warm gradient, drawn in line by line.
 * The face (outline, eyes, smile) is drawn first so the half-drawn doodle never reads as a frown.
 */
export function PortraitDoodle({ className, delay = 0.4 }: { className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const gid = `pd-${useId().replace(/:/g, '')}`;
  const strokes = [
    // head
    'M60 20 C 78 19.5, 86 33, 85.5 48 C 85 64, 74 78, 60 78.5 C 46 78, 35 65, 34.5 48 C 34 33, 42 20.5, 60 20 Z',
    // eyes (happy arcs)
    'M46 50 C 48 47, 52 47, 54 50 M66 50 C 68 47, 72 47, 74 50',
    // smile + nose
    'M50.5 65 C 55 70.5, 65 70.5, 69.5 65 M60 53 C 59 58, 58.5 60, 61 60.5',
    // hair
    'M35.5 44 C 33 28, 44 14.5, 60 15 C 72 15.2, 81 21, 85 31 C 86.5 35.5, 86 40, 85 44 C 79 36, 72 31.5, 64 30 C 66 34, 64 36, 61 36.5 C 56 31, 49 29, 42 31 C 39 35, 37 39.5, 35.5 44',
    // ears
    'M34.8 46 C 29.5 45, 29 55, 35.5 56.5 M85.2 46 C 90.5 45, 91 55, 84.5 56.5',
    // neck
    'M52 76 C 52.5 81, 52 85, 50 88 M68 76 C 67.5 81, 68 85, 70 88',
    // collar
    'M48 87 C 53 97, 67 97, 72 87',
    // shoulders / t-shirt (last: on its own under the cheeks it looks like a frown)
    'M18 118 C 22 98, 34 90, 48 87 C 55 93, 65 93, 72 87 C 86 90, 98 98, 102 118',
  ];
  const stagger = 0.08;
  const smileDone = delay + 2 * stagger + 0.45;
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id={gid} cx="30%" cy="22%" r="95%">
          <stop offset="0%" style={{ stopColor: 'var(--sticky)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--kraft)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--accent-2)', stopOpacity: 0.55 }} />
        </radialGradient>
      </defs>
      <rect width="120" height="120" fill={`url(#${gid})`} />
      {/* blush: only once the smile is there */}
      <motion.g
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: smileDone, duration: 0.3 }}
        style={{ fill: 'var(--accent)' }}
      >
        <circle cx="44" cy="60" r="4.5" opacity="0.18" />
        <circle cx="76" cy="60" r="4.5" opacity="0.18" />
      </motion.g>
      <g fill="none" style={{ stroke: 'var(--ink)' }} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" opacity="0.85">
        {strokes.map((d, i) => (
          <motion.path
            key={i}
            d={d}
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={draw(delay + i * stagger, 0.45)}
          />
        ))}
      </g>
      {/* sparkles */}
      <g fill="none" style={{ stroke: 'var(--paper)' }} strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
        <path d="M100 18 v9 M95.5 22.5 h9" />
        <path d="M16 28 v6 M13 31 h6" />
      </g>
    </svg>
  );
}
