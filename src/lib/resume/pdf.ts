// Lazy pdf.js loader + a small document cache shared by the clipboard preview and the full viewer.
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

type PdfJs = typeof import('pdfjs-dist');

let libPromise: Promise<PdfJs> | null = null;

/** Loads pdf.js (and points it at its worker) the first time it is needed. */
export function loadPdfjs(): Promise<PdfJs> {
  if (!libPromise) {
    libPromise = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      .then(([lib, worker]) => {
        lib.GlobalWorkerOptions.workerSrc = worker.default;
        return lib;
      })
      .catch((e) => {
        libPromise = null;
        throw e;
      });
  }
  return libPromise;
}

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  bytes: number;
  destroy: () => Promise<void>;
}

const cache = new Map<string, Promise<LoadedPdf>>();
const MAX_DOCS = 3;

/** Fetches the PDF bytes ourselves (works for blob:, same-origin and public storage URLs alike). */
export function openPdf(url: string): Promise<LoadedPdf> {
  const hit = cache.get(url);
  if (hit) {
    cache.delete(url);
    cache.set(url, hit);
    return hit;
  }
  const p = (async () => {
    const [lib, res] = await Promise.all([loadPdfjs(), fetch(url)]);
    if (!res.ok) throw new Error(`Could not fetch the PDF (HTTP ${res.status}).`);
    const data = new Uint8Array(await res.arrayBuffer());
    const bytes = data.byteLength;
    const task = lib.getDocument({ data, verbosity: lib.VerbosityLevel.ERRORS });
    const doc = await task.promise;
    return { doc, bytes, destroy: () => task.destroy() };
  })();
  p.catch(() => cache.delete(url));
  cache.set(url, p);
  while (cache.size > MAX_DOCS) {
    const [oldUrl, old] = cache.entries().next().value as [string, Promise<LoadedPdf>];
    cache.delete(oldUrl);
    old.then((d) => d.destroy()).catch(() => undefined);
  }
  return p;
}

export function isCancel(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  return name === 'RenderingCancelledException' || name === 'AbortException';
}

const MAX_CANVAS_PIXELS = 14_000_000;

export interface RenderJob {
  promise: Promise<{ width: number; height: number }>;
  cancel: () => void;
}

/**
 * Renders `pageNumber` so it is `cssWidth` CSS pixels wide, crisp at the device pixel ratio.
 * Draws into an offscreen canvas first and then blits, so the visible canvas never flashes blank.
 */
export function renderPageInto(doc: PDFDocumentProxy, pageNumber: number, target: HTMLCanvasElement, cssWidth: number): RenderJob {
  let task: RenderTask | null = null;
  let cancelled = false;
  const promise = (async () => {
    const page: PDFPageProxy = await doc.getPage(pageNumber);
    if (cancelled) throw Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' });
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let scale = (cssWidth / base.width) * dpr;
    // iOS Safari silently draws nothing on canvases above ~16.7 MP: cap the bitmap, CSS keeps the size.
    const area = base.width * base.height * scale * scale;
    if (area > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / area);
    const viewport = page.getViewport({ scale });
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.floor(viewport.width));
    off.height = Math.max(1, Math.floor(viewport.height));
    task = page.render({ canvas: off, viewport });
    await task.promise;
    if (cancelled) throw Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' });
    target.width = off.width;
    target.height = off.height;
    const ctx = target.getContext('2d');
    ctx?.drawImage(off, 0, 0);
    off.width = off.height = 0; // free the bitmap early
    return { width: base.width, height: base.height };
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

/** Width / height of a page at scale 1 (PDF points). */
export async function pageSize(doc: PDFDocumentProxy, pageNumber: number): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageNumber);
  const v = page.getViewport({ scale: 1 });
  return { width: v.width, height: v.height };
}
