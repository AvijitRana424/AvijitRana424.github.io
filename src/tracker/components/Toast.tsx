import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, CircleAlert, Info, X } from 'lucide-react';
import styles from './Toast.module.css';

export type ToastTone = 'ok' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
  /** don't dismiss the toast after the click (e.g. "Copy notes" next to "Retry") */
  keepOpen?: boolean;
}

export interface ToastInput {
  message: ReactNode;
  tone?: ToastTone;
  action?: ToastAction;
  /** extra buttons (e.g. "Retry" + "Copy notes") */
  actions?: ToastAction[];
  /** ms; errors stay a little longer by default. 0 = stays until dismissed. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
  tone: ToastTone;
}

type ToastFn = (t: ToastInput | string) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const ICON = { ok: Check, error: CircleAlert, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());
  const reduce = useReducedMotion();

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const toast = useCallback<ToastFn>(
    (input) => {
      const t: ToastInput = typeof input === 'string' ? { message: input } : input;
      const id = ++seq.current;
      const tone = t.tone ?? 'ok';
      setItems((xs) => [...xs.slice(-3), { ...t, id, tone }]);
      const ms = t.duration ?? (tone === 'error' ? 6500 : t.action || t.actions ? 5500 : 3200);
      if (ms > 0) timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className={styles.region} role="status" aria-live="polite" aria-relevant="additions">
          <AnimatePresence initial={false}>
            {items.map((t) => {
              const Icon = ICON[t.tone];
              const acts = [...(t.action ? [t.action] : []), ...(t.actions ?? [])];
              return (
                <motion.div
                  key={t.id}
                  layout={!reduce}
                  className={[styles.toast, styles[t.tone], acts.length > 1 && styles.multi].filter(Boolean).join(' ')}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, rotate: -3, scale: 0.94 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, rotate: t.id % 2 ? -0.8 : 0.7, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, rotate: 4, transition: { duration: 0.18 } }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                >
                  <span className={styles.icon} aria-hidden="true">
                    <Icon size={15} strokeWidth={2.4} />
                  </span>
                  <span className={styles.msg}>{t.message}</span>
                  {acts.length > 0 && (
                    <span className={styles.actions}>
                      {acts.map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          className={styles.action}
                          onClick={() => {
                            a.onClick();
                            if (!a.keepOpen) dismiss(t.id);
                          }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </span>
                  )}
                  <button type="button" className={styles.close} onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                    <X size={14} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
