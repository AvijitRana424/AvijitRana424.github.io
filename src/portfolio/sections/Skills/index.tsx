import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { SectionHeading } from '@/ui';
import { TagSphere } from './TagSphere';
import { SkillPopover, type Anchor } from './SkillPopover';
import { GROUP_ICONS, allSkills, groupColor, groups, skillsByImportance, sphereSkills, type SkillItem } from './skillData';
import styles from './Skills.module.css';

interface PopState {
  item: SkillItem;
  anchor: Anchor;
  source: 'chip' | 'sphere';
  trigger: HTMLElement;
  nonce: number;
}

type OpenFn = (item: SkillItem, el: HTMLElement) => void;

/** Phones get one category row + a single chip cloud instead of ten stacked boxes. */
const COMPACT_MQ = '(max-width: 640px)';
/** Chips shown in the phone "All" view before "+N more". */
const ALL_PREVIEW = 12;

const itemsOf = (gi: number) => allSkills.filter((s) => s.group === gi);
/** A chip's twin in the sphere (the AWS services share one "AWS" word there). */
const sphereIdFor = (item: SkillItem) => (/^AWS\s/.test(item.name) ? `${item.group}:AWS` : item.id);

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/**
 * Roving tabindex for a WAI-ARIA toolbar: the whole group is one Tab stop and the arrow keys,
 * Home and End move between its buttons. The last focused button stays the group's Tab stop.
 */
function useRoving(count: number) {
  const [cur, setCur] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const active = Math.min(cur, Math.max(0, count - 1));

  const onKeyDown = (e: KeyboardEvent) => {
    const from = refs.current.indexOf(e.target as HTMLElement);
    if (from < 0 || from >= count) return;
    let to = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (from + 1) % count;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (from - 1 + count) % count;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = count - 1;
    if (to < 0) return;
    e.preventDefault();
    setCur(to);
    refs.current[to]?.focus();
  };

  const itemProps = (i: number) => ({
    ref: (el: HTMLElement | null) => {
      refs.current[i] = el;
    },
    tabIndex: i === active ? 0 : -1,
    onFocus: () => setCur(i),
  });

  return { onKeyDown, itemProps };
}

type RovingProps = ReturnType<ReturnType<typeof useRoving>['itemProps']>;

function Chip({ item, open, onOpen, dot, roving }: { item: SkillItem; open: boolean; onOpen: OpenFn; dot?: boolean; roving: RovingProps }) {
  return (
    <button
      type="button"
      className={styles.chip}
      style={{ '--c': groupColor(item.group) } as CSSProperties}
      data-skill-trigger=""
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(e) => onOpen(item, e.currentTarget)}
      {...roving}
    >
      {dot && <span className={styles.chipDot} aria-hidden="true" />}
      {item.name}
    </button>
  );
}

