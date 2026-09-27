import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Briefcase, FolderGit2, X } from 'lucide-react';
import { Paper } from '@/ui';
import { scrollToSection } from '@/portfolio/sections';
import { GROUP_ICONS, groups, type SkillItem } from './skillData';
import { findUsage } from './usage';
import styles from './Skills.module.css';

export interface Anchor {
  /** Horizontal center of the trigger, relative to the layout box. */
  x: number;
  /** Trigger top / bottom relative to the layout box. */
  top: number;
  bottom: number;
  /** Trigger top / bottom in viewport coordinates (used to flip above when there's no room below). */
  vTop: number;
  vBottom: number;
}

interface Props {
  item: SkillItem;
  anchor: Anchor;
  layoutWidth: number;
  color: string;
  /** Move focus into the note (when opened from a chip; sphere items aren't keyboard targets). */
  autoFocus: boolean;
  onClose: (opts?: { restoreFocus?: boolean }) => void;
}

const GAP = 14;

/** Small pinned paper note: "where I used it" for one skill. */
export function SkillPopover({ item, anchor, layoutWidth, color, autoFocus, onClose }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ above: boolean; h: number } | null>(null);
  const group = groups[item.group];
  const Icon = GROUP_ICONS[group.icon];
  const usage = findUsage(item.name);
  const has = usage.roles.length > 0 || usage.projects.length > 0;
  const titleId = `skill-pop-${item.id.replace(/[^a-z0-9]/gi, '-')}`;

  const width = Math.max(220, Math.min(320, layoutWidth - 16));
  const left = Math.max(8, Math.min(anchor.x - width / 2, layoutWidth - width - 8));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 88;
    const roomBelow = window.innerHeight - anchor.vBottom - GAP;
    const roomAbove = anchor.vTop - GAP - navH;
    setPos({ above: roomBelow < h + 12 && roomAbove > roomBelow, h });
  }, [anchor, item.id]);

  // focus once it's positioned (it's visibility:hidden until measured, and hidden elements can't take focus)
  const placed = pos != null;
  useEffect(() => {
    if (placed && autoFocus) ref.current?.focus({ preventScroll: true });
  }, [placed, autoFocus, item.id]);

  const top = pos?.above ? anchor.top - GAP - pos.h : anchor.bottom + GAP;

  const go = (id: string) => {
    onClose();
    scrollToSection(id);
  };

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={styles.pop}
      style={{ left, top, width, visibility: pos ? 'visible' : 'hidden', ['--c' as string]: color }}
      initial={reduce ? false : { opacity: 0, y: pos?.above ? 8 : -8, scale: 0.94, rotate: -4 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose({ restoreFocus: true });
          return;
        }
        if (e.key === 'Tab' && ref.current) {
          // behave like an inline disclosure: tabbing past either end hands focus back to the chip
          const f = ref.current.querySelectorAll<HTMLElement>('button');
          const first = f[0];
          const last = f[f.length - 1];
          const a = document.activeElement;
          if ((!e.shiftKey && a === last) || (e.shiftKey && (a === first || a === ref.current))) {
            e.preventDefault();
            onClose({ restoreFocus: true });
          }
        }
      }}
    >
      <Paper pin tilt={-1.2} className={styles.popPaper}>
        <button type="button" className={styles.popClose} aria-label="Close" onClick={() => onClose({ restoreFocus: true })}>
          <X aria-hidden="true" />
        </button>
        <p className={styles.popKicker}>
          <Icon aria-hidden="true" /> {group.label}
        </p>
        <h3 id={titleId} className={styles.popTitle}>
          {item.name}
        </h3>

        {has ? (
          <>
            <p className={styles.popLead}>
              Where I used it
              {usage.via && <span className={styles.popVia}> (matches for {usage.via})</span>}
            </p>
            {usage.roles.length > 0 && (
              <>
                <p className={styles.popGroup}>At work</p>
                <ul className={styles.popList}>
                  {usage.roles.map((r) => (
                    <li key={`${r.company}-${r.title}`}>
                      <button type="button" className={styles.popLink} onClick={() => go('experience')}>
                        <Briefcase aria-hidden="true" />
                        <span>
                          {r.title}
                          <small>
                            {r.company} · {r.start} – {r.end}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {usage.projects.length > 0 && (
              <>
                <p className={styles.popGroup}>Projects</p>
                <ul className={styles.popList}>
                  {usage.projects.map((p) => (
                    <li key={p.id}>
                      <button type="button" className={styles.popLink} onClick={() => go('projects')}>
                        <FolderGit2 aria-hidden="true" />
                        <span>{p.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p className={styles.popLead}>
            Part of my <strong>{group.label}</strong> toolbox.
          </p>
        )}
      </Paper>
    </motion.div>
  );
}
