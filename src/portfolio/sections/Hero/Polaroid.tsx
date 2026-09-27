import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { Briefcase, Clock, MapPin, RotateCcw } from 'lucide-react';
import { Pin } from '@/ui';
import { asset } from '@/config';
import { profile } from '@/data/profile';
import { CurlyArrow, PortraitDoodle } from './Doodles';
import { city, currentRole, quickFacts } from './facts';
import { T } from './motion';
import styles from './Polaroid.module.css';

function useFinePointer() {
  const query = '(hover: hover) and (pointer: fine)';
  const [fine, setFine] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setFine(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return fine;
}

const istFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });

/** Current time in IST, refreshed while `active`. */
function useIstTime(active: boolean) {
  const [t, setT] = useState(() => istFormat.format(new Date()));
  useEffect(() => {
    if (!active) return;
    setT(istFormat.format(new Date()));
    const id = window.setInterval(() => setT(istFormat.format(new Date())), 20_000);
    return () => window.clearInterval(id);
  }, [active]);
  return t;
}

type PhotoState = 'loading' | 'ok' | 'missing';

/**
 * Pinned polaroid: drops in on a spring, tilts toward the pointer, can be tugged off its pin
 * (elastic snap-back) and flips over on click / Enter / Space to reveal a handwritten note.
 */
export function Polaroid() {
  const reduce = !!useReducedMotion();
  const fine = useFinePointer();
  const [flipped, setFlipped] = useState(false);
  // the "click to flip" hint has done its job after the first flip
  const [hasFlipped, setHasFlipped] = useState(false);
  const [photo, setPhoto] = useState<PhotoState>('loading');
  const dragged = useRef(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const time = useIstTime(flipped);
  const facts = useMemo(quickFacts, []);
  const role = currentRole();

  // pointer tilt
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const hover = useMotionValue(0);
  const cfg = { stiffness: 170, damping: 17, mass: 0.6 };
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [13, -13]), cfg);
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-16, 16]), cfg);
  const shadowX = useTransform(ry, [-16, 16], [16, -16]);
  const shadowY = useTransform(rx, [-13, 13], [18, 4]);
  const gx = useTransform(px, [-0.5, 0.5], [0, 100]);
  const gy = useTransform(py, [-0.5, 0.5], [0, 100]);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.6), transparent 58%)`;
  const glareOpacity = useSpring(hover, cfg);

  const onMove = (e: PointerEvent) => {
    if (reduce || e.pointerType !== 'mouse' || !sceneRef.current) return;
    const r = sceneRef.current.getBoundingClientRect();
    px.set(Math.min(0.5, Math.max(-0.5, (e.clientX - r.left) / r.width - 0.5)));
    py.set(Math.min(0.5, Math.max(-0.5, (e.clientY - r.top) / r.height - 0.5)));
    hover.set(1);
  };
  const onLeave = () => {
    px.set(0);
    py.set(0);
    hover.set(0);
  };

  const toggle = () => {
    if (dragged.current) return; // a tug, not a click
    setFlipped((f) => !f);
    setHasFlipped(true);
  };

  const canDrag = fine && !reduce;

  return (
    <div className={styles.wrap}>
      <motion.div
        className={styles.drop}
        style={{ originX: 0.5, originY: 0.03 }}
        initial={reduce ? false : { y: -140, rotate: -22, opacity: 0 }}
        animate={{ y: 0, rotate: -6, opacity: 1 }}
        transition={{
          type: 'spring',
          stiffness: 120,
          damping: 11,
          mass: 0.8,
          delay: T.polaroid,
          opacity: { duration: 0.2, delay: T.polaroid },
        }}
      >
        <motion.div
          className={styles.drag}
          drag={canDrag}
          dragSnapToOrigin
          dragElastic={0.5}
          dragTransition={{ bounceStiffness: 260, bounceDamping: 13 }}
          whileDrag={{ scale: 1.05, rotate: 6 }}
          onDragStart={() => {
            dragged.current = true;
          }}
          onDragEnd={() => {
            window.setTimeout(() => {
              dragged.current = false;
            }, 80);
          }}
        >
          <div ref={sceneRef} className={styles.scene} onPointerMove={onMove} onPointerLeave={onLeave}>
            <motion.span aria-hidden="true" className={styles.shadow} style={reduce ? undefined : { x: shadowX, y: shadowY }} />
            <motion.div className={styles.tilt} style={reduce ? undefined : { rotateX: rx, rotateY: ry }}>
              <motion.div
                className={styles.flipper}
                initial={false}
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 110, damping: 14, mass: 0.9 }}
              >
                {/* front: photo (or doodle placeholder) */}
                <div className={styles.front} aria-hidden={flipped || undefined}>
                  <span className={styles.photo}>
                    <PortraitDoodle className={styles.doodle} delay={T.portrait} />
                    {photo !== 'missing' && (
                      <img
                        className={[styles.img, photo === 'ok' && styles.imgOn].filter(Boolean).join(' ')}
                        src={asset(profile.avatar)}
                        alt={`Photo of ${profile.name}`}
                        width={240}
                        height={240}
                        decoding="async"
                        draggable={false}
                        onLoad={() => setPhoto('ok')}
                        onError={() => setPhoto('missing')}
                      />
                    )}
                    {photo === 'missing' && <span className="sr-only">Doodle portrait of {profile.name}</span>}
                  </span>
                  <span className={`hand ${styles.caption}`}>
                    hi, I&apos;m {profile.firstName} <span aria-hidden="true">☺</span>
                  </span>
                  {!reduce && <motion.span aria-hidden="true" className={styles.glare} style={{ background: glare, opacity: glareOpacity }} />}
                </div>

                {/* back: handwritten note */}
                <div className={styles.back} aria-hidden={!flipped || undefined}>
                  <p className={`hand ${styles.backTitle}`}>quick facts</p>
                  <ul className={styles.rows}>
                    <li>
                      <Briefcase aria-hidden="true" />
                      <span>
                        {role.title}
                        {role.company && (
                          <>
                            {' '}
                            @ <b>{role.company}</b>
                          </>
                        )}
                      </span>
                    </li>
                    <li>
                      <MapPin aria-hidden="true" />
                      <span>{profile.location} · IST</span>
                    </li>
                    <li>
                      <Clock aria-hidden="true" />
                      <span>
                        it&apos;s <span className={styles.time}>{time}</span> in {city}
                      </span>
                    </li>
                  </ul>
                  {facts.length > 0 && (
                    <ul className={styles.stats}>
                      {facts.map((f) => (
                        <li key={f.label}>
                          <b className="hand">{f.value}</b>
                          <small>{f.label}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className={styles.flipBack} aria-hidden="true">
                    <RotateCcw /> flip back
                  </p>
                </div>
              </motion.div>
            </motion.div>

            <button
              type="button"
              className={styles.hit}
              aria-pressed={flipped}
              aria-label={`Flip the polaroid over to read quick facts about ${profile.firstName}`}
              onClick={toggle}
            />
          </div>
          <Pin className={styles.pin} />
        </motion.div>
      </motion.div>

      <motion.p
        className={styles.hint}
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: hasFlipped ? 0 : 1 }}
        transition={{ duration: 0.4, delay: hasFlipped ? 0.5 : T.decor }}
      >
        <CurlyArrow className={styles.hintArrow} delay={T.decor} />
        <span className={styles.hintMouse}>click to flip</span>
        <span className={styles.hintTouch}>tap to flip</span>
      </motion.p>
    </div>
  );
}
