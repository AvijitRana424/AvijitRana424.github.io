import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

interface Props {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}

/** Number that counts up the first time it scrolls into view (and glides on later value changes).
 *  Screen readers always get the final value; the animated digits are aria-hidden and written
 *  straight to the DOM, so the tween never re-renders React. */
export function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 1.4, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-30px' });
  const reduce = useReducedMotion();
  const shown = useRef(reduce ? value : 0);
  const fmt = (n: number) => `${prefix}${n.toFixed(decimals)}${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      shown.current = value;
      el.textContent = fmt(value);
      return;
    }
    if (!inView) return;
    const c = animate(shown.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = fmt(v);
      },
    });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, duration, reduce, decimals, prefix, suffix]);

  return (
    <span className={className}>
      <span className="sr-only">{fmt(value)}</span>
      <span ref={ref} aria-hidden="true">
        {fmt(reduce ? value : shown.current)}
      </span>
    </span>
  );
}