/** Desktop / tablet: one dashed chalk box per category; the box is a single toolbar Tab stop. */
function SkillBox({
  gi,
  active,
  onToggle,
  openId,
  onOpen,
  describedBy,
  index,
}: {
  gi: number;
  active: boolean;
  onToggle: () => void;
  openId: string | null;
  onOpen: OpenFn;
  describedBy: string;
  index: number;
}) {
  const reduce = useReducedMotion();
  const g = groups[gi];
  const Icon = GROUP_ICONS[g.icon];
  const items = itemsOf(gi);
  const roving = useRoving(items.length + 1);
  const rise = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-40px' },
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay: Math.min(index, 8) * 0.05 },
      };

  return (
    <motion.div
      role="toolbar"
      aria-label={`${g.label} skills`}
      aria-describedby={describedBy}
      className={styles.box}
      data-active={active || undefined}
      style={{ '--c': groupColor(gi) } as CSSProperties}
      onKeyDown={roving.onKeyDown}
      {...rise}
    >
      <button type="button" className={styles.boxHead} aria-pressed={active} onClick={onToggle} {...roving.itemProps(0)}>
        <span className={styles.boxIcon} aria-hidden="true">
          <Icon />
        </span>
        <span className={styles.boxLabel}>{g.label}</span>
        <span className={styles.boxCount} aria-hidden="true">
          {g.items.length}
        </span>
        <span className="sr-only">: highlight these {g.items.length} skills in the sphere</span>
      </button>
      <ul className={styles.chips}>
        {items.map((item, i) => (
          <li key={item.id}>
            <Chip item={item} open={openId === item.id} onOpen={onOpen} roving={roving.itemProps(i + 1)} />
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/** The chip cloud of the phone tab panel (remounted per category, so its roving stop resets). */
function ChipCloud({ items, openId, onOpen, dots, label, id }: { items: SkillItem[]; openId: string | null; onOpen: OpenFn; dots: boolean; label: string; id: string }) {
  const reduce = useReducedMotion();
  const roving = useRoving(items.length);
  return (
    <div role="toolbar" aria-label={label} onKeyDown={roving.onKeyDown}>
      <motion.ul
        id={id}
        className={`${styles.chips} ${styles.cloud}`}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {items.map((item, i) => (
          <li key={item.id}>
            <Chip item={item} open={openId === item.id} onOpen={onOpen} dot={dots} roving={roving.itemProps(i)} />
          </li>
        ))}
      </motion.ul>
    </div>
  );
}

/** Phones: a scrollable row of category tabs that filters one chip cloud (and the sphere). */
function CompactToolbox({
  activeGroup,
  setActiveGroup,
  openId,
  onOpen,
}: {
  activeGroup: number | null;
  setActiveGroup: (g: number | null) => void;
  openId: string | null;
  onOpen: OpenFn;
}) {
  const uid = useId();
  const [showAll, setShowAll] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sel = activeGroup == null ? 0 : activeGroup + 1;
  const tabId = (i: number) => `${uid}-tab-${i}`;
  const panelId = `${uid}-panel`;
  const listId = `${uid}-list`;

  const tabs = [
    { label: 'All', count: allSkills.length, color: 'var(--chalk)', Icon: Sparkles },
    ...groups.map((g, gi) => ({ label: g.label, count: g.items.length, color: groupColor(gi), Icon: GROUP_ICONS[g.icon] })),
  ];
  const select = (i: number) => setActiveGroup(i === 0 ? null : i - 1);

  const onTabKey = (e: KeyboardEvent) => {
    let to = -1;
    if (e.key === 'ArrowRight') to = (sel + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') to = (sel - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tabs.length - 1;
    if (to < 0) return;
    e.preventDefault();
    select(to);
    tabRefs.current[to]?.focus();
  };

  // keep the selected tab inside the scroll row (horizontal only, never scroll the page)
  useEffect(() => {
    const row = rowRef.current;
    const tab = tabRefs.current[sel];
    if (!row || !tab) return;
    const pad = 28;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    let to: number | null = null;
    if (left - pad < row.scrollLeft) to = left - pad;
    else if (right + pad > row.scrollLeft + row.clientWidth) to = right + pad - row.clientWidth;
    if (to != null) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      row.scrollTo({ left: Math.max(0, to), behavior: smooth ? 'smooth' : 'auto' });
    }
  }, [sel]);

  const all = activeGroup == null;
  const items = all ? (showAll ? skillsByImportance : skillsByImportance.slice(0, ALL_PREVIEW)) : itemsOf(activeGroup);
  const hidden = allSkills.length - ALL_PREVIEW;

  return (
    <div className={styles.compact}>
      <div className={styles.tabsBleed}>
        <div ref={rowRef} className={styles.tabs} role="tablist" aria-label="Skill categories" onKeyDown={onTabKey}>
          {tabs.map((t, i) => {
            const on = i === sel;
            return (
              <button
                key={t.label}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={tabId(i)}
                aria-selected={on}
                aria-controls={panelId}
                tabIndex={on ? 0 : -1}
                className={styles.tab}
                style={{ '--c': t.color } as CSSProperties}
                onClick={() => select(i)}
              >
                <t.Icon className={styles.tabIcon} aria-hidden="true" />
                {t.label}
                <span className={styles.tabCount}>
                  <span className="sr-only">, </span>
                  {t.count}
                  <span className="sr-only"> skills</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(sel)} className={styles.panel}>
        <ChipCloud
          key={activeGroup ?? 'all'}
          id={listId}
          items={items}
          openId={openId}
          onOpen={onOpen}
          dots={all}
          label={all ? 'All skills, headline stack first' : `${tabs[sel].label} skills`}
        />
        {all && (
          <button type="button" className={styles.more} aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'show fewer' : `+ ${hidden} more`}
            <span className="sr-only"> skills</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** "My toolbox": an interactive 3D tag sphere of the skills + category chalk boxes with chips. */
export default function Skills() {
  const reduce = useReducedMotion();
  const compact = useMediaQuery(COMPACT_MQ);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const [pop, setPop] = useState<PopState | null>(null);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const kbdHintId = useId();

  const popRef = useRef<PopState | null>(null);
  popRef.current = pop;

  const openFor = useCallback((item: SkillItem, el: HTMLElement, source: PopState['source']) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const cur = popRef.current;
    if (cur && cur.item.id === item.id) {
      setPop(null); // same trigger again → toggle closed
      return;
    }
    const lr = layout.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setLayoutWidth(lr.width);
    setPop({
      item,
      source,
      trigger: el,
      nonce: (cur?.nonce ?? 0) + 1,
      anchor: {
        x: r.left + r.width / 2 - lr.left,
        top: r.top - lr.top,
        bottom: r.bottom - lr.top,
        vTop: r.top,
        vBottom: r.bottom,
      },
    });
  }, []);
  const openFromChip = useCallback<OpenFn>((item, el) => openFor(item, el, 'chip'), [openFor]);

  const close = useCallback((opts?: { restoreFocus?: boolean }) => {
    const cur = popRef.current;
    if (!cur) return;
    setPop(null);
    if (opts?.restoreFocus && cur.source === 'chip' && cur.trigger.isConnected) {
      const t = cur.trigger;
      requestAnimationFrame(() => t.focus({ preventScroll: true }));
    }
  }, []);

  // outside click / Escape / resize close the popover
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest(`.${styles.pop}`) || t.closest('[data-skill-trigger]') || t.closest('[data-sphere]')) return;
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close({ restoreFocus: true });
    };
    const onResize = () => close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [pop, close]);

  const selected = pop ? { id: pop.source === 'chip' ? sphereIdFor(pop.item) : pop.item.id, orient: pop.source === 'chip' && !compact, nonce: pop.nonce } : null;

  return (
    <section id="skills" className={styles.section} aria-labelledby="skills-title">
      <div className="container">
        <div className={styles.headRow}>
          <SectionHeading id="skills-title" title="My" accent="toolbox" />
          <p className={styles.hint}>
            {compact ? 'pick a category' : 'tap a box to filter'} <span aria-hidden="true">·</span> tap a skill to see where I used it
          </p>
        </div>

        <div ref={layoutRef} className={styles.layout}>
          <div className={styles.sphereCol}>
            <motion.div
              className={styles.sphereWrap}
              initial={reduce ? false : { opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ type: 'spring', stiffness: 80, damping: 16 }}
              data-sphere=""
            >
              <TagSphere
                items={sphereSkills}
                colorFor={groupColor}
                activeGroup={activeGroup}
                selected={selected}
                paused={!!pop}
                onPick={(item, el) => openFor(item, el, 'sphere')}
                onDragStart={() => close()}
                label={`Interactive 3D cloud of my skills; the headline stack (Java, Spring Boot, Microservices, Kafka, Redis, AWS, System Design) is drawn larger. All ${allSkills.length} skills are also listed as buttons in the toolbox.`}
              />
            </motion.div>
            <div className={styles.sphereFoot}>
              <AnimatePresence mode="wait" initial={false}>
                {activeGroup != null && !compact ? (
                  <motion.button
                    key="clear"
                    type="button"
                    className={styles.clearFilter}
                    style={{ '--c': groupColor(activeGroup) } as CSSProperties}
                    onClick={() => setActiveGroup(null)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                  >
                    showing <strong>{groups[activeGroup].label}</strong>
                    <X aria-hidden="true" />
                    <span className="sr-only">, clear filter</span>
                  </motion.button>
                ) : (
                  <motion.p key="hint" className={styles.dragHint} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <svg viewBox="0 0 48 24" aria-hidden="true" className={styles.spinArrow}>
                      <path d="M4 14 C 12 22, 34 22, 43 11" />
                      <path d="M36 9 L 43.5 10.5 L 42 18" />
                    </svg>
                    drag to spin
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          {compact ? (
            <CompactToolbox activeGroup={activeGroup} setActiveGroup={setActiveGroup} openId={pop?.item.id ?? null} onOpen={openFromChip} />
          ) : (
            <div className={styles.boxes} data-filtering={activeGroup != null || undefined}>
              <p id={kbdHintId} className="sr-only">
                Tab moves between categories; the arrow keys move between the skills inside one.
              </p>
              {groups.map((g, gi) => (
                <SkillBox
                  key={g.label}
                  gi={gi}
                  index={gi}
                  active={activeGroup === gi}
                  onToggle={() => setActiveGroup((cur) => (cur === gi ? null : gi))}
                  openId={pop?.item.id ?? null}
                  onOpen={openFromChip}
                  describedBy={kbdHintId}
                />
              ))}
            </div>
          )}

          <AnimatePresence>
            {pop && (
              <SkillPopover
                key={pop.item.id}
                item={pop.item}
                anchor={pop.anchor}
                layoutWidth={layoutWidth}
                color={groupColor(pop.item.group)}
                autoFocus={pop.source === 'chip'}
                onClose={close}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
