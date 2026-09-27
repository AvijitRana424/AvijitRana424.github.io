import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  LayoutGroup,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { Menu } from 'lucide-react';
import { profile } from '@/data/profile';
import { SECTIONS, scrollToSection } from '@/portfolio/sections';
import { usePortfolioUI } from '@/portfolio/uiState';
import { Button } from '@/ui';
import { Cat } from './Cat';
import { MobileMenu } from './MobileMenu';
import { toNavId, useActiveSection } from './useActiveSection';
import styles from './Nav.module.css';

const NAV_ITEMS = SECTIONS.filter((s) => s.inNav);
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Extra lift when tucked so the frame's drop shadow and a swaying corner clear the viewport edge too. */
const TUCK_CLEARANCE = 64;

/**
 * Hanging chalkboard sign nav. Two strings hold a wood-framed board at the top of the viewport; the sign
 * sways with scroll velocity (spring pendulum), compacts after the hero, tucks fully out of view on a fast
 * downward scroll and drops back on scroll up (or as soon as anything inside it gets focus). A chalk cat sits on top.
 */
export default function Nav() {
  const reduce = useReducedMotion();
  const { setConnectOpen, setPaletteOpen } = usePortfolioUI();
  const navActive = toNavId(useActiveSection());

  const [compact, setCompact] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hangerH, setHangerH] = useState(72);
  const hangerRef = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0); // suppress tucking while a nav click is smooth-scrolling
  const focusInside = useRef(false);
  const last = useRef({ y: 0, t: 0, v: 0 });
  const settle = useRef<number | undefined>(undefined);

  // ── sway: a spring "pendulum" driven by scroll velocity ─────────────────────
  const { scrollY } = useScroll();
  const swayTarget = useMotionValue(0);
  const sway = useSpring(swayTarget, { stiffness: 150, damping: 5.5, mass: 0.9 });
  const swayX = useTransform(sway, (v) => v * 2.2); // strings also drift a little sideways
  // pointer tilt: the sign leans toward the cursor a touch (mouse only)
  const hoverX = useSpring(0, { stiffness: 180, damping: 18 });
  const hoverY = useSpring(0, { stiffness: 180, damping: 18 });
  // the board tips back when it swings, plus the hover lean
  const tiltX = useTransform([sway, hoverX] as never, ([s, h]: number[]) => -Math.abs(s) * 2.4 + h);
  const onSignMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    hoverY.set(((e.clientX - r.left) / r.width - 0.5) * 5);
    hoverX.set(-((e.clientY - r.top) / r.height - 0.5) * 7);
  };
  const onSignLeave = () => {
    hoverX.set(0);
    hoverY.set(0);
  };

  useMotionValueEvent(scrollY, 'change', (y) => {
    const now = performance.now();
    const gap = now - last.current.t;
    // first event after idle (or a single big jump, e.g. End / PageDown) counts as one frame
    const dt = gap > 120 ? 16 : Math.max(gap, 8);
    const dy = y - last.current.y;
    const prevV = gap > 120 ? 0 : last.current.v;
    const v = prevV * 0.55 + ((dy / dt) * 1000) * 0.45; // smoothed px/s
    last.current = { y, t: now, v };

    setCompact(y > 56);

    if (!reduce) {
      swayTarget.set(clamp(-v / 1100, -3.2, 3.2));
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => swayTarget.set(0), 90);
    }

    // reduced-motion users get a sign that simply stays put
    if (reduce || y < 160 || now < lockUntil.current || focusInside.current) setHidden(false);
    else if (dy > 0 && v > 1300) setHidden(true);
    else if (dy < -4) setHidden(false);
  });

  useEffect(() => () => window.clearTimeout(settle.current), []);

  // the sheet is mobile-only: close it if the viewport grows past the breakpoint
  useEffect(() => {
    if (!menuOpen) return;
    const mq = window.matchMedia('(min-width: 760px)');
    const onChange = () => mq.matches && setMenuOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [menuOpen]);

  useLayoutEffect(() => {
    const el = hangerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHangerH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = useCallback((id: string) => {
    lockUntil.current = performance.now() + 1400;
    setHidden(false);
    scrollToSection(id);
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menuNavigate = useCallback(
    (id: string) => {
      setMenuOpen(false);
      // wait for the sheet's scroll-lock to release before scrolling
      window.setTimeout(() => go(id), 60);
    },
    [go],
  );

  const tuck = hidden && !menuOpen;

  return (
    <header className={styles.header}>
      <motion.div
        ref={hangerRef}
        className={styles.hanger}
        style={reduce ? undefined : { rotate: sway, x: swayX, rotateX: tiltX, rotateY: hoverY }}
        initial={reduce ? false : { y: -120 }}
        animate={{ y: tuck ? -(hangerH + TUCK_CLEARANCE) : 0 }}
        data-tucked={tuck || undefined}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: tuck ? 30 : 18, mass: 0.9 }}
        onFocusCapture={(e) => {
          // keyboard focus keeps the sign down; a lingering focus from a tap/click must not pin it open
          let visible = true;
          try {
            visible = (e.target as HTMLElement).matches(':focus-visible');
          } catch {
            /* :focus-visible unsupported: treat all focus as keyboard focus */
          }
          focusInside.current = visible;
          if (visible) setHidden(false);
        }}
        onBlurCapture={() => {
          focusInside.current = false;
        }}
      >
        <span className={`${styles.string} ${styles.stringL}`} aria-hidden="true" />
        <span className={`${styles.string} ${styles.stringR}`} aria-hidden="true" />

        <div
          className={[styles.sign, compact && styles.compact].filter(Boolean).join(' ')}
          onPointerMove={onSignMove}
          onPointerLeave={onSignLeave}
        >
          <span className={`${styles.nail} ${styles.nailL}`} aria-hidden="true" />
          <span className={`${styles.nail} ${styles.nailR}`} aria-hidden="true" />
          <Cat className={styles.signCat} paused={tuck} />

          <div className={styles.board}>
            <a
              href="#about"
              className={styles.brand}
              aria-label={`${profile.name}, back to top`}
              onClick={(e) => {
                e.preventDefault();
                go('about');
              }}
            >
              <span className={styles.brandMark}>{profile.initials}</span>
            </a>

            <span className={styles.divider} aria-hidden="true" />

            <nav aria-label="Primary" className={styles.desktopNav}>
              <LayoutGroup id="nav-underline">
                <ul className={styles.list}>
                  {NAV_ITEMS.map((s) => {
                    const on = navActive === s.id;
                    return (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className={styles.link}
                          aria-current={on ? 'true' : undefined}
                          onClick={(e) => {
                            e.preventDefault();
                            go(s.id);
                          }}
                        >
                          <span className={styles.linkText}>{s.label.toLowerCase()}</span>
                          {on && (
                            <motion.span
                              layoutId="nav-underline"
                              className={styles.underline}
                              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                              aria-hidden="true"
                            >
                              <svg viewBox="0 0 100 10" preserveAspectRatio="none">
                                <path d="M2 6.2 C 18 3, 36 8.6, 56 5.2 S 86 3.6, 98 6.4" />
                              </svg>
                            </motion.span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </LayoutGroup>
            </nav>

            <Button variant="marker" size="sm" className={styles.connect} onClick={() => setConnectOpen(true)}>
              connect
            </Button>

            <button
              type="button"
              className={styles.kbd}
              data-cmdk-home=""
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
              title={`Command palette (${isMac ? '⌘' : 'Ctrl+'}K)`}
            >
              <kbd>{isMac ? '⌘' : 'ctrl'}</kbd>
              <kbd>K</kbd>
            </button>

            <button
              type="button"
              className={styles.burger}
              data-cmdk-home=""
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen(true)}
            >
              <span className={styles.burgerLabel}>menu</span>
              <Menu size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </motion.div>

      <MobileMenu
        open={menuOpen}
        onClose={closeMenu}
        active={navActive}
        onNavigate={menuNavigate}
        onConnect={() => {
          setMenuOpen(false);
          window.setTimeout(() => setConnectOpen(true), 120);
        }}
        onSearch={() => {
          setMenuOpen(false);
          window.setTimeout(() => setPaletteOpen(true), 120);
        }}
      />
    </header>
  );
}
