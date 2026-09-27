import { lazy, startTransition, Suspense, useEffect, useRef, useState, type ComponentType, type LazyExoticComponent } from 'react';
import type React from 'react';
import { ErrorBoundary } from '@/ui';

// Every section / chrome piece is lazy + isolated so one failure never blanks the page.
const Sections: Record<string, LazyExoticComponent<ComponentType>> = {
  hero: lazy(() => import('./sections/Hero')),
  lately: lazy(() => import('./sections/Lately')),
  experience: lazy(() => import('./sections/Experience')),
  skills: lazy(() => import('./sections/Skills')),
  projects: lazy(() => import('./sections/Projects')),
  resume: lazy(() => import('./sections/Resume')),
  footer: lazy(() => import('./sections/Footer')),
};

const Chrome: Record<string, LazyExoticComponent<ComponentType>> = {
  background: lazy(() => import('./chrome/Background')),
  nav: lazy(() => import('./chrome/Nav')),
  chalk: lazy(() => import('./chrome/ChalkTray')),
  stickers: lazy(() => import('./chrome/Stickers')),
  connect: lazy(() => import('./chrome/ConnectModal')),
  palette: lazy(() => import('./chrome/CommandPalette')),
};

const ORDER = ['hero', 'lately', 'experience', 'skills', 'projects', 'resume', 'footer'];

/** Dev helpers: ?only=projects renders a single section; ?nochrome hides nav/overlays. */
function readParams() {
  const p = new URLSearchParams(window.location.search);
  return { only: p.get('only'), noChrome: p.has('nochrome') };
}

function Slot({ name, C, minHeight = 0 }: { name: string; C: LazyExoticComponent<ComponentType>; minHeight?: number }) {
  return (
    <ErrorBoundary name={name}>
      <Suspense fallback={minHeight ? <div style={{ minHeight }} /> : null}>
        <C />
      </Suspense>
    </ErrorBoundary>
  );
}

/** Pause decorative CSS loops in sections that are far off-screen (see [data-offscreen] in global.css). */
function useOffscreenPausing(containers: React.RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) e.target.removeAttribute('data-offscreen');
          else e.target.setAttribute('data-offscreen', '');
        }
      },
      { rootMargin: '300px 0px' },
    );
    const seen = new WeakSet<Element>();
    const attach = () => {
      for (const c of containers) {
        c.current?.querySelectorAll(':scope > section').forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el);
            io.observe(el);
          }
        });
      }
    };
    attach();
    const mo = new MutationObserver(attach);
    for (const c of containers) if (c.current) mo.observe(c.current, { childList: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Deep links (/#projects): sections mount asynchronously, so scroll once the target exists. */
function useHashScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 40) {
        window.clearInterval(timer);
        // give lazy sections above the target a moment to take their real height
        if (el) window.setTimeout(() => el.scrollIntoView({ block: 'start' }), 350);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [enabled]);
}

export function App() {
  const { only, noChrome } = readParams();
  const list = only ? ORDER.filter((k) => k === only) : ORDER;
  const mainRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  // Stage 1 = nav + hero (first paint). Everything below mounts right after, in a transition,
  // so the first frame isn't one giant render. Deep links mount everything immediately.
  const [rest, setRest] = useState(() => !!only || !!window.location.hash);
  useEffect(() => {
    if (rest) return;
    const id = window.setTimeout(() => startTransition(() => setRest(true)), 60);
    return () => window.clearTimeout(id);
  }, [rest]);
  useOffscreenPausing([mainRef, footerRef]);
  useHashScroll(rest && !only);

  const mainList = list.filter((k) => k !== 'footer' && (rest || k === 'hero'));
  const showFooter = list.includes('footer') && rest;

  return (
    <>
      {!noChrome && (
        <a className="skip-link" href="#main" onClick={() => mainRef.current?.focus()}>
          Skip to content
        </a>
      )}
      <Slot name="background" C={Chrome.background} />
      <div className="board-texture" aria-hidden="true" />
      {!noChrome && <Slot name="nav" C={Chrome.nav} />}
      <main id="main" ref={mainRef} tabIndex={-1} style={{ position: 'relative', zIndex: 1, outline: 'none' }}>
        {mainList.map((k) => (
          <Slot key={k} name={k} C={Sections[k]} minHeight={k === 'hero' ? 700 : 400} />
        ))}
      </main>
      <footer ref={footerRef} style={{ position: 'relative', zIndex: 1 }}>
        {showFooter && <Slot name="footer" C={Sections.footer} minHeight={400} />}
      </footer>
      {!noChrome && rest && (
        <>
          <Slot name="stickers" C={Chrome.stickers} />
          <Slot name="chalk" C={Chrome.chalk} />
          <Slot name="connect" C={Chrome.connect} />
          <Slot name="palette" C={Chrome.palette} />
        </>
      )}
    </>
  );
}
