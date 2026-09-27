import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  Briefcase,
  Check,
  Copy,
  CornerDownLeft,
  Eraser,
  FileText,
  FolderGit2,
  GraduationCap,
  Handshake,
  Mail,
  Mountain,
  PenLine,
  PencilOff,
  Radar,
  Search,
  Sparkles,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { profile } from '@/data/profile';
import { trackerUrl } from '@/config';
import { useAuth } from '@/lib/auth';
import { SECTIONS, scrollToSection } from '@/portfolio/sections';
import { usePortfolioUI } from '@/portfolio/uiState';
import { copyText, mailtoHref } from '../ConnectModal/copy';
import { fuzzy } from './fuzzy';
import styles from './CommandPalette.module.css';

type Group = 'Navigate' | 'Actions' | 'Projects' | 'Experience' | 'Skills' | 'Lately';

interface Command {
  id: string;
  group: Group;
  label: string;
  keywords: string;
  icon: LucideIcon;
  hint?: string;
  /** Expose the hint as the option's accessible description (otherwise it is visual only). */
  describe?: boolean;
  /** Content items (projects, skills, roles…) only show up once the visitor types something. */
  searchOnly?: boolean;
  external?: boolean;
  /**
   * sync  — run inside the key/click handler (needed for window.open popups), then close.
   * after — close first, then run once the palette has released focus & scroll lock.
   * stay  — run and keep the palette open; the returned text is flashed, then it closes.
   */
  mode: 'sync' | 'after' | 'stay';
  run: () => void | Promise<string>;
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  about: UserRound,
  lately: Sparkles,
  experience: Briefcase,
  skills: Wrench,
  projects: FolderGit2,
  resume: FileText,
  contact: Mountain,
};
const SECTION_KEYWORDS: Record<string, string> = {
  about: 'home top hero intro who',
  lately: 'news updates recent awards',
  experience: 'work jobs career salescode roles education',
  skills: 'stack tech tools toolbox',
  projects: 'work portfolio case studies builds',
  resume: 'cv pdf download',
  contact: 'footer socials talk hire',
};
/** Max results shown per content group, so a one-letter query doesn't bury the list. */
const GROUP_CAP = 6;

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** A Modal (or the mobile menu sheet) is open: they make #root inert while they are up. */
function dialogOpen() {
  return !!document.getElementById('root')?.inert;
}

const isShown = (el: HTMLElement) => el.isConnected && el.getClientRects().length > 0;

/** Put focus back where the palette was opened from (or on the nav's ⌘K / menu button). */
function restoreFocus(opener: HTMLElement | null) {
  const panel = document.querySelector('[data-cmdk-panel]');
  if (opener && opener !== document.body && !panel?.contains(opener) && isShown(opener)) {
    opener.focus({ preventScroll: true });
    if (document.activeElement === opener) return;
  }
  const home = Array.from(document.querySelectorAll<HTMLElement>('[data-cmdk-home]')).find(isShown);
  if (home) home.focus({ preventScroll: true });
  else (document.activeElement as HTMLElement | null)?.blur?.();
}

/** Global ⌘K / Ctrl+K (toggle) and "/" (open) command palette. */
export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, connectOpen } = usePortfolioUI();
  const openRef = useRef(paletteOpen);
  const connectRef = useRef(connectOpen);
  openRef.current = paletteOpen;
  connectRef.current = connectOpen;
  /** The element focused right before the palette opened (captured by <Palette> before it takes focus). */
  const openerRef = useRef<HTMLElement | null>(null);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target);
      if (!cmdK && !slash) return;
      if (openRef.current) {
        if (cmdK) {
          e.preventDefault();
          setPaletteOpen(false);
        }
        return;
      }
      if (cmdK) e.preventDefault();
      // never stack the palette on top of another dialog
      if (connectRef.current || dialogOpen()) return;
      e.preventDefault();
      setPaletteOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  // safety net: if the connect card opens while the palette is up, the palette steps aside
  useEffect(() => {
    if (paletteOpen && connectOpen) setPaletteOpen(false);
  }, [paletteOpen, connectOpen, setPaletteOpen]);

  // scroll lock, inert page and focus restore, tied to the open flag (not the exit animation)
  useEffect(() => {
    if (!paletteOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    return () => {
      document.body.style.overflow = prevOverflow;
      if (root) root.inert = wasInert;
      restoreFocus(openerRef.current);
      openerRef.current = null;
    };
  }, [paletteOpen]);

  const close = useCallback(() => setPaletteOpen(false), [setPaletteOpen]);

  return createPortal(
    <AnimatePresence>{paletteOpen && <Palette key="palette" onClose={close} openerRef={openerRef} />}</AnimatePresence>,
    document.body,
  );
}

