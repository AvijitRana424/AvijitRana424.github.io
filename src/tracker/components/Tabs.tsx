import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './Tabs.module.css';

export interface TabDef<K extends string> {
  key: K;
  label: string;
  icon: ReactNode;
  count?: number;
}

/** Tab key kept in the URL hash (#jobs, #companies…) so reloads and links land on the same tab. */
export function useHashTab<K extends string>(keys: readonly K[], fallback: K) {
  const read = useCallback((): K => {
    const h = window.location.hash.replace(/^#/, '').split(/[/?]/)[0] as K;
    return keys.includes(h) ? h : fallback;
  }, [keys, fallback]);
  const [tab, setTabState] = useState<K>(read);
  useEffect(() => {
    const on = () => setTabState(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [read]);
  const setTab = useCallback((k: K) => {
    setTabState(k);
    if (window.location.hash !== `#${k}`) history.replaceState(null, '', `#${k}`);
  }, []);
  return [tab, setTab] as const;
}

export function Tabs<K extends string>({ tabs, value, onChange, idPrefix }: { tabs: TabDef<K>[]; value: K; onChange: (k: K) => void; idPrefix: string }) {
  const reduce = useReducedMotion();
  const refs = useRef(new Map<K, HTMLButtonElement>());

  const onKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const k = tabs[next].key;
    onChange(k);
    refs.current.get(k)?.focus();
  };

  return (
    <div className={styles.tablist} role="tablist" aria-label="Tracker sections">
      {tabs.map((t, i) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => {
              if (el) refs.current.set(t.key, el);
            }}
            role="tab"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${t.key}`}
            tabIndex={on ? 0 : -1}
            className={[styles.tab, on && styles.on].filter(Boolean).join(' ')}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className={styles.icon} aria-hidden="true">
              {t.icon}
            </span>
            <span className={styles.label}>{t.label}</span>
            {t.count !== undefined && <span className={styles.count}>{t.count}</span>}
            {on && (
              <motion.svg
                layoutId={`${idPrefix}-underline`}
                className={styles.underline}
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                aria-hidden="true"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 480, damping: 38 }}
              >
                <path d="M2 6 C 20 2.5, 45 8.5, 65 4.5 S 92 4, 98 5.5" fill="none" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </motion.svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
