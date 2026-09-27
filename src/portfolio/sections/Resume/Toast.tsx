import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check } from 'lucide-react';
import styles from './Toast.module.css';

type Tone = 'ok' | 'error';
interface ToastMsg {
  id: number;
  text: string;
  tone: Tone;
}

/** Minimal toast: `const [toastNode, toast] = useToast(); toast('Copied!')`. */
export function useToast() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, tone: Tone = 'ok') => {
    window.clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, tone });
    timer.current = window.setTimeout(() => setMsg(null), tone === 'error' ? 4200 : 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [<ToastView key="toast" msg={msg} />, show] as const;
}

function ToastView({ msg }: { msg: ToastMsg | null }) {
  const reduce = useReducedMotion();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={styles.region} role="status" aria-live="polite">
      <AnimatePresence>
        {msg && (
          <motion.div
            key={msg.id}
            className={[styles.toast, msg.tone === 'error' && styles.error].filter(Boolean).join(' ')}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, rotate: -3, scale: 0.9 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, rotate: -1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            {msg.tone === 'error' ? <AlertTriangle size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
            <span>{msg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
