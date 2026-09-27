import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import styles from './Drawer.module.css';

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}

/** Right-hand drawer on desktop, draggable bottom sheet on phones. Esc closes; focus is trapped and restored. */
export function Drawer({ open, onClose, label, children }: Props) {
  const sheet = useMediaQuery('(max-width: 640px)');
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const f = [
          ...panelRef.current.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
          ),
        ];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => panelRef.current?.focus(), 40);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, onClose]);

  const hidden = sheet ? { y: '100%' } : { x: '104%' };
  const shown = sheet ? { y: 0 } : { x: 0 };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="drawer"
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className={[styles.panel, sheet && styles.sheet].filter(Boolean).join(' ')}
            initial={reduce ? { opacity: 0 } : hidden}
            animate={reduce ? { opacity: 1 } : shown}
            exit={reduce ? { opacity: 0 } : hidden}
            transition={{ type: 'spring', stiffness: 340, damping: 36 }}
            drag={sheet && !reduce ? 'y' : false}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 700) onClose();
            }}
          >
            {sheet && (
              <div className={styles.grabber} onPointerDown={(e) => drag.start(e)} aria-hidden="true">
                <span />
              </div>
            )}
            <button className={styles.close} onClick={onClose} aria-label="Close details">
              <X size={18} />
            </button>
            <div className={styles.scroll}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
