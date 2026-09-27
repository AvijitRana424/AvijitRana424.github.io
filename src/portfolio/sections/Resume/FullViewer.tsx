import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AlignLeft, Download, ExternalLink, FileText, Minus, Plus, Printer } from 'lucide-react';
import { Button, LinkButton, Modal } from '@/ui';
import { pageSize } from '@/lib/resume/pdf';
import { FitPage, HtmlResume, PAGE_W } from './HtmlResume';
import { PdfCanvas } from './PdfCanvas';
import { useElementWidth, useMediaQuery } from './hooks';
import styles from './FullViewer.module.css';

/** Page zoom stops, as a share of the page's real size (1 = 100%). "Fit width" slots in between. */
const PAGE_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const PAGE_MAX = 3;
/** Text-size stops for the reading layout (1 = 16px body). */
const TEXT_STEPS = [0.85, 1, 1.15, 1.3, 1.5, 1.75];
const TEXT_BASE_PX = 16;
const EPS = 0.005;

type View = 'text' | 'page';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  doc: PDFDocumentProxy | null;
  /** Download link for PDFs; for the HTML edition pass onPrint instead. */
  downloadUrl?: string;
  downloadName?: string;
  /** The PDF itself, opened in a new tab (phones hand it to their native viewer). */
  openUrl?: string;
  onPrint?: () => void;
}

/**
 * Fullscreen reader. PDFs: every page stacked, fit-to-width by default, −/+ / pinch / ctrl+wheel zoom.
 * The HTML edition also has a reflowing "Text" layout, the default on phones, where a scaled Letter
 * page would be ~5px type.
 */
export function FullViewer({ open, onClose, title, doc, downloadUrl, downloadName, openUrl, onPrint }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} tone="board" width={1080} className={styles.panel}>
      <ViewerBody doc={doc} downloadUrl={downloadUrl} downloadName={downloadName} openUrl={openUrl} onPrint={onPrint} />
    </Modal>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Next stop above / below `cur` from `stops` (plus the extra `fit` stop), clamped to [lo, hi]. */
function step(cur: number, dir: 1 | -1, stops: number[], lo: number, hi: number, fit?: number): number {
  const all = [...stops, ...(fit ? [fit] : [])].filter((s) => s >= lo - EPS && s <= hi + EPS).sort((a, b) => a - b);
  const next = dir > 0 ? all.find((s) => s > cur + EPS) : [...all].reverse().find((s) => s < cur - EPS);
  return next ?? (dir > 0 ? hi : lo);
}

interface Anchor {
  /** point inside the pages element (old layout, CSS px) */
  px: number;
  py: number;
  /** the same point relative to the scroller's viewport */
  ax: number;
  ay: number;
  /** old pages size, to derive the scale factor after layout */
  w: number;
  h: number;
}

