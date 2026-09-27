import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import type { LatelyItem } from '@/data/profile';
import { asset } from '@/config';
import { Button, LinkButton, Modal } from '@/ui';
import { Art } from './Art';
import { Clothespin } from './Clothespin';
import { TAG_ICONS } from './icons';
import styles from './LatelyModal.module.css';

interface Props {
  items: LatelyItem[];
  index: number | null;
  /** Direction of the last prev/next step, for the slide animation. */
  dir: number;
  onClose: () => void;
  onStep: (delta: number) => void;
}

export function LatelyModal({ items, index, dir, onClose, onStep }: Props) {
  const reduce = useReducedMotion();
  const open = index !== null;
  // keep the last item around so the exit animation still has content
  const last = useRef<number>(0);
  if (index !== null) last.current = index;
  const i = index ?? last.current;
  const item = items[i];

  useEffect(() => {
    if (!open || items.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowRight') onStep(1);
      if (e.key === 'ArrowLeft') onStep(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, items.length, onStep]);

  if (!item) return null;
  const Icon = TAG_ICONS[item.tagIcon];
  const shift = reduce ? 0 : 18;

  return (
    <Modal open={open} onClose={onClose} label={item.title} width={640} className={styles.panel}>
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.article
          key={item.id}
          className={styles.sheet}
          initial={{ opacity: 0, x: shift * dir }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -shift * dir }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.art} style={{ background: item.tint }}>
            <Clothespin className={styles.pin} />
            {item.image ? <img src={asset(item.image)} alt="" /> : <Art kind={item.tagIcon} animate={!reduce} />}
          </div>
          <div className={styles.meta}>
            <span className={styles.tag}>
              <Icon aria-hidden="true" strokeWidth={2.2} />
              {item.tag}
            </span>
            <span className={styles.date}>{item.date}</span>
          </div>
          <h2 className={styles.title}>{item.title}</h2>
          <p className={styles.blurb}>{item.blurb}</p>
          <p className={styles.detail}>{item.detail}</p>
          {!!item.links?.length && (
            <div className={styles.links}>
              {item.links.map((l) => (
                <LinkButton
                  key={l.href}
                  variant="ink"
                  size="sm"
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  iconRight={<ExternalLink aria-hidden="true" />}
                >
                  {l.label}
                </LinkButton>
              ))}
            </div>
          )}
        </motion.article>
      </AnimatePresence>
      {items.length > 1 && (
        <nav className={styles.nav} aria-label="Browse highlights">
          <Button variant="ghost" size="sm" className={styles.navBtn} icon={<ArrowLeft aria-hidden="true" />} onClick={() => onStep(-1)}>
            previous
          </Button>
          <span className={styles.count} aria-live="polite">
            {i + 1} <span aria-hidden="true">/</span>
            <span className="sr-only"> of </span> {items.length}
          </span>
          <Button variant="ghost" size="sm" className={styles.navBtn} iconRight={<ArrowRight aria-hidden="true" />} onClick={() => onStep(1)}>
            next
          </Button>
        </nav>
      )}
    </Modal>
  );
}
