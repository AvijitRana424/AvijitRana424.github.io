import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { JobStatus } from '@/lib/types';
import { JOB_STATUSES } from '@/lib/types';
import { STATUS_META } from '../lib/format';
import styles from './Menu.module.css';

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  swatch?: string;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface Props {
  items: MenuItem[];
  /** accessible name of the trigger */
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  heading?: string;
  width?: number;
}

/** Button + popover menu rendered in a portal (never clipped by scrolling columns). Full keyboard support. */
export function Menu({ items, label, trigger, triggerClassName, heading, width = 210 }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  /** Anchor the popover to the trigger. */
  const place = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const h = menuRef.current?.offsetHeight ?? 280;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(8, r.right - width), vw - width - 8);
    const below = r.bottom + 6 + h < vh - 8;
    setPos({ left, top: below ? r.bottom + 6 : r.top - 6 - h, width, transformOrigin: below ? 'top right' : 'bottom right' });
  }, [width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const first =
      menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])');
    first?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close(false);
    };
    // follow the trigger while the page / board scrolls (incl. smooth scroll after focusing it)
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      place();
    };
    const onResize = () => place();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close, place]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => els[n]?.focus({ preventScroll: true });
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      go((i + 1) % els.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      go((i - 1 + els.length) % els.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(els.length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              role="menu"
              aria-label={heading ?? label}
              className={styles.menu}
              style={pos}
              onKeyDown={onMenuKey}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            >
              {heading && <div className={styles.heading}>{heading}</div>}
              {items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  role={it.checked !== undefined ? 'menuitemradio' : 'menuitem'}
                  aria-checked={it.checked}
                  disabled={it.disabled}
                  className={[styles.item, it.danger && styles.danger, it.checked && styles.checked].filter(Boolean).join(' ')}
                  onClick={() => {
                    close();
                    it.onSelect();
                  }}
                >
                  {it.swatch ? (
                    <span className={styles.swatch} style={{ background: it.swatch }} aria-hidden="true" />
                  ) : (
                    it.icon && <span className={styles.icon}>{it.icon}</span>
                  )}
                  <span className={styles.label}>{it.label}</span>
                  {it.checked && <Check size={15} className={styles.tick} aria-hidden="true" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/** Menu listing every job status; the current one is checked. */
export function StatusMenu({
  current,
  onSelect,
  trigger,
  triggerClassName,
  label = 'Change status',
  exclude = [],
}: {
  current?: JobStatus;
  onSelect: (s: JobStatus) => void;
  trigger: ReactNode;
  triggerClassName?: string;
  label?: string;
  exclude?: JobStatus[];
}) {
  return (
    <Menu
      label={label}
      heading="Move to…"
      trigger={trigger}
      triggerClassName={triggerClassName}
      items={JOB_STATUSES.filter((s) => !exclude.includes(s)).map((s) => ({
        key: s,
        label: STATUS_META[s].label,
        swatch: STATUS_META[s].color,
        checked: current ? s === current : undefined,
        onSelect: () => onSelect(s),
      }))}
    />
  );
}
