import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Undo2, X } from 'lucide-react';
import { usePortfolioUI, type ChalkTool } from '@/portfolio/uiState';
import { DrawingLayer, type DrawingApi } from './DrawingLayer';
import { WipeSweep } from './WipeSweep';
import { ChalkStickArt, DownArrow, EraserArt } from './Props';
import { WIPE_MS, type ChalkColor } from './strokes';
import { FAB, FAB_EDGE, TRAY_EDGE, TRAY_W, useTrayLayout } from './useTrayLayout';
import { areaHasContent, useTrayVisibility } from './useTrayVisibility';
import styles from './ChalkTray.module.css';

const STICKS: { color: ChalkColor; name: string; tilt: number }[] = [
  { color: 'white', name: 'white', tilt: -5 },
  { color: 'red', name: 'red', tilt: 3 },
  { color: 'yellow', name: 'yellow', tilt: -2 },
];
const ORDER: ChalkColor[] = ['white', 'red', 'yellow'];

const DOT: Record<ChalkColor, string> = {
  white: 'var(--chalk)',
  red: 'var(--chalk-red)',
  yellow: 'var(--chalk-yellow)',
};

const HINT_KEY = 'board:hint:v1';
/** Touch drawing mode ends by itself after this long without a stroke. */
const AUTO_EXIT_MS = 6000;
const TRAY_H = 100;

const isColor = (t: ChalkTool): t is ChalkColor => t === 'white' || t === 'red' || t === 'yellow';

function hintSeen() {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}
function markHintSeen() {
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* private mode — it may show again, that's fine */
  }
}

type OpenBy = 'hover' | 'focus' | 'click';

/**
 * Chalk tray. Wide screens with a mouse: the full tray docks in the right gutter (only
 * when it fits outside the content column). Everywhere else it collapses into one round
 * chalk button that expands into the tray on hover / focus / click. It steps out of the
 * way while the footer is on screen, while a dialog is open, and when keyboard focus
 * lands under it. Picking a chalk enters drawing mode with an explicit "Drawing — Done"
 * bar; on touch, two fingers scroll and the mode ends after 6 s without a stroke.
 */