function useCommands(): Command[] {
  const { setConnectOpen, chalkTool, setChalkTool, wipeBoard } = usePortfolioUI();
  const { isOwner, demo } = useAuth();

  const content = useMemo(() => contentCommands(), []);

  return useMemo(() => {
    const s = profile.socials;
    const nav: Command[] = SECTIONS.map((sec) => ({
      id: `go-${sec.id}`,
      group: 'Navigate',
      label: sec.label,
      keywords: `go to jump ${sec.id} ${SECTION_KEYWORDS[sec.id] ?? ''}`,
      icon: SECTION_ICONS[sec.id] ?? Sparkles,
      hint: `#${sec.id}`,
      mode: 'after',
      run: () => scrollToSection(sec.id),
    }));

    const actions: (Command | false)[] = [
      !!s.email && {
        id: 'copy-email',
        group: 'Actions',
        label: 'Copy email',
        keywords: `clipboard mail contact ${s.email}`,
        icon: Copy,
        hint: s.email,
        mode: 'stay',
        run: async () => ((await copyText(s.email)) ? 'Email copied to clipboard' : 'Could not copy. Email: ' + s.email),
      },
      !!s.email && {
        id: 'write-email',
        group: 'Actions',
        label: 'Write an email',
        keywords: 'mail send message hello contact',
        icon: Mail,
        hint: 'mail app',
        mode: 'sync',
        run: () => {
          window.location.href = mailtoHref(s.email);
        },
      },
      !!s.linkedin && {
        id: 'linkedin',
        group: 'Actions',
        label: 'Open LinkedIn',
        keywords: 'social profile network',
        icon: ArrowUpRight,
        hint: 'new tab',
        describe: true,
        external: true,
        mode: 'sync',
        run: () => {
          window.open(s.linkedin, '_blank', 'noopener,noreferrer');
        },
      },
      !!s.github && {
        id: 'github',
        group: 'Actions',
        label: 'Open GitHub',
        keywords: 'code repos social',
        icon: ArrowUpRight,
        hint: 'new tab',
        describe: true,
        external: true,
        mode: 'sync',
        run: () => {
          window.open(s.github, '_blank', 'noopener,noreferrer');
        },
      },
      {
        id: 'connect',
        group: 'Actions',
        label: 'Connect',
        keywords: 'contact hire talk message reach out',
        icon: Handshake,
        mode: 'after',
        run: () => setConnectOpen(true),
      },
      chalkTool === 'none'
        ? {
            id: 'draw',
            group: 'Actions',
            label: 'Draw on the board',
            keywords: 'chalk pen doodle sketch paint',
            icon: PenLine,
            hint: 'chalk',
            mode: 'after',
            run: () => setChalkTool('white'),
          }
        : {
            id: 'stop-draw',
            group: 'Actions',
            label: 'Stop drawing',
            keywords: 'chalk pen doodle exit done',
            icon: PencilOff,
            mode: 'after',
            run: () => setChalkTool('none'),
          },
      {
        id: 'wipe',
        group: 'Actions',
        label: 'Wipe the board',
        keywords: 'erase clear clean chalk doodles',
        icon: Eraser,
        mode: 'after',
        run: () => wipeBoard(),
      },
      (demo || isOwner) && {
        id: 'radar',
        group: 'Actions',
        label: demo ? 'Open Job Radar (demo)' : 'Open Job Radar',
        keywords: 'tracker jobs applications owner dashboard',
        icon: Radar,
        hint: 'tracker',
        mode: 'sync',
        run: () => {
          window.location.assign(trackerUrl);
        },
      },
    ];

    return [...nav, ...(actions.filter(Boolean) as Command[]), ...content];
  }, [setConnectOpen, chalkTool, setChalkTool, wipeBoard, isOwner, demo, content]);
}

