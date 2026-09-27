import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { profile } from '@/data/profile';
import { SECTIONS } from '@/portfolio/sections';
import { Button, SocialLinks } from '@/ui';
import { Cat } from './Cat';
import styles from './Nav.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  active: string | null;
  onNavigate: (id: string) => void;
  onConnect: () => void;
  onSearch: () => void;
}

const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 26, rotate: -3 },
  show: { opacity: 1, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 380, damping: 26 } },
};

/** Full-screen chalkboard sheet that pulls down like a blind (mobile only). */
export function MobileMenu({ open, onClose, active, onNavigate, onConnect, onSearch }: Props) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const items = SECTIONS.filter((s) => s.inNav);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // the page behind the sheet is unreachable (this also tells the ⌘K palette a dialog is up)
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    const t = window.setTimeout(() => closeRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (root) root.inert = wasInert;
      window.clearTimeout(t);
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet"
          id="mobile-menu"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className={styles.sheet}
          initial={reduce ? { opacity: 0 } : { y: '-100%' }}
          animate={reduce ? { opacity: 1 } : { y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: '-100%' }}
          transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 32 }}
        >
          <div className={styles.sheetTop}>
            <span className={styles.sheetBrand}>
              <span className={styles.brandMark}>{profile.initials}</span>
              <span className={styles.sheetName}>{profile.name}</span>
            </span>
            <button ref={closeRef} className={styles.sheetClose} onClick={onClose} aria-label="Close menu">
              <X size={22} />
            </button>
          </div>

          <nav aria-label="Mobile" className={styles.sheetNav}>
            <motion.ul className={styles.sheetList} variants={list} initial={reduce ? false : 'hidden'} animate="show">
              {items.map((s, i) => (
                <motion.li key={s.id} variants={reduce ? undefined : item}>
                  <a
                    href={`#${s.id}`}
                    className={styles.sheetLink}
                    aria-current={active === s.id ? 'true' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(s.id);
                    }}
                  >
                    <span className={styles.sheetIdx}>0{i + 1}</span>
                    <span className={styles.sheetLabel}>
                      {s.label.toLowerCase()}
                      {active === s.id && (
                        <svg className={styles.sheetUnderline} viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
                          <path d="M2 6 C 22 2.5, 44 8.5, 64 5 S 90 4, 98 6.5" />
                        </svg>
                      )}
                    </span>
                  </a>
                </motion.li>
              ))}
            </motion.ul>
          </nav>

          <motion.div
            className={styles.sheetActions}
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.45, type: 'spring', stiffness: 300, damping: 28 }}
          >
            <div className={styles.sheetButtons}>
              <Button variant="marker" size="lg" onClick={onConnect}>
                connect
              </Button>
              <Button variant="chalk" size="lg" icon={<Search />} onClick={onSearch}>
                search
              </Button>
            </div>
            <div className={styles.sheetSocials}>
              <span className={styles.sheetSocialsLabel} aria-hidden="true">
                or say hi
              </span>
              <SocialLinks size="md" />
            </div>
          </motion.div>

          <div className={styles.sheetFoot}>
            <Cat className={styles.sheetCat} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
