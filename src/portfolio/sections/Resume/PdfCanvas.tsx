import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { isCancel, pageSize, renderPageInto } from '@/lib/resume/pdf';
import { useSettled } from './hooks';
import styles from './PdfCanvas.module.css';

interface Props {
  doc: PDFDocumentProxy;
  pageNumber: number;
  /** CSS width in px. The bitmap re-renders (debounced) whenever it changes. */
  width: number;
  /** Adds the page's text for screen readers. */
  withText?: boolean;
  className?: string;
  onRatio?: (heightOverWidth: number) => void;
}

/** One PDF page on a <canvas>, crisp at devicePixelRatio, with a shimmer until the first paint. */
export function PdfCanvas({ doc, pageNumber, width, withText, className, onRatio }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [painted, setPainted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  // Resize immediately the first time, then debounce while the user drags the window / zooms.
  const renderWidth = useSettled(Math.round(width), 160, (prev) => prev <= 0);

  useEffect(() => {
    let alive = true;
    pageSize(doc, pageNumber)
      .then((s) => {
        if (!alive) return;
        setRatio(s.height / s.width);
        onRatio?.(s.height / s.width);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || renderWidth <= 0) return;
    const job = renderPageInto(doc, pageNumber, canvas, renderWidth);
    job.promise
      .then(() => {
        setPainted(true);
        setFailed(false);
      })
      .catch((e) => {
        if (!isCancel(e)) {
          console.warn('[resume] page render failed', e);
          setFailed(true);
        }
      });
    return job.cancel;
  }, [doc, pageNumber, renderWidth]);

  useEffect(() => {
    if (!withText) return;
    let alive = true;
    doc
      .getPage(pageNumber)
      .then((p) => p.getTextContent())
      .then((tc) => {
        if (!alive) return;
        const str = tc.items
          .map((it) => ('str' in it ? `${it.str}${it.hasEOL ? '\n' : ''}` : ''))
          .join('')
          .replace(/[ \t]+/g, ' ')
          .trim();
        setText(str);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [doc, pageNumber, withText]);

  return (
    <div
      className={[styles.page, className].filter(Boolean).join(' ')}
      style={{ width: width || '100%', aspectRatio: ratio ? `1 / ${ratio}` : '8.5 / 11' }}
    >
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={`Resume, page ${pageNumber} of ${doc.numPages}`} />
      {!painted && <Shimmer />}
      {failed && !painted && <p className={styles.failed}>Couldn't draw this page.</p>}
      {withText && text && <div className="sr-only">{text}</div>}
    </div>
  );
}

/** Skeleton "page" with a soft moving sheen. */
export function Shimmer({ label = 'Loading resume…' }: { label?: string }) {
  return (
    <div className={styles.shimmer} role="status" aria-label={label}>
      <span className={styles.skTitle} />
      <span className={styles.skSub} />
      {Array.from({ length: 4 }, (_, s) => (
        <div key={s} className={styles.skBlock}>
          <span className={styles.skHead} />
          <span />
          <span />
          <span style={{ width: '72%' }} />
        </div>
      ))}
    </div>
  );
}