/** Projects, roles, skills and "lately" cards: searchable, each jumps to its section. */
function contentCommands(): Command[] {
  const go = (id: string) => () => scrollToSection(id);
  const out: Command[] = [];

  for (const p of profile.projects) {
    out.push({
      id: `project-${p.id}`,
      group: 'Projects',
      label: p.title,
      keywords: `project case study ${p.kind} ${p.subtitle} ${p.tech.join(' ')}`,
      icon: FolderGit2,
      hint: p.subtitle,
      describe: true,
      searchOnly: true,
      mode: 'after',
      run: go('projects'),
    });
  }

  for (const x of profile.experience) {
    for (const r of x.roles) {
      out.push({
        id: `role-${slug(`${x.company}-${r.title}-${r.start}`)}`,
        group: 'Experience',
        label: r.title,
        keywords: `role job work experience ${x.company} ${x.companyNote ?? ''} ${r.start} ${r.end}`,
        icon: Briefcase,
        hint: `${x.company} · ${r.start} – ${r.end}`,
        describe: true,
        searchOnly: true,
        mode: 'after',
        run: go('experience'),
      });
    }
  }
  for (const ed of profile.education) {
    out.push({
      id: `edu-${slug(ed.school)}`,
      group: 'Experience',
      label: ed.degree,
      keywords: `education degree university college school study ${ed.school} ${ed.detail}`,
      icon: GraduationCap,
      hint: `${ed.school} · ${ed.end.replace(/^\D+/, '')}`,
      describe: true,
      searchOnly: true,
      mode: 'after',
      run: go('experience'),
    });
  }

  const seen = new Set<string>();
  for (const g of profile.skills) {
    for (const item of g.items) {
      const id = `skill-${slug(item)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        group: 'Skills',
        label: item,
        keywords: `skill stack tech ${g.label}`,
        icon: Wrench,
        hint: g.label,
        describe: true,
        searchOnly: true,
        mode: 'after',
        run: go('skills'),
      });
    }
  }

  for (const l of profile.lately) {
    out.push({
      id: `lately-${l.id}`,
      group: 'Lately',
      label: l.title,
      keywords: `lately news update ${l.tag} ${l.blurb}`,
      icon: Sparkles,
      hint: l.tag,
      describe: true,
      searchOnly: true,
      mode: 'after',
      run: go('lately'),
    });
  }
  return out;
}

interface Match {
  cmd: Command;
  score: number;
  indices: number[];
}

const contiguous = (idx: number[]) => idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);

/**
 * Labels match fuzzily (but scattered-letter matches need a decent score), keywords only match when every
 * typed word appears as-is. Label hits always rank above keyword hits.
 */
function match(q: string, cmd: Command): Match | null {
  if (!q) return { cmd, score: 0, indices: [] };
  const l = fuzzy(q, cmd.label);
  if (l && (contiguous(l.indices) || l.score >= q.replace(/\s+/g, '').length * 16)) {
    return { cmd, score: l.score + 600, indices: l.indices };
  }
  const kw = ` ${cmd.keywords.toLowerCase()}`;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let score = 300;
  for (const w of words) {
    const at = kw.indexOf(w);
    if (at < 0) return null;
    if (kw[at - 1] === ' ') score += 40; // word start
  }
  return { cmd, score: score - cmd.keywords.length * 0.05, indices: [] };
}

function Palette({ onClose, openerRef }: { onClose: () => void; openerRef: MutableRefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const present = useIsPresent();
  const commands = useCommands();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const escRef = useRef<HTMLButtonElement>(null);
  const uid = useId().replace(/:/g, '');
  const listId = `cmdk-list-${uid}`;
  const optId = (id: string) => `cmdk-${uid}-${id}`;

  // remember the opener *before* taking focus. Re-opened mid exit animation, AnimatePresence revives this
  // same instance, so start from a clean slate too.
  useLayoutEffect(() => {
    if (!present) return;
    const a = document.activeElement;
    if (!openerRef.current) openerRef.current = a instanceof HTMLElement && a !== inputRef.current ? a : null;
    setQuery('');
    setActive(0);
    setFlash(null);
    inputRef.current?.focus({ preventScroll: true });
  }, [present, openerRef]);

  const groups = useMemo(() => {
    const q = query.trim();
    const byGroup = new Map<Group, Match[]>();
    for (const cmd of commands) {
      if (!q && cmd.searchOnly) continue;
      const m = match(q, cmd);
      if (m) byGroup.set(cmd.group, [...(byGroup.get(cmd.group) ?? []), m]);
    }
    let out = [...byGroup.entries()].map(([group, items]) => {
      const sorted = q ? [...items].sort((a, b) => b.score - a.score) : items;
      return { group, items: sorted[0]?.cmd.searchOnly ? sorted.slice(0, GROUP_CAP) : sorted };
    });
    if (q) out = out.sort((a, b) => b.items[0].score - a.items[0].score);
    return out;
  }, [commands, query]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = flat[Math.min(active, flat.length - 1)];

  useEffect(() => setActive(0), [query]);

  // polite result count for screen readers (debounced so it doesn't chatter while typing)
  useEffect(() => {
    const q = query.trim();
    const t = window.setTimeout(() => {
      setAnnounce(!q ? '' : flat.length ? `${flat.length} result${flat.length === 1 ? '' : 's'}` : `No results for ${q}`);
    }, 450);
    return () => window.clearTimeout(t);
  }, [query, flat.length]);

  useEffect(() => {
    if (!current) return;
    document.getElementById(optId(current.cmd.id))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.cmd.id]);

  const runCommand = async (cmd: Command) => {
    if (flash) return;
    if (cmd.mode === 'sync') {
      cmd.run();
      onClose();
    } else if (cmd.mode === 'after') {
      onClose();
      window.setTimeout(() => void cmd.run(), 70);
    } else {
      const msg = await cmd.run();
      setFlash(msg || 'Done');
      window.setTimeout(onClose, 950);
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      // two stops: the search box and the close button
      e.preventDefault();
      e.stopPropagation();
      (document.activeElement === inputRef.current ? escRef.current : inputRef.current)?.focus();
      return;
    }
    // list keys only drive the listbox while typing in the combobox
    if (e.target !== inputRef.current) return;
    const n = flat.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (n) setActive((i) => (i + 1) % n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (n) setActive((i) => (i - 1 + n) % n);
        break;
      case 'Home':
        if (!query) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (!query) {
          e.preventDefault();
          setActive(Math.max(0, n - 1));
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (current) void runCommand(current.cmd);
        break;
    }
  };

  let flatIndex = -1;

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0.1 : 0.14 } }}
      transition={{ duration: reduce ? 0.1 : 0.18 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-cmdk-panel=""
        onKeyDown={onKeyDown}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -14 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -8, transition: { duration: 0.14, ease: 'easeIn' } }}
        transition={reduce ? { duration: 0.1 } : { type: 'spring', stiffness: 460, damping: 34 }}
      >
        <div className={styles.searchRow}>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-activedescendant={current ? optId(current.cmd.id) : undefined}
            aria-label="Search the site and commands"
            placeholder="Where to? Try “resume” or “kafka”…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            enterKeyHint="go"
          />
          <button ref={escRef} type="button" className={styles.esc} onClick={onClose} aria-label="Close command palette">
            esc
          </button>
          <svg className={styles.searchLine} viewBox="0 0 600 6" preserveAspectRatio="none" aria-hidden="true">
            <path d="M2 3.5 C 90 1.5, 180 5, 300 3 S 500 2, 598 4" />
          </svg>
        </div>

        <div id={listId} role="listbox" aria-label="Results" className={styles.list}>
          <LayoutGroup id="cmdk">
            {groups.map((g) => (
              <div key={g.group} className={styles.group}>
                <div id={`${listId}-${g.group}`} className={styles.groupLabel} aria-hidden="true">
                  {g.group.toLowerCase()}
                </div>
                <div role="group" aria-labelledby={`${listId}-${g.group}`}>
                {g.items.map((m) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  const on = current?.cmd.id === m.cmd.id;
                  const Icon = m.cmd.icon;
                  const done = flash && on;
                  const id = optId(m.cmd.id);
                  const hintId = m.cmd.hint && m.cmd.describe ? `${id}-hint` : undefined;
                  return (
                    <div
                      key={m.cmd.id}
                      id={id}
                      role="option"
                      aria-selected={on}
                      aria-describedby={hintId}
                      className={[styles.option, on && styles.optionOn].filter(Boolean).join(' ')}
                      onMouseMove={() => active !== idx && setActive(idx)}
                      // keep focus in the search box (the listbox is driven by aria-activedescendant)
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void runCommand(m.cmd)}
                    >
                      {on && (
                        <motion.span
                          layoutId="cmdk-active"
                          className={styles.highlight}
                          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 38 }}
                        />
                      )}
                      <span className={styles.optIcon} aria-hidden="true">
                        {done ? <Check /> : <Icon />}
                      </span>
                      <span className={styles.optLabel}>
                        <Highlighted text={m.cmd.label} indices={m.indices} />
                      </span>
                      {m.cmd.hint && (
                        <span id={hintId} className={styles.optHint} aria-hidden="true">
                          {m.cmd.hint}
                        </span>
                      )}
                      <span className={styles.enter} aria-hidden="true">
                        <CornerDownLeft />
                      </span>
                    </div>
                  );
                })}
                </div>
              </div>
            ))}
          </LayoutGroup>

          {!flat.length && (
            <div className={styles.empty} aria-hidden="true">
              <svg viewBox="0 0 60 44" className={styles.emptyDoodle}>
                <path d="M24 5.5 C 33 5, 39.5 11.5, 39 20 C 38.6 28, 32 34, 23.6 33.6 C 15.4 33.2, 9.6 26.8, 10 19 C 10.4 11.4, 16.4 5.8, 24 5.5 Z" />
                <path d="M34.5 29.5 L 46 41" strokeWidth="3" />
                <path d="M19.5 15.5 C 19.6 12, 28.6 11.6, 28.4 16 C 28.2 19.2, 24 19, 24 22.6 M24 27.2 L24 27.4" />
                <path d="M50 8 L54 4 M52 14 L57 13" />
              </svg>
              <p>
                nothing matches <strong>“{query}”</strong>
              </p>
              <p className={styles.emptyHint}>try “projects”, “kafka” or “draw”</p>
            </div>
          )}
        </div>

        <div className={[styles.footer, !flash && styles.footerIdle].filter(Boolean).join(' ')}>
          {flash ? (
            <motion.span
              key="flash"
              className={styles.flash}
              aria-hidden="true"
              initial={reduce ? false : { opacity: 0, y: 6, rotate: -2 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            >
              <Check /> {flash}
            </motion.span>
          ) : (
            <span className={styles.hints} aria-hidden="true">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> move
              </span>
              <span>
                <kbd>↵</kbd> run
              </span>
              <span>
                <kbd>esc</kbd> close
              </span>
            </span>
          )}
          <span className={styles.toggleHint} aria-hidden="true">
            <kbd>{isMac ? '⌘' : 'ctrl'}</kbd>
            <kbd>K</kbd>
          </span>
        </div>

        {/* always mounted, so changes (result counts, "Email copied") are announced */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {flash ?? announce}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Highlighted({ text, indices }: { text: string; indices: number[] }) {
  if (!indices.length) return <>{text}</>;
  const set = new Set(indices);
  const out: { s: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.s += text[i];
    else out.push({ s: text[i], hit });
  }
  return (
    <>
      {out.map((p, i) =>
        p.hit ? (
          <mark key={i} className={styles.mark}>
            {p.s}
          </mark>
        ) : (
          <span key={i}>{p.s}</span>
        ),
      )}
    </>
  );
}
