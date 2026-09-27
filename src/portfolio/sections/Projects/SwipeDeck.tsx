import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion, useInView, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'framer-motion';
import type { Project } from '@/data/profile';
import { ProjectCard } from './ProjectCard';
import { PuppyTrack } from './Puppy';
import { clamp } from './hooks';
import s from './SwipeDeck.module.css';

interface Props {
  projects: Project[];
  onOpen: (id: string) => void;
}

/** Mobile: horizontal scroll-snap deck with a coverflow tilt, dots and the puppy progress bar. */
export function SwipeDeck({ projects, onOpen }: Props) {
  const n = projects.length;
  const scroller = useRef<HTMLDivElement>(null);
  const { scrollX } = useScroll({ container: scroller });
  const stride = useMotionValue(300);
  const maxScroll = useMotionValue(1);
  const pos = useTransform([scrollX, stride] as MotionValue<number>[], ([x, st]: number[]) => x / Math.max(1, st));
  const progress = useTransform([scrollX, maxScroll] as MotionValue<number>[], ([x, m]: number[]) => (m > 1 ? clamp(x / m, 0, 1) : 0));
  const [active, setActive] = useState(0);
  const inView = useInView(scroller, { once: true, amount: 0.25 });

  useMotionValueEvent(pos, 'change', (v) => {
    const a = clamp(Math.round(v), 0, Math.max(0, n - 1));
    setActive((prev) => (prev === a ? prev : a));
  });

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const items = el.querySelectorAll<HTMLElement>('[data-deck-item]');
      if (items.length > 1) stride.set(items[1].offsetLeft - items[0].offsetLeft);
      else if (items[0]) stride.set(items[0].offsetWidth);
      maxScroll.set(el.scrollWidth - el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n, stride, maxScroll]);

  // new filter → back to the first card
  const ids = projects.map((p) => p.id).join('|');
  useEffect(() => {
    scroller.current?.scrollTo({ left: 0, behavior: 'instant' });
    setActive(0);
  }, [ids]);

  const scrollToCard = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * stride.get(), behavior: 'smooth' });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollToCard(clamp(active + (e.key === 'ArrowRight' ? 1 : -1), 0, n - 1));
    }
  };

  return (
    <div className={s.deck}>
      <div
        ref={scroller}
        className={s.scroller}
        role="region"
        aria-roledescription="carousel"
        aria-label="Projects — swipe or use arrow keys"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {projects.map((p, i) => (
          <DeckItem
            key={`${ids}:${p.id}`}
            index={i}
            project={p}
            pos={pos}
            active={active}
            shown={inView}
            onActivate={() => (i === active ? onOpen(p.id) : scrollToCard(i))}
          />
        ))}
      </div>

      <div className={`container ${s.controls}`}>
        <div className={s.row}>
          <span className={s.counter} aria-hidden="true">
            <b>{String(active + 1).padStart(2, '0')}</b> / {String(n).padStart(2, '0')}
          </span>
          <div className={s.dots} role="group" aria-label="Choose project">
            {projects.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={[s.dot, i === active && s.dotOn].filter(Boolean).join(' ')}
                aria-label={`Show ${p.title}`}
                aria-current={i === active ? 'true' : undefined}
                onClick={() => scrollToCard(i)}
              >
                <span />
              </button>
            ))}
          </div>
        </div>
        <PuppyTrack progress={progress} stops={n} />
        <p className={s.hint} aria-hidden="true">
          swipe to flip through · tap a card for details
        </p>
      </div>
      <p className="sr-only" aria-live="polite">
        {projects[active] ? `Project ${active + 1} of ${n}: ${projects[active].title}` : ''}
      </p>
    </div>
  );
}

interface ItemProps {
  project: Project;
  index: number;
  pos: MotionValue<number>;
  /** Snapped index of the centred card: stacking order + layer hints change only when it does. */
  active: number;
  shown: boolean;
  onActivate: () => void;
}

function DeckItem({ project, index, pos, active, shown, onActivate }: ItemProps) {
  const d = useTransform(pos, (p) => index - p);
  const transform = useTransform(d, (v) => {
    const k = clamp(v, -1.5, 1.5);
    const rot = clamp(k * 26, -34, 34);
    const sc = 1 - Math.min(1, Math.abs(k)) * 0.09;
    // pull neighbours in toward the centre so they peek in from the screen edges
    return `perspective(900px) translateX(${(-k * 44).toFixed(2)}px) rotateY(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)}) rotateZ(${(k * 1.4).toFixed(2)}deg)`;
  });
  const shade = useTransform(d, (v) => Math.min(0.5, Math.abs(v) * 0.42));
  // z-index is set discretely (not per scroll frame): re-stacking forces a repaint of every card
  const dist = Math.abs(index - active);
  return (
    <motion.div
      className={[s.item, dist <= 1 ? s.near : s.far].join(' ')}
      style={{ zIndex: 10 - Math.min(9, dist) }}
      data-deck-item
      initial={{ opacity: 0, y: 40 }}
      animate={shown ? { opacity: 1, y: 0 } : undefined}
      transition={{ type: 'spring', stiffness: 160, damping: 20, delay: Math.min(index, 3) * 0.08 }}
    >
      <motion.div className={s.card} style={{ transform }}>
        <ProjectCard project={project} onActivate={onActivate} fixed />
        <motion.div className={s.shade} style={{ opacity: shade }} aria-hidden="true" />
      </motion.div>
    </motion.div>
  );
}
