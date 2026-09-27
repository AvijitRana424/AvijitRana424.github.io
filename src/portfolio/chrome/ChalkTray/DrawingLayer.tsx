import { useEffect, useRef, type PointerEvent as RPointerEvent, type RefObject } from 'react';
import type { ChalkTool } from '@/portfolio/uiState';
import {
  ERASER_W,
  WIPE_MS,
  enforceBudget,
  eraserX,
  loadStrokes,
  makePainter,
  paintStrokes,
  readChalkColors,
  saveStrokes,
  wipeEase,
  type ChalkColor,
  type Painter,
  type Stroke,
} from './strokes';
import styles from './ChalkTray.module.css';

export interface DrawingApi {
  undo: () => void;
}

interface Props {
  tool: ChalkTool;
  setTool: (t: ChalkTool) => void;
  wipeSignal: number;
  reduced: boolean;
  apiRef: RefObject<DrawingApi | null>;
  onCountChange: (n: number) => void;
  /** Called when a stroke starts ('start') and when it ends or is abandoned ('end'). */
  onActivity?: (kind: 'start' | 'end') => void;
}

const isColor = (t: ChalkTool): t is ChalkColor => t === 'white' || t === 'red' || t === 'yellow';

/** Build a small chalk-stick cursor (tip = hotspot) in the given colour. */
function chalkCursor(color: string, outline: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M6 26 L25 7' stroke='${outline}' stroke-width='9' stroke-linecap='round'/><path d='M6 26 L25 7' stroke='${color}' stroke-width='6' stroke-linecap='round'/><path d='M13 19 L25 7' stroke='${outline}' stroke-opacity='.18' stroke-width='6' stroke-linecap='round'/><circle cx='4.5' cy='27.5' r='1.6' fill='${color}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 28, crosshair`;
}

const editable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * Full-viewport chalk canvas (z 40). Strokes live in document space so they scroll
 * with the page; the canvas only repaints when something changed.
 */
export function DrawingLayer({ tool, setTool, wipeSignal, reduced, apiRef, onCountChange, onActivity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const active = useRef<{ id: number; stroke: Stroke } | null>(null);
  const wipe = useRef<{ strokes: Stroke[]; start: number } | null>(null);
  const requestRef = useRef<() => void>(() => {});
  const countCb = useRef(onCountChange);
  countCb.current = onCountChange;
  const activityCb = useRef(onActivity);
  activityCb.current = onActivity;
  /** live touch points (id → client y) — two fingers down = scroll the page, not draw */
  const touches = useRef(new Map<number, number>());
  const pan = useRef<{ y: number; moves: number } | null>(null);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const drawing = isColor(tool);

  // ── engine: canvas sizing + render loop (mount once) ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let painter: Painter = makePainter(ctx);
    let raf = 0;
    let vw = 0;
    let vh = 0;
    let dpr = 1;

    strokes.current = loadStrokes();
    countCb.current(strokes.current.length);

    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      vw = document.documentElement.clientWidth || window.innerWidth;
      vh = window.innerHeight;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
    };

    const frame = (now: number) => {
      raf = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      const ox = vw / 2;
      const oy = -window.scrollY;
      paintStrokes(ctx, painter, strokes.current, ox, oy, vh);
      const w = wipe.current;
      if (w) {
        const p = Math.min(1, (now - w.start) / WIPE_MS);
        const edge = eraserX(wipeEase(p), vw) + ERASER_W * 0.55;
        if (p < 1 && edge > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, edge, vh);
          ctx.clip();
          paintStrokes(ctx, painter, w.strokes, ox, oy, vh, 1 - p * 0.3);
          ctx.restore();
          request();
        } else {
          wipe.current = null;
        }
      }
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    requestRef.current = request;

    size();
    request();

    let resizeRaf = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        size();
        request();
      });
    };
    const onScroll = () => request();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    // colours come from CSS variables; re-read if fonts/styles finished loading late
    const refresh = window.setTimeout(() => {
      const c = readChalkColors();
      if (c.white !== painter.colors.white) {
        painter = makePainter(ctx);
        request();
      }
    }, 1500);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      window.clearTimeout(refresh);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      requestRef.current = () => {};
    };
  }, []);

  // ── undo api ────────────────────────────────────────────────────────────
  useEffect(() => {
    apiRef.current = {
      undo: () => {
        if (active.current) return;
        if (!strokes.current.length) return;
        strokes.current.pop();
        saveStrokes(strokes.current);
        countCb.current(strokes.current.length);
        requestRef.current();
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  // ── wipe ────────────────────────────────────────────────────────────────
  const lastWipe = useRef(wipeSignal);
  useEffect(() => {
    if (wipeSignal === lastWipe.current) return;
    lastWipe.current = wipeSignal;
    const snapshot = strokes.current;
    strokes.current = [];
    active.current = null;
    saveStrokes([]);
    countCb.current(0);
    wipe.current = reduced || !snapshot.length ? null : { strokes: snapshot, start: performance.now() };
    requestRef.current();
  }, [wipeSignal, reduced]);

  // ── keyboard: Esc = done, Cmd/Ctrl+Z = undo (only while drawing) ─────────
  useEffect(() => {
    if (!drawing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTool('none');
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !editable(e.target)) {
        e.preventDefault();
        apiRef.current?.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing, setTool, apiRef]);

  // Leaving drawing mode mid-stroke finalises the stroke.
  useEffect(() => {
    if (drawing) return;
    touches.current.clear();
    pan.current = null;
    if (active.current) {
      active.current = null;
      saveStrokes(strokes.current);
      countCb.current(strokes.current.length);
      activityCb.current?.('end');
    }
  }, [drawing]);

  // ── pointer input ───────────────────────────────────────────────────────
  const toDoc = (clientX: number, clientY: number) => {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    return [clientX - vw / 2, clientY + window.scrollY] as const;
  };

  const avgTouchY = () => {
    let sum = 0;
    touches.current.forEach((y) => (sum += y));
    return sum / Math.max(1, touches.current.size);
  };

  /** Drop the stroke in progress (a second finger landed, or the browser took the gesture). */
  const abandonStroke = () => {
    const a = active.current;
    if (!a) return;
    active.current = null;
    const i = strokes.current.lastIndexOf(a.stroke);
    if (i !== -1) strokes.current.splice(i, 1);
    countCb.current(strokes.current.length);
    activityCb.current?.('end');
    requestRef.current();
  };

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    const t = toolRef.current;
    if (!isColor(t)) return;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, e.clientY);
      if (touches.current.size >= 2) {
        // two-finger gesture → scroll the page (manual fallback for browsers that
        // don't pan natively under touch-action: pinch-zoom)
        e.preventDefault();
        abandonStroke();
        pan.current = { y: avgTouchY(), moves: 0 };
        return;
      }
    }
    if (pan.current || active.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const [x, y] = toDoc(e.clientX, e.clientY);
    const stroke: Stroke = {
      c: t,
      w: e.pointerType === 'touch' ? 4 : 3.6,
      p: [x, y],
      s: Math.random() * 1000,
      minY: y,
      maxY: y,
    };
    strokes.current.push(stroke);
    active.current = { id: e.pointerId, stroke };
    activityCb.current?.('start');
    requestRef.current();
  };

  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, e.clientY);
      const p = pan.current;
      if (p) {
        const y = avgTouchY();
        const dy = p.y - y;
        p.y = y;
        // wait a couple of moves: if the browser pans natively it cancels the pointers first
        if (++p.moves > 2 && dy) window.scrollBy(0, dy);
        return;
      }
    }
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    const native = e.nativeEvent;
    const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    const list = events.length ? events : [native];
    const s = a.stroke;
    for (const ev of list) {
      const [x, y] = toDoc(ev.clientX, ev.clientY);
      const lx = s.p[s.p.length - 2];
      const ly = s.p[s.p.length - 1];
      if ((x - lx) * (x - lx) + (y - ly) * (y - ly) < 2.6) continue;
      s.p.push(x, y);
      if (y < s.minY) s.minY = y;
      if (y > s.maxY) s.maxY = y;
    }
    requestRef.current();
  };

  const releaseTouch = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'touch') return;
    touches.current.delete(e.pointerId);
    // stay in pan mode until every finger is up, so the last finger doesn't start a stroke
    if (!touches.current.size) pan.current = null;
    else if (pan.current) pan.current.y = avgTouchY();
  };

  const onUp = (e: RPointerEvent<HTMLCanvasElement>) => {
    releaseTouch(e);
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    active.current = null;
    enforceBudget(strokes.current);
    saveStrokes(strokes.current);
    countCb.current(strokes.current.length);
    activityCb.current?.('end');
    requestRef.current();
  };

  const onCancel = (e: RPointerEvent<HTMLCanvasElement>) => {
    releaseTouch(e);
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    // the browser claimed the gesture (e.g. a native two-finger pan / pinch)
    if (e.pointerType === 'touch') abandonStroke();
    else onUp(e);
  };

  const colors = drawing ? readChalkColors() : null;
  const cursor =
    drawing && colors
      ? chalkCursor(colors[tool], getComputedStyle(document.documentElement).getPropertyValue('--board').trim() || '#1b1b1a')
      : undefined;

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      data-drawing={drawing || undefined}
      data-board-decor=""
      style={{ cursor }}
      aria-hidden="true"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onLostPointerCapture={onUp}
    />
  );
}
