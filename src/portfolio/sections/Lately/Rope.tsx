import { forwardRef, useImperativeHandle, useRef } from 'react';
import { motion } from 'framer-motion';
import type { RopeState } from './geometry';
import styles from './Lately.module.css';

export interface RopeHandle {
  /** Redraw the twine along `d` and move the planes to the anchors. */
  draw: (d: string, s: RopeState, t: number) => void;
}

interface Props {
  width: number;
  height: number;
  /** Animate in (rope unrolls from the middle, planes are drawn on). */
  reveal: boolean;
  entered: boolean;
  /** Plane size (smaller on phones so they fit beside the first card). */
  planeScale?: number;
}

/**
 * A chalk paper plane holding the end of the line. Local coords: the knot is at (0,0),
 * the nose points up-left (the right plane is mirrored).
 */
function Plane({ reveal, entered, delay }: { reveal: boolean; entered: boolean; delay: number }) {
  const draw = (extra = 0) =>
    reveal
      ? {
          initial: { pathLength: 0, opacity: 0 },
          animate: entered ? { pathLength: 1, opacity: 1 } : undefined,
          transition: { pathLength: { duration: 0.9, delay: delay + extra, ease: [0.22, 1, 0.36, 1] as const }, opacity: { duration: 0.2, delay: delay + extra } },
        }
      : {};
  return (
    <g className={styles.plane}>
      {/* loop-de-loop trail */}
      <motion.path
        className={styles.planeTrail}
        d="M-1 -27 C 10 -35, 22 -46, 16 -55 C 10 -63, -2 -55, 7 -48 C 16 -41, 32 -46, 44 -56"
        {...draw(0.35)}
      />
      {/* wings */}
      <motion.path className={styles.planeTop} d="M-50 -33 L-1.5 -23.5 L-17 -14.5 Z" {...draw()} />
      <motion.path className={styles.planeBottom} d="M-50 -33 L-17 -14.5 L-9.5 -4.5 Z" {...draw(0.1)} />
      <motion.path className={styles.planeFold} d="M-17 -14.5 L-14.4 -7.2" {...draw(0.2)} />
      {/* string to the knot */}
      <path className={styles.planeString} d="M-10.5 -5.5 Q-5 -2.4 0 0" />
      <circle className={styles.knot} r="2.6" />
    </g>
  );
}

export const Rope = forwardRef<RopeHandle, Props>(function Rope({ width, height, reveal, entered, planeScale = 1 }, ref) {
  const shadow = useRef<SVGPathElement>(null);
  const base = useRef<SVGPathElement>(null);
  const twist = useRef<SVGPathElement>(null);
  const hi = useRef<SVGPathElement>(null);
  const left = useRef<SVGGElement>(null);
  const right = useRef<SVGGElement>(null);
  const scaleRef = useRef(planeScale);
  scaleRef.current = planeScale;

  useImperativeHandle(
    ref,
    () => ({
      draw(d, s, t) {
        for (const p of [shadow, base, twist, hi]) p.current?.setAttribute('d', d);
        const k = scaleRef.current;
        const rl = Math.sin(t * 1.05 + 0.6) * 3.2;
        const rr = Math.sin(t * 0.83 + 2.5) * 3.2;
        left.current?.setAttribute('transform', `translate(${s.aL.toFixed(1)} ${s.yL.toFixed(2)}) rotate(${rl.toFixed(2)}) scale(${k})`);
        right.current?.setAttribute(
          'transform',
          `translate(${s.aR.toFixed(1)} ${s.yR.toFixed(2)}) rotate(${(-rr).toFixed(2)}) scale(${-k} ${k})`,
        );
      },
    }),
    [],
  );

  return (
    <>
      <motion.div
        className={styles.ropeWrap}
        style={{ width, height }}
        initial={reveal ? { clipPath: 'inset(0% 50% 0% 50%)' } : false}
        animate={entered ? { clipPath: 'inset(0% 0% 0% 0%)' } : undefined}
        transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
        aria-hidden="true"
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <path ref={shadow} className={styles.ropeShadow} />
          <path ref={base} className={styles.ropeBase} />
          <path ref={twist} className={styles.ropeTwist} />
          <path ref={hi} className={styles.ropeHi} />
        </svg>
      </motion.div>
      <svg className={styles.planes} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <g ref={left}>
          <Plane reveal={reveal} entered={entered} delay={0.7} />
        </g>
        <g ref={right}>
          <Plane reveal={reveal} entered={entered} delay={0.85} />
        </g>
      </svg>
    </>
  );
});
