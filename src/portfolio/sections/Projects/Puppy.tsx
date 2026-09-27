import { forwardRef, useEffect, useRef } from 'react';
import { motion, useMotionValueEvent, useTransform, type MotionValue } from 'framer-motion';
import { clamp } from './hooks';
import s from './Puppy.module.css';

/** A little chalk-drawn puppy. Legs trot + tail wags faster while `.walking` is on the svg. */
export const Puppy = forwardRef<SVGSVGElement, { className?: string }>(function Puppy({ className }, ref) {
  return (
    <svg ref={ref} className={[s.puppy, className].filter(Boolean).join(' ')} viewBox="0 0 58 40" width="58" height="40" aria-hidden="true">
      <g className={s.bob}>
        <path className={s.tail} d="M14.2 17.6 C9 16.6, 6.4 12.4, 8.6 7.6" />
        {/* far legs (dimmer, behind the body) */}
        <path className={`${s.leg} ${s.far} ${s.legB}`} d="M20.5 22.5 L20.8 32.6 H23" />
        <path className={`${s.leg} ${s.far} ${s.legA}`} d="M35.2 22 L36 32.6 H38.2" />
        <path className={s.body} d="M14 16.5 C15 11.5, 33 10.5, 38.5 14.5 C42 17.5, 40 24.5, 32 24.5 H19 C14.5 24.5, 12.5 21, 14 16.5 Z" />
        {/* near legs */}
        <path className={`${s.leg} ${s.legA}`} d="M17 22.5 L16 32.6 H18.6" />
        <path className={`${s.leg} ${s.legB}`} d="M31.8 22.5 L31.4 32.6 H34" />
        {/* head */}
        <path
          className={s.body}
          d="M37 12.5 C36.5 6.5, 44 3.5, 48.5 7 C50.5 8.5, 51 9.5, 53.5 10.5 C56 11.5, 55.5 15.5, 52.5 16 C49 16.8, 45 17.5, 41.5 17 C38.5 16.5, 37.2 15, 37 12.5 Z"
        />
        <path className={s.ear} d="M41.4 6.4 C37.6 6.6, 36.2 11.6, 38.2 15.6 C40.8 15, 42.8 11, 42.8 7.4 Z" />
        <path className={s.tongue} d="M49.6 16.4 C49.8 19.6, 52.4 20, 52.8 16.2" />
        <circle className={s.dot} cx="46.6" cy="10.2" r="1.15" />
        <circle className={s.dot} cx="54.4" cy="12.4" r="1.45" />
        <path className={s.collar} d="M38.4 16.4 C40 18.8, 43.2 19.8, 45.6 18.6" />
      </g>
    </svg>
  );
});

const LINE = 'M2 5.2 C40 3.4, 82 6.6, 122 5 S204 3.6, 246 5.3 S334 6.4, 398 4.6';

interface TrackProps {
  /** 0..1 */
  progress: MotionValue<number>;
  /** Number of cards → small chalk tick marks along the bar. */
  stops: number;
  className?: string;
}

/** Chalk line progress bar with a red fill and a puppy that walks to the current position. */
export function PuppyTrack({ progress, stops, className }: TrackProps) {
  // Walking state is toggled on the DOM directly: the progress value can change while a parent
  // renders (framer recomputes transforms in render), so no React state here.
  const dog = useRef<SVGSVGElement>(null);
  const last = useRef(progress.get());
  const timer = useRef<number | undefined>(undefined);

  useMotionValueEvent(progress, 'change', (v) => {
    const dv = v - last.current;
    last.current = v;
    const el = dog.current;
    if (!el || Math.abs(dv) < 0.0006) return;
    el.classList.add(s.walking);
    el.style.transform = `scaleX(${dv > 0 ? 1 : -1})`;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => el.classList.remove(s.walking), 170);
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // a rail-wide lane slides by a % of its own width: transform only, no per-frame layout (unlike `left`)
  const x = useTransform(progress, (p) => `${(clamp(p, 0, 1) * 100).toFixed(3)}%`);
  const clip = useTransform(progress, (p) => `inset(-8px ${((1 - clamp(p, 0, 1)) * 100).toFixed(3)}% -8px 0)`);

  return (
    <div className={[s.track, className].filter(Boolean).join(' ')} aria-hidden="true">
      <div className={s.rail}>
        <svg className={s.line} viewBox="0 0 400 10" preserveAspectRatio="none">
          <path d={LINE} vectorEffect="non-scaling-stroke" />
        </svg>
        <motion.svg className={`${s.line} ${s.fill}`} viewBox="0 0 400 10" preserveAspectRatio="none" style={{ clipPath: clip }}>
          <path d={LINE} vectorEffect="non-scaling-stroke" />
        </motion.svg>
        {stops > 1 &&
          Array.from({ length: stops }, (_, i) => <span key={i} className={s.stop} style={{ left: `${(i / (stops - 1)) * 100}%` }} />)}
        <motion.div className={s.dogLane} style={{ x }}>
          <div className={s.dog}>
            <Puppy ref={dog} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