export default function ChalkTray() {
  const { chalkTool, setChalkTool, wipeSignal, wipeBoard } = usePortfolioUI();
  const reduced = !!useReducedMotion();
  const layout = useTrayLayout();
  const collapsed = !layout.docked;
  const drawing = isColor(chalkTool);

  const api = useRef<DrawingApi | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const firstStickRef = useRef<HTMLButtonElement>(null);

  const [count, setCount] = useState(0);
  const [tip, setTip] = useState<null | 'chalk' | 'eraser'>(null);
  const [hint, setHint] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [openBy, setOpenBy] = useState<OpenBy | null>(null);
  const open = collapsed && openBy !== null;
  const [autoExit, setAutoExit] = useState(false);
  const [stroking, setStroking] = useState(false);
  const [idleKey, setIdleKey] = useState(0);
  const [notice, setNotice] = useState('');

  const [focusIn, setFocusIn] = useState(false);
  const lastPointer = useRef<string>('mouse');
  const focusDoneNext = useRef(false);
  const closeTimer = useRef(0);

  const homeRect = useCallback(() => {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    if (!collapsed) {
      const w = TRAY_W * layout.scale;
      const h = TRAY_H * layout.scale;
      return { left: vw - TRAY_EDGE - w, top: vh - TRAY_EDGE - h - 30, right: vw - TRAY_EDGE, bottom: vh - TRAY_EDGE };
    }
    return { left: vw - FAB_EDGE - FAB, top: vh - FAB_EDGE - FAB, right: vw - FAB_EDGE, bottom: vh - FAB_EDGE };
  }, [collapsed, layout.scale]);

  const vis = useTrayVisibility({
    selfRefs: [widgetRef, barRef],
    homeRect,
    scrollAware: collapsed && !layout.fabInGutter,
    probe: layout.docked || layout.fabInGutter,
  });

  // Two kinds of "away". Hard (a dialog is up, or the drawing bar replaces the button) makes
  // the tray inert. Soft (footer on screen, content underneath, focus underneath, and — for a
  // button that has to sit over the content column — the first screen and scrolling down)
  // only fades it out of the way; keyboard focus landing on it brings it straight back.
  const hardAway = vis.dialog || (collapsed && drawing);
  const softAway = vis.footer || vis.tucked || vis.covered || (collapsed && !open && (vis.scrolledAway || vis.atTop));
  const away = hardAway || (softAway && !focusIn);

  const wipeRef = useRef(wipeBoard);
  wipeRef.current = wipeBoard;
  const setToolRef = useRef(setChalkTool);
  setToolRef.current = setChalkTool;

  // 'eraser' is a momentary tool: wipe the board, then put everything down.
  useEffect(() => {
    if (chalkTool !== 'eraser') return;
    wipeRef.current();
    const t = window.setTimeout(() => setToolRef.current('none'), reduced ? 0 : WIPE_MS);
    return () => window.clearTimeout(t);
  }, [chalkTool, reduced]);

  // A real modal opening ends drawing mode (the canvas would sit over it otherwise).
  useEffect(() => {
    if (vis.modal && drawing) setToolRef.current('none');
  }, [vis.modal, drawing]);

  // Expanded tray closes when it has to step away, or when the layout docks it.
  useEffect(() => {
    if ((away && !drawing) || !collapsed) setOpenBy(null);
  }, [away, drawing, collapsed]);

  // ── first-visit hint: only after the first scroll settles, only where it fits ──
  const hintFitsRef = useRef(layout.hintFits);
  hintFitsRef.current = layout.hintFits;
  const blockedRef = useRef(false);
  blockedRef.current = away || drawing || open;
  useEffect(() => {
    if (layout.phone || hintSeen()) return;
    let t = 0;
    const fire = () => {
      window.removeEventListener('scroll', onScroll);
      markHintSeen();
      if (blockedRef.current) return;
      if (hintFitsRef.current) setHint(true);
      else if (!reduced) setNudge((n) => n + 1); // no room for a note → the button just wiggles once
    };
    const onScroll = () => {
      window.clearTimeout(t);
      t = window.setTimeout(fire, 900);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
    };
  }, [layout.phone, reduced]);
  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(false), 6000);
    return () => window.clearTimeout(t);
  }, [hint]);
  useEffect(() => {
    if (hint && (away || drawing || open || !layout.hintFits)) setHint(false);
  }, [hint, away, drawing, open, layout.hintFits]);
  // the note must never sit over content: check where it actually landed, and keep checking
  const hintRef = useRef<HTMLButtonElement>(null);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  useLayoutEffect(() => {
    if (!hint) return;
    const clear = () => {
      const el = hintRef.current;
      if (!el) return true;
      const r = el.getBoundingClientRect();
      const box = { left: r.left - 6, top: r.top - 6, right: r.right + 6, bottom: r.bottom + 40 };
      return !areaHasContent(box, [widgetRef.current]);
    };
    if (!clear()) {
      setHint(false);
      if (collapsedRef.current && !reducedRef.current) setNudge((n) => n + 1);
      return;
    }
    let raf = 0;
    const onScroll = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (!clear()) setHint(false);
        });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    const poll = window.setInterval(onScroll, 350); // cards may still be settling in
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      window.removeEventListener('scroll', onScroll);
    };
  }, [hint]);
  const dismissHint = () => {
    if (hint) setHint(false);
  };

  // ── touch drawing: auto-exit after a quiet spell ─────────────────────────────
  useEffect(() => {
    if (!drawing || !autoExit || stroking) return;
    const t = window.setTimeout(() => {
      setToolRef.current('none');
      setNotice('Drawing mode ended — you can scroll again.');
    }, AUTO_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [drawing, autoExit, stroking, idleKey]);

  const onActivity = useCallback((kind: 'start' | 'end') => {
    setStroking(kind === 'start');
    if (kind === 'end') setIdleKey((n) => n + 1);
  }, []);

  // focus hand-off when drawing starts (keyboard pick → Done) and ends (bar → tray)
  const wasDrawing = useRef(drawing);
  useEffect(() => {
    const prev = wasDrawing.current;
    wasDrawing.current = drawing;
    if (drawing && !prev) {
      setNotice('');
      if (focusDoneNext.current) {
        focusDoneNext.current = false;
        requestAnimationFrame(() => doneRef.current?.focus());
      }
    }
    if (!drawing && prev) {
      setStroking(false);
      const a = document.activeElement;
      if (a && barRef.current?.contains(a)) {
        requestAnimationFrame(() => (collapsed ? fabRef.current : firstStickRef.current)?.focus({ preventScroll: true }));
      }
    }
  }, [drawing, collapsed]);

  // ── expanded (collapsed-mode) tray: outside tap / scroll / Esc close it ──────
  useEffect(() => {
    if (!open) return;
    const startY = window.scrollY;
    const onDown = (e: PointerEvent) => {
      if (!widgetRef.current?.contains(e.target as Node)) setOpenBy(null);
    };
    const onScroll = () => {
      if (openBy === 'click' && Math.abs(window.scrollY - startY) > 80) setOpenBy(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll);
    };
  }, [open, openBy]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const onWidgetKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && open && !drawing) {
      e.stopPropagation();
      setOpenBy(null);
      fabRef.current?.focus();
    }
  };
  const onWidgetEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !collapsed || drawing) return;
    window.clearTimeout(closeTimer.current);
    setOpenBy((o) => o ?? 'hover');
  };
  const onWidgetLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenBy((o) => (o === 'hover' ? null : o)), 380);
  };
  const onWidgetFocus = (e: React.FocusEvent) => {
    if ((e.target as Element).matches(':focus-visible')) setFocusIn(true);
  };
  const onWidgetBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && widgetRef.current?.contains(next)) return;
    setFocusIn(false);
    setOpenBy((o) => (o === 'focus' ? null : o));
  };
  const onFabFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    if (e.currentTarget.matches(':focus-visible')) setOpenBy((o) => o ?? 'focus');
  };
  const onFabClick = () => {
    dismissHint();
    setOpenBy((o) => (o === 'click' ? null : 'click'));
  };

  // ── tools ─────────────────────────────────────────────────────────────────
  const pick = (c: ChalkColor, e: React.MouseEvent) => {
    dismissHint();
    const next: ChalkTool = chalkTool === c ? 'none' : c;
    if (isColor(next)) {
      setAutoExit(lastPointer.current === 'touch' || !layout.fine);
      setIdleKey((n) => n + 1);
      focusDoneNext.current = e.detail === 0; // keyboard activation
    }
    setChalkTool(next);
    if (collapsed) setOpenBy(null);
  };
  const erase = () => {
    dismissHint();
    setChalkTool('eraser');
    if (collapsed && openBy !== 'hover') window.setTimeout(() => setOpenBy(null), reduced ? 0 : 450);
  };
  const cycle = () => {
    if (!isColor(chalkTool)) return;
    setChalkTool(ORDER[(ORDER.indexOf(chalkTool) + 1) % ORDER.length]);
    setIdleKey((n) => n + 1);
  };

  const showTip = (which: 'chalk' | 'eraser') => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setTip(which);
  };
  const focusTip = (which: 'chalk' | 'eraser') => (e: React.FocusEvent<HTMLElement>) => {
    // keyboard focus only — a tap on touch shouldn't leave a tooltip hanging
    if (e.currentTarget.matches(':focus-visible')) setTip(which);
  };
  const hideTip = () => setTip(null);

  const spring = reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 17, mass: 0.7 };
  const current: ChalkColor = isColor(chalkTool) ? chalkTool : 'white';

  const tray = (
    <div className={styles.tray} data-drawing={drawing || undefined} style={collapsed ? undefined : { transform: `scale(${layout.scale})` }}>
      {/* hover / focus tooltip, written in chalk */}
      <AnimatePresence>
        {tip && !drawing && !hint && (
          <motion.span
            key={tip}
            className={`${styles.tip} ${tip === 'eraser' ? styles.tipEraser : ''}`}
            aria-hidden="true"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            {tip === 'chalk' ? 'draw on the board' : 'wipe'}
          </motion.span>
        )}
      </AnimatePresence>

      <div className={styles.items}>
        {STICKS.map((s, i) => {
          const on = chalkTool === s.color;
          return (
            <motion.button
              key={s.color}
              ref={i === 0 ? firstStickRef : undefined}
              type="button"
              className={styles.stick}
              aria-pressed={on}
              aria-label={`${s.name} chalk — draw on the board`}
              title={reduced ? `${s.name} chalk — draw on the board` : undefined}
              onClick={(e) => pick(s.color, e)}
              onPointerEnter={showTip('chalk')}
              onPointerLeave={hideTip}
              onFocus={focusTip('chalk')}
              onBlur={hideTip}
              initial={false}
              animate={on ? 'active' : 'rest'}
              whileHover={reduced || on ? undefined : 'hover'}
              whileTap={reduced ? undefined : 'press'}
            >
              <motion.span
                className={styles.stickArt}
                variants={{
                  rest: { y: 0, rotate: s.tilt, scale: 1 },
                  hover: { y: -8, rotate: s.tilt * 0.3, scale: 1 },
                  press: { y: -4, scale: 0.97 },
                  active: { y: reduced ? -18 : -30, rotate: reduced ? 0 : -15, scale: 1.04 },
                }}
                transition={spring}
              >
                <ChalkStickArt color={s.color} />
              </motion.span>
            </motion.button>
          );
        })}

        <motion.button
          type="button"
          className={styles.eraser}
          aria-label="Eraser — wipe the board"
          title={reduced ? 'wipe the board' : undefined}
          onClick={erase}
          onPointerEnter={showTip('eraser')}
          onPointerLeave={hideTip}
          onFocus={focusTip('eraser')}
          onBlur={hideTip}
          initial={false}
          animate={chalkTool === 'eraser' ? 'active' : 'rest'}
          whileHover={reduced ? undefined : 'hover'}
          whileTap={reduced ? undefined : 'press'}
        >
          <motion.span
            className={styles.eraserHold}
            variants={{
              rest: { y: 0, rotate: -3, x: 0 },
              hover: { y: -5, rotate: -7, x: 0 },
              press: { y: -2, rotate: 2 },
              active: reduced
                ? { y: -6, rotate: 0 }
                : { y: -10, rotate: [-3, -12, 8, -6, 0], x: [0, -6, 6, -3, 0], transition: { duration: 0.55, ease: 'easeInOut' } },
            }}
            transition={spring}
          >
            <EraserArt />
          </motion.span>
        </motion.button>
      </div>

      <div className={styles.shelf} aria-hidden="true">
        <span className={styles.shelfTop} />
        <span className={styles.shelfFront} />
        <span className={styles.dust} />
      </div>
    </div>
  );

  const dockStyle: CSSProperties = collapsed
    ? {}
    : { width: Math.round(TRAY_W * layout.scale), height: Math.round(TRAY_H * layout.scale) };

  return (
    <>
      <DrawingLayer
        tool={chalkTool}
        setTool={setChalkTool}
        wipeSignal={wipeSignal}
        reduced={reduced}
        apiRef={api}
        onCountChange={setCount}
        onActivity={onActivity}
      />
      <WipeSweep signal={wipeSignal} reduced={reduced} />

      <motion.div
        ref={widgetRef}
        className={styles.dock}
        data-mode={collapsed ? 'fab' : 'docked'}
        data-away={away || undefined}
        style={dockStyle}
        inert={hardAway}
        initial={false}
        // stays inside the viewport while hidden (fade + shrink), so Tab-focusing it never
        // makes the browser scroll the page to "reveal" an off-screen fixed element
        animate={away ? { y: 14, scale: collapsed ? 0.55 : 0.9, opacity: 0 } : { y: 0, scale: 1, opacity: 1 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34, opacity: { duration: 0.2 } }}
        onPointerDownCapture={(e) => (lastPointer.current = e.pointerType)}
        onPointerEnter={onWidgetEnter}
        onPointerLeave={onWidgetLeave}
        onFocus={onWidgetFocus}
        onBlur={onWidgetBlur}
        onKeyDown={onWidgetKey}
      >
        {collapsed ? (
          <>
            <motion.button
              ref={fabRef}
              type="button"
              className={styles.fab}
              aria-expanded={open}
              aria-controls={open ? 'chalk-tray' : undefined}
              aria-label={open ? 'Close chalk tray' : 'Chalk tray — draw on the board'}
              title={reduced ? 'Chalk — draw on the board' : undefined}
              onClick={onFabClick}
              onFocus={onFabFocus}
              whileTap={reduced ? undefined : { scale: 0.92 }}
              animate={nudge && !reduced ? { rotate: [0, -16, 13, -9, 5, 0] } : undefined}
              transition={{ duration: 0.9, ease: 'easeInOut', delay: 0.1 }}
              key={`fab-${nudge}`}
            >
              <span className={styles.fabRing} aria-hidden="true" />
              <AnimatePresence initial={false} mode="wait">
                {open ? (
                  <motion.span
                    key="x"
                    className={styles.fabIcon}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, rotate: -60, scale: 0.6 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, rotate: 60, scale: 0.6 }}
                    transition={{ duration: reduced ? 0 : 0.16 }}
                  >
                    <X size={20} strokeWidth={2.4} aria-hidden="true" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="chalk"
                    className={styles.fabStick}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, rotate: 38 }}
                    animate={{ opacity: 1, y: 0, rotate: 38 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, rotate: 50 }}
                    transition={{ duration: reduced ? 0 : 0.18 }}
                  >
                    <ChalkStickArt color={current} />
                  </motion.span>
                )}
              </AnimatePresence>
              <svg className={styles.fabScribble} viewBox="0 0 24 10" aria-hidden="true">
                <path d="M2 6.5c2.5-3 4.4 1.8 7 -.6s4.2-2.6 6.1.4 3.8.2 6.6-2.3" />
              </svg>
            </motion.button>
            <AnimatePresence>
              {open && (
                <motion.div
                  key="pop"
                  id="chalk-tray"
                  className={styles.pop}
                  role="group"
                  aria-label="Chalk tray"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, x: 22, scale: 0.86 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, x: 16, scale: 0.9, transition: { duration: 0.16 } }}
                  transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 30 }}
                >
                  {tray}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          tray
        )}

        {/* first-visit hint: a sticky note in the gutter above the tray / button */}
        <AnimatePresence>
          {hint && (
            <motion.button
              key="hint"
              ref={hintRef}
              type="button"
              className={styles.hint}
              data-mode={collapsed ? 'fab' : 'docked'}
              onClick={() => setHint(false)}
              aria-label="Hint: grab a chalk to draw on the board. Click to dismiss."
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, rotate: 4, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, rotate: -3, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.5 } }}
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 16 }}
            >
              psst — grab a chalk <span aria-hidden="true">✎</span>
              <DownArrow className={styles.hintArrow} />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* drawing mode: an explicit bar (bottom centre) with colour / undo / Done */}
      <AnimatePresence>
        {drawing && (
          <div className={styles.barWrap} key="bar">
            <motion.div
              ref={barRef}
              className={styles.bar}
              role="toolbar"
              aria-label="Chalk drawing"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94, rotate: -2 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: -1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96, transition: { duration: 0.18 } }}
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 26 }}
            >
              <button
                type="button"
                className={styles.barColor}
                onClick={cycle}
                aria-label={`Chalk colour: ${current}. Switch colour`}
                title="Switch colour"
              >
                <motion.span
                  key={current}
                  className={styles.dot}
                  style={{ ['--dot' as string]: DOT[current] }}
                  initial={reduced ? false : { scale: 0.3 }}
                  animate={{ scale: 1 }}
                  transition={spring}
                />
              </button>
              <span className={styles.barText}>
                <span className={styles.barTitle}>drawing</span>
                <span className={styles.barSub}>{autoExit ? 'two fingers to scroll' : 'Esc when done'}</span>
              </span>
              <button
                type="button"
                className={styles.tbBtn}
                onClick={() => api.current?.undo()}
                disabled={!count}
                aria-label="Undo last stroke"
                title="Undo (Ctrl/⌘ Z)"
              >
                <Undo2 size={17} strokeWidth={2.2} aria-hidden="true" />
                <span className={styles.tbText}>undo</span>
              </button>
              <button
                ref={doneRef}
                type="button"
                className={`${styles.tbBtn} ${styles.tbDone}`}
                onClick={() => setChalkTool('none')}
                title="Done (Esc)"
              >
                <Check size={17} strokeWidth={2.4} aria-hidden="true" />
                <span>Done</span>
              </button>
              {autoExit && !stroking && (
                <span
                  key={idleKey}
                  className={styles.barTimer}
                  style={{ animationDuration: `${AUTO_EXIT_MS}ms` }}
                  aria-hidden="true"
                />
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <p className="sr-only" aria-live="polite">
        {drawing
          ? `Drawing with ${chalkTool} chalk. ${
              autoExit
                ? 'Use two fingers to scroll. Drawing ends after 6 seconds without a stroke.'
                : 'Press Escape when done, Control or Command Z to undo.'
            }`
          : notice}
      </p>
    </>
  );
}
