import { useEffect, useRef, type ReactNode } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Accessible label when no visible title is given. */
  label?: string;
  children: ReactNode;
  width?: number | string;
  /** 'paper' = cream card (default), 'board' = dark chalkboard panel. */
  tone?: 'paper' | 'board';
  className?: string;
  /** Element to focus when the modal opens (defaults to the panel itself). */
  initialFocus?: React.RefObject<HTMLElement | null>;
}

/** Accessible modal: portal, focus trap-lite, Esc to close, scroll lock, paper "drop-in" animation. */
export function Modal({ open, onClose, title, label, children, width = 560, tone = 'paper', className, initialFocus }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // keep the latest onClose without re-running the open/close effect (inline callbacks are fine)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const f = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (!f.length) {
          e.preventDefault();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        const outside = !panelRef.current.contains(active);
        if (e.shiftKey && (active === first || active === panelRef.current || outside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || outside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    // everything behind the dialog becomes unreachable for Tab and screen readers
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => (initialFocus?.current ?? panelRef.current)?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (root) root.inert = wasInert;
      window.clearTimeout(t);
      prevFocus?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : label}
            tabIndex={-1}
            className={[styles.panel, styles[tone], className].filter(Boolean).join(' ')}
            style={{ maxWidth: width }}
            initial={{ y: 40, rotate: -2, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, rotate: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, rotate: 1.5, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <button className={styles.close} onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
            {title && <div className={styles.title}>{title}</div>}
            <div className={styles.body}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