function ViewerBody({ doc, downloadUrl, downloadName, openUrl, onPrint }: Omit<Props, 'open' | 'onClose' | 'title'>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const avail = useElementWidth(measureRef);
  const narrow = useMediaQuery('(max-width: 600px)');
  const isHtml = !doc;

  // Phones read the HTML edition as reflowing text; the Letter page stays one tap away.
  const [view, setView] = useState<View>(() => (isHtml && narrow ? 'text' : 'page'));
  const activeView: View = isHtml ? view : 'page';

  // ── page view zoom (absolute scale; 'fit' follows the available width) ──
  const [natural, setNatural] = useState(PAGE_W);
  useEffect(() => {
    if (!doc) {
      setNatural(PAGE_W);
      return;
    }
    let alive = true;
    pageSize(doc, 1)
      .then((s) => alive && setNatural(Math.max(100, (s.width * 96) / 72)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [doc]);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const fitWidth = clamp(avail || 320, 200, 920); // never absurdly wide on big screens
  const fitScale = fitWidth / natural;
  const pageMin = Math.min(0.5, fitScale);
  const pageScale = zoom === 'fit' ? fitScale : zoom;
  const pageWidth = Math.round(natural * pageScale);

  // ── text view size ──
  const [textScale, setTextScale] = useState(1);

  const scale = activeView === 'text' ? textScale : pageScale;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const anchorRef = useRef<Anchor | null>(null);

  /** Anchor = the scroller point that should stay put (defaults to the viewport centre). */
  const captureAnchor = useCallback((clientX?: number, clientY?: number): Anchor | null => {
    const sc = scrollRef.current;
    const pg = pagesRef.current;
    if (!sc || !pg) return null;
    const r = sc.getBoundingClientRect();
    const ax = clientX === undefined ? sc.clientWidth / 2 : clientX - r.left;
    // buttons / keys zoom around the centre, except at the very top, where the top stays put
    const ay = clientY === undefined ? (sc.scrollTop < 4 ? 0 : sc.clientHeight / 2) : clientY - r.top;
    return {
      px: sc.scrollLeft + ax - pg.offsetLeft,
      py: sc.scrollTop + ay - pg.offsetTop,
      ax,
      ay,
      w: pg.offsetWidth,
      h: pg.offsetHeight,
    };
  }, []);

  const applyScale = useCallback(
    (next: number, anchor: Anchor | null) => {
      if (activeView === 'text') {
        const v = clamp(next, TEXT_STEPS[0], TEXT_STEPS[TEXT_STEPS.length - 1]);
        if (Math.abs(v - scaleRef.current) < EPS) return;
        anchorRef.current = anchor;
        setTextScale(v);
      } else {
        const v = clamp(next, pageMin, PAGE_MAX);
        if (Math.abs(v - scaleRef.current) < EPS) return;
        anchorRef.current = anchor;
        setZoom(Math.abs(v - fitScale) < EPS ? 'fit' : v);
      }
    },
    [activeView, pageMin, fitScale],
  );

  // After a zoom, scroll so the anchored point is still under the fingers / cursor / centre.
  useLayoutEffect(() => {
    const a = anchorRef.current;
    const sc = scrollRef.current;
    const pg = pagesRef.current;
    anchorRef.current = null;
    if (!a || !sc || !pg) return;
    const kx = a.w ? pg.offsetWidth / a.w : 1;
    const ky = a.h ? pg.offsetHeight / a.h : 1;
    sc.scrollLeft = pg.offsetLeft + a.px * kx - a.ax;
    sc.scrollTop = pg.offsetTop + a.py * ky - a.ay;
  }, [pageWidth, textScale]);

  // Open (and switch layouts) at the top of page 1.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [activeView, doc]);

  const zoomBy = (dir: 1 | -1) => {
    const next =
      activeView === 'text'
        ? step(textScale, dir, TEXT_STEPS, TEXT_STEPS[0], TEXT_STEPS[TEXT_STEPS.length - 1])
        : step(pageScale, dir, PAGE_STEPS, pageMin, PAGE_MAX, fitScale);
    applyScale(next, captureAnchor());
  };
  const reset = () => applyScale(activeView === 'text' ? 1 : fitScale, captureAnchor());

  // Keyboard: + / − / 0 while the viewer is open.
  const keyRef = useRef({ zoomBy, reset });
  keyRef.current = { zoomBy, reset };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') keyRef.current.zoomBy(1);
      else if (e.key === '-' || e.key === '_') keyRef.current.zoomBy(-1);
      else if (e.key === '0') keyRef.current.reset();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Pinch (touch), ctrl/⌘ + wheel and trackpad pinch (Chrome/Edge/Firefox send ctrl+wheel; Safari sends gesture*).
  // While the gesture runs, the pages are scaled with a CSS transform; the real re-layout happens once at the end.
  const applyRef = useRef({ applyScale, captureAnchor });
  applyRef.current = { applyScale, captureAnchor };
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    let g: { anchor: Anchor; start: number; ratio: number } | null = null;

    const preview = (ratio: number) => {
      const pg = pagesRef.current;
      if (!g || !pg) return;
      g.ratio = ratio;
      pg.style.transformOrigin = `${g.anchor.px}px ${g.anchor.py}px`;
      pg.style.transform = `scale(${ratio})`;
    };
    const begin = (x: number, y: number) => {
      const anchor = applyRef.current.captureAnchor(x, y);
      if (anchor) g = { anchor, start: scaleRef.current, ratio: 1 };
    };
    const end = () => {
      const pg = pagesRef.current;
      if (pg) {
        pg.style.transform = '';
        pg.style.transformOrigin = '';
      }
      if (g && Math.abs(g.ratio - 1) > 0.01) applyRef.current.applyScale(g.start * g.ratio, g.anchor);
      g = null;
    };

    // touch pinch
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    let startDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      startDist = dist(e.touches) || 1;
      begin((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!g || e.touches.length !== 2) return;
      e.preventDefault(); // this gesture is ours: no native scroll while pinching
      preview(dist(e.touches) / startDist);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (g && e.touches.length < 2) end();
    };

    // ctrl/⌘ + wheel (also what trackpad pinch looks like in Chromium / Firefox)
    let wheelTimer = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (!g) begin(e.clientX, e.clientY);
      if (!g) return;
      preview(clamp(g.ratio * Math.exp(-e.deltaY * 0.01), 0.2, 5));
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(end, 140);
    };

    // desktop Safari trackpad pinch (touch devices use the touch handlers above)
    type GestureEvt = Event & { scale: number; clientX: number; clientY: number };
    const touchDevice = 'ontouchstart' in window;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      if (!touchDevice) begin((e as GestureEvt).clientX, (e as GestureEvt).clientY);
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (!touchDevice) preview((e as GestureEvt).scale);
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      if (!touchDevice) end();
    };

    sc.addEventListener('touchstart', onTouchStart, { passive: true });
    sc.addEventListener('touchmove', onTouchMove, { passive: false });
    sc.addEventListener('touchend', onTouchEnd);
    sc.addEventListener('touchcancel', onTouchEnd);
    sc.addEventListener('wheel', onWheel, { passive: false });
    sc.addEventListener('gesturestart', onGestureStart);
    sc.addEventListener('gesturechange', onGestureChange);
    sc.addEventListener('gestureend', onGestureEnd);
    return () => {
      window.clearTimeout(wheelTimer);
      sc.removeEventListener('touchstart', onTouchStart);
      sc.removeEventListener('touchmove', onTouchMove);
      sc.removeEventListener('touchend', onTouchEnd);
      sc.removeEventListener('touchcancel', onTouchEnd);
      sc.removeEventListener('wheel', onWheel);
      sc.removeEventListener('gesturestart', onGestureStart);
      sc.removeEventListener('gesturechange', onGestureChange);
      sc.removeEventListener('gestureend', onGestureEnd);
    };
  }, []);

  // ── toolbar state ──
  const isText = activeView === 'text';
  const atDefault = isText ? Math.abs(textScale - 1) < EPS : zoom === 'fit';
  const label = isText ? pct(textScale) : zoom === 'fit' ? 'Fit' : pct(pageScale);
  const canOut = isText ? textScale > TEXT_STEPS[0] + EPS : pageScale > pageMin + EPS;
  const canIn = isText ? textScale < TEXT_STEPS[TEXT_STEPS.length - 1] - EPS : pageScale < PAGE_MAX - EPS;
  const what = isText ? 'text size' : 'zoom';
  const spoken = isText ? `Text size ${label}` : zoom === 'fit' ? 'Zoom: fit to width' : `Zoom ${label}`;
  const pages = doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : [1];

  const zoomControls = (
    <div className={styles.zoom} role="group" aria-label={isText ? 'Text size' : 'Zoom'}>
      <button type="button" className={styles.zBtn} onClick={() => zoomBy(-1)} disabled={!canOut} aria-label={isText ? 'Smaller text' : 'Zoom out'}>
        <Minus size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.zVal}
        onClick={reset}
        aria-label={atDefault ? spoken : `${spoken}. Reset ${what}`}
        title={atDefault ? undefined : isText ? 'Reset text size' : 'Back to fit width'}
        data-default={atDefault || undefined}
      >
        {label}
      </button>
      <button type="button" className={styles.zBtn} onClick={() => zoomBy(1)} disabled={!canIn} aria-label={isText ? 'Larger text' : 'Zoom in'}>
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className={styles.body}>
      <div className={styles.toolbar} role="toolbar" aria-label="Viewer controls">
        {isHtml ? (
          <div className={styles.views} role="group" aria-label="Layout">
            <button type="button" className={styles.viewBtn} aria-pressed={view === 'text'} onClick={() => setView('text')}>
              <AlignLeft size={16} aria-hidden="true" />
              <span>Text</span>
            </button>
            <button type="button" className={styles.viewBtn} aria-pressed={view === 'page'} onClick={() => setView('page')}>
              <FileText size={16} aria-hidden="true" />
              <span>Page</span>
            </button>
          </div>
        ) : (
          <span className={styles.count}>
            {doc.numPages} page{doc.numPages === 1 ? '' : 's'}
          </span>
        )}

        {!narrow && zoomControls}
        <span className="sr-only" aria-live="polite">
          {spoken}
        </span>

        <div className={styles.spacer} />
        {openUrl && (
          <a className={styles.iconLink} href={openUrl} target="_blank" rel="noreferrer" aria-label="Open the PDF in a new tab" title="Open the PDF in a new tab">
            <ExternalLink size={17} aria-hidden="true" />
          </a>
        )}
        {downloadUrl ? (
          <LinkButton variant="marker" size="sm" className={styles.action} href={downloadUrl} download={downloadName} icon={<Download />} aria-label="Download PDF">
            <span className={styles.wide}>Download</span>
          </LinkButton>
        ) : onPrint ? (
          <Button variant="marker" size="sm" className={styles.action} onClick={onPrint} icon={<Printer />} aria-label="Save as PDF or print">
            <span className={styles.wide}>Save as PDF</span>
          </Button>
        ) : null}
      </div>

      <div className={styles.scroller} ref={scrollRef} tabIndex={0} aria-label="Resume" data-view={activeView}>
        <div ref={measureRef} className={styles.measure} aria-hidden="true" />
        {isText ? (
          <div ref={pagesRef} className={styles.flowPage} style={{ ['--rs-text' as string]: `${TEXT_BASE_PX * textScale}px` }}>
            <HtmlResume interactive layout="flow" />
          </div>
        ) : (
          <div ref={pagesRef} className={styles.pages} style={{ width: pageWidth }}>
            {doc
              ? pages.map((n) => (
                  <div key={n} className={styles.pageWrap}>
                    <PdfCanvas doc={doc} pageNumber={n} width={pageWidth} withText />
                    <span className={styles.pageLabel} aria-hidden="true">
                      {n} / {doc.numPages}
                    </span>
                  </div>
                ))
              : (
                  <div className={styles.pageWrap}>
                    <FitPage width={pageWidth}>
                      <HtmlResume interactive />
                    </FitPage>
                  </div>
                )}
          </div>
        )}
      </div>
      {/* phones: the zoom pill floats over the pages, thumb-reachable, and the toolbar stays one row */}
      {narrow && <div className={styles.floatZoom}>{zoomControls}</div>}
    </div>
  );
}
