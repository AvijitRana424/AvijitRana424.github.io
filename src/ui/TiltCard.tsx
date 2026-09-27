import { useRef, type ReactNode, type CSSProperties } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

interface Props {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Max tilt in degrees. */
  max?: number;
  /** Lift (translateZ, px) while hovered. */
  lift?: number;
  /** Adds a moving glare highlight. */
  glare?: boolean;
  /** Resting rotation (deg), e.g. a slightly crooked card. */
  rest?: number;
}

/** Pointer-driven 3D tilt with spring smoothing. Disabled for reduced-motion users and touch. */
export function TiltCard({ children, className, style, max = 10, lift = 24, glare = true, rest = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hover = useMotionValue(0);
  const cfg = { stiffness: 220, damping: 20, mass: 0.6 };
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), cfg);
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), cfg);
  const z = useSpring(useTransform(hover, [0, 1], [0, lift]), cfg);
  const rz = useSpring(useTransform(hover, [0, 1], [rest, 0]), cfg);
  const glareBg = useTransform(
    [px, py] as never,
    ([x, y]: number[]) => `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,.35), transparent 55%)`,
  );
  const glareOpacity = useSpring(hover, cfg);

  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType === 'touch' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
    hover.set(1);
  };
  const onLeave = () => {
    px.set(0.5);
    py.set(0.5);
    hover.set(0);
  };

  return (
    <div style={{ perspective: 900 }} className={className}>
      <motion.div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{
          ...style,
          rotateX: reduce ? 0 : rx,
          rotateY: reduce ? 0 : ry,
          rotateZ: rz,
          z,
          transformStyle: 'preserve-3d',
          position: 'relative',
          height: '100%',
        }}
      >
        {children}
        {glare && !reduce && (
          <motion.div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              background: glareBg,
              opacity: glareOpacity,
              mixBlendMode: 'soft-light',
            }}
          />
        )}
      </motion.div>
    </div>
  );
}
