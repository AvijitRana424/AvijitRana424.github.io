import { memo, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  motion,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
  type PanInfo,
} from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import type { LatelyItem } from '@/data/profile';
import { asset } from '@/config';
import { Art } from './Art';
import { Clothespin } from './Clothespin';
import { TAG_ICONS } from './icons';
import { clamp, PAPER_OFFSET, seeded } from './geometry';
import styles from './Card.module.css';

export interface CardMotion {
  swing: MotionValue<number>;
  dx: MotionValue<number>;
  dy: MotionValue<number>;
}

interface Props {
  item: LatelyItem;
  index: number;
  height: number;
  mv: CardMotion;
  /** Hover swing, idle art, entrance (false for reduced motion). */
  interactive: boolean;
  /** Mouse/pen drag (false on touch so the track can be swiped, and for reduced motion). */
  draggable: boolean;
  /** Section scrolled into view → drop in and get pinned. */
  entered: boolean;
  onKick: (index: number, velocity: number, spread?: boolean) => void;
  onGrab: (index: number) => void;
  onRelease: (index: number, info: PanInfo) => void;
  onActive: (index: number, on: boolean) => void;
  onOpen: (index: number) => void;
}

const DROP_DELAY = 0.35;
const DROP_STAGGER = 0.14;

export const LatelyCard = memo(function LatelyCard({
  item,
  index,
  height,
  mv,
  interactive,
  draggable,
  entered,
  onKick,
  onGrab,
  onRelease,
  onActive,
  onOpen,
}: Props) {
  const Icon = TAG_ICONS[item.tagIcon];
  const [pinned, setPinned] = useState(!interactive);
  const [dragging, setDragging] = useState(false);
  const draggedRef = useRef(false);
  const lastMoveKick = useRef(0);

  // Swinging while dragged: the card lags behind the pointer like a real hanging sheet.
  const vx = useVelocity(mv.dx);
  const dragTilt = useSpring(
    useTransform(vx, (v) => clamp(v * 0.011, -16, 16)),
    { stiffness: 150, damping: 12, mass: 0.8 },
  );
  const rotate = useTransform([mv.swing, dragTilt] as MotionValue<number>[], ([s, t]: number[]) => s + t);
  // …and twists a little in 3D with the speed of the swing.
  const rotVel = useVelocity(rotate);
  const rotateY = useSpring(
    useTransform(rotVel, (v) => clamp(-v * 0.14, -22, 22)),
    { stiffness: 110, damping: 16 },
  );
  const sheen = useTransform(rotateY, (v) => clamp(Math.abs(v) / 26, 0, 0.9));

  const delay = DROP_DELAY + index * DROP_STAGGER;
  const dropRot = seeded(item.id, 7) * 9;

  // Pin snaps shut the moment the card lands, with a little jolt.
  useEffect(() => {
    if (!interactive) {
      setPinned(true);
      return;
    }
    if (!entered) return;
    const t = window.setTimeout(() => {
      setPinned(true);
      onKick(index, dropRot > 0 ? -26 : 26, false);
    }, (delay + 0.3) * 1000);
    return () => window.clearTimeout(t);
  }, [entered, interactive, delay, index, onKick, dropRot]);

  const onEnter = (e: RPointerEvent) => {
    if (!interactive || e.pointerType !== 'mouse') return;
    onActive(index, true);
    const r = e.currentTarget.getBoundingClientRect();
    const dir = e.movementX ? Math.sign(e.movementX) : e.clientX < r.left + r.width / 2 ? 1 : -1;
    // pushing the sheet to the right swings its bottom right → counter-clockwise
    onKick(index, -dir * clamp(30 + Math.abs(e.movementX) * 4, 30, 72));
  };
  const onMove = (e: RPointerEvent) => {
    if (!interactive || e.pointerType !== 'mouse' || dragging) return;
    const now = performance.now();
    if (Math.abs(e.movementX) > 9 && now - lastMoveKick.current > 280) {
      lastMoveKick.current = now;
      onKick(index, -Math.sign(e.movementX) * clamp(Math.abs(e.movementX) * 2.2, 18, 56), false);
    }
  };
  const onLeave = (e: RPointerEvent) => {
    if (e.pointerType === 'mouse') onActive(index, false);
  };
  const onDown = (e: RPointerEvent) => {
    draggedRef.current = false;
    if (interactive && e.pointerType !== 'mouse') onKick(index, index % 2 ? 22 : -22, false);
  };

  return (
    <motion.div
      className={styles.drop}
      initial={interactive ? { y: -240, opacity: 0, rotate: dropRot } : false}
      animate={entered || !interactive ? { y: 0, opacity: 1, rotate: 0 } : undefined}
      transition={{
        y: { type: 'spring', stiffness: 190, damping: 14, mass: 0.9, delay },
        rotate: { type: 'spring', stiffness: 120, damping: 8, delay },
        opacity: { duration: 0.22, delay },
      }}
    >
      <motion.article
        className={[
          styles.card,
          draggable && styles.draggable,
          dragging && styles.dragging,
          dragging && styles.lifted,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ x: mv.dx, y: mv.dy, rotate, rotateY, height }}
        drag={draggable}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.42}
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 240, bounceDamping: 9 }}
        whileHover={interactive ? { scale: 1.025 } : undefined}
        whileDrag={{ scale: 1.045 }}
        onPointerEnter={onEnter}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerDown={onDown}
        onDragStart={() => {
          draggedRef.current = true;
          setDragging(true);
          onGrab(index);
        }}
        onDragEnd={(_, info) => {
          setDragging(false);
          onRelease(index, info);
        }}
      >
        <Clothespin className={styles.pin} open={!pinned} strained={dragging} />
        <div className={styles.paper} style={{ height: height - PAPER_OFFSET }} data-measure="paper">
          <div className={styles.art} style={{ background: item.tint }}>
            {item.image ? <img src={asset(item.image)} alt="" loading="lazy" /> : <Art kind={item.tagIcon} animate={interactive} />}
          </div>
          <div className={styles.body}>
            <p className={styles.tag}>
              <Icon aria-hidden="true" strokeWidth={2.2} />
              {item.tag}
            </p>
            <h3 className={styles.title}>
              <button
                type="button"
                className={styles.hit}
                aria-haspopup="dialog"
                onClick={() => {
                  if (draggedRef.current) {
                    draggedRef.current = false;
                    return;
                  }
                  onOpen(index);
                }}
                onFocus={(e) => {
                  onActive(index, true);
                  if (interactive && e.currentTarget.matches(':focus-visible')) onKick(index, index % 2 ? 26 : -26);
                }}
                onBlur={() => onActive(index, false)}
              >
                {item.title}
              </button>
            </h3>
            <p className={styles.blurb} data-measure="blurb">
              {item.blurb}
            </p>
            <div className={styles.foot} data-measure="foot">
              <span className={styles.date}>
                <span className="sr-only">Date: </span>
                {item.date}
              </span>
              <span className={styles.more} aria-hidden="true">
                read more <ArrowUpRight strokeWidth={2.2} />
              </span>
            </div>
          </div>
          {interactive && <motion.div className={styles.sheen} style={{ opacity: sheen }} aria-hidden="true" />}
        </div>
      </motion.article>
    </motion.div>
  );
});
