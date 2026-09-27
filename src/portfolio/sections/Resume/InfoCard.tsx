import type { ReactNode } from 'react';
import { Download, Eye, FileText, Link2, Maximize2, Printer, Undo2, Star } from 'lucide-react';
import { Button, LinkButton, Paper } from '@/ui';
import { formatBytes } from '@/lib/resumeStore';
import type { ResumeVersion } from '@/lib/types';
import { formatDay, relativeTime, useNow } from './hooks';
import styles from './InfoCard.module.css';

export interface ShownResume {
  url: string;
  downloadUrl: string;
  shareUrl: string | null;
  fileName: string;
  uploadedAt: string | null;
  version: ResumeVersion | null;
  source: 'supabase' | 'demo' | 'static';
  isPreview: boolean;
}

interface Props {
  shown: ShownResume | null;
  /** 'loading' until we know what to show; 'html' = no PDF, web edition. */
  mode: 'loading' | 'pdf' | 'html' | 'error';
  pages: number | null;
  bytes: number | null;
  downloadName: string;
  onOpen: () => void;
  onCopy: () => void;
  onPrint: () => void;
  onMakeCurrent?: () => void;
  onExitPreview?: () => void;
  busy?: boolean;
}

/** When the site was published (the web edition is rebuilt from the site's data on every deploy). */
function siteUpdatedIso(): string | null {
  const t = Date.parse(document.lastModified);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const WEEK = 7 * 86_400_000;

export function InfoCard({ shown, mode, pages, bytes, downloadName, onOpen, onCopy, onPrint, onMakeCurrent, onExitPreview, busy }: Props) {
  const now = useNow();
  const isHtml = mode === 'html';
  const loading = mode === 'loading';
  const size = bytes ?? shown?.version?.size_bytes ?? null;
  const title = isHtml ? 'One page, straight from this site' : shown?.version?.label || shown?.fileName;
  const fileNote = !isHtml && shown?.version?.label ? shown.fileName : null;

  // "Updated Sep 12, 2026" (or "3 days ago" while it's fresh) · "2 pages" · "184 KB PDF"
  const updatedIso = isHtml ? siteUpdatedIso() : shown?.uploadedAt ?? null;
  const updatedAt = updatedIso ? Date.parse(updatedIso) : NaN;
  const updatedText = !Number.isFinite(updatedAt)
    ? null
    : isHtml
      ? formatDay(updatedIso, { day: false })
      : now - updatedAt < WEEK
        ? relativeTime(updatedIso, now)
        : formatDay(updatedIso);
  const pageCount = isHtml ? 1 : pages;
  const facts: { key: string; node: ReactNode }[] = [];
  if (updatedText && updatedIso)
    facts.push({
      key: 'updated',
      node: (
        <>
          Updated{' '}
          <time dateTime={updatedIso} title={new Date(updatedIso).toLocaleString()}>
            {updatedText}
          </time>
        </>
      ),
    });
  if (pageCount) facts.push({ key: 'pages', node: `${pageCount} page${pageCount === 1 ? '' : 's'}` });
  facts.push({ key: 'format', node: isHtml ? 'PDF available' : size ? `${formatBytes(size)} PDF` : 'PDF' });

  return (
    <Paper tape="top" tilt={1.1} className={styles.card}>
      {shown?.isPreview && (
        <div className={styles.previewBar} role="status">
          <Eye size={16} aria-hidden="true" />
          <span>
            Previewing an older version. <strong>Visitors still see the current one.</strong>
          </span>
          <div className={styles.previewActions}>
            {onMakeCurrent && (
              <Button variant="ink" size="sm" onClick={onMakeCurrent} icon={<Star />} loading={busy}>
                Make current
              </Button>
            )}
            {onExitPreview && (
              <Button variant="ghost" size="sm" className={styles.quiet} onClick={onExitPreview} icon={<Undo2 />}>
                Back to current
              </Button>
            )}
          </div>
        </div>
      )}

      <p className={styles.eyebrow}>{isHtml ? 'the web edition' : 'the pdf'}</p>

      {loading ? (
        <div className={styles.skeleton} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <div className={styles.fileRow}>
            <span className={styles.fileIcon} aria-hidden="true">
              <FileText size={20} />
            </span>
            <div className={styles.fileText}>
              <h3 className={styles.fileName} title={isHtml ? undefined : shown?.fileName}>
                {title}
              </h3>
              {fileNote && <p className={styles.fileNote}>{fileNote}</p>}
              {isHtml && <p className={styles.sub}>Same facts as the sections above, typeset like the paper version, so it's always current.</p>}
            </div>
          </div>

          <p className={styles.meta}>
            {facts.map((f, i) => (
              <span key={f.key}>
                {i > 0 && (
                  <span className={styles.dot} aria-hidden="true">
                    ·
                  </span>
                )}
                {f.node}
              </span>
            ))}
          </p>
        </>
      )}

      <div className={styles.actions}>
        {isHtml ? (
          <Button variant="marker" size="lg" className={styles.primary} onClick={onOpen} icon={<Maximize2 />}>
            Read it full size
          </Button>
        ) : (
          <LinkButton
            variant="marker"
            size="lg"
            className={[styles.primary, loading && styles.disabledLink].filter(Boolean).join(' ')}
            href={shown?.downloadUrl ?? undefined}
            download={downloadName}
            aria-disabled={loading || !shown}
            tabIndex={loading || !shown ? -1 : undefined}
            icon={<Download />}
          >
            Download PDF
          </LinkButton>
        )}
        <div className={styles.secondary}>
          {isHtml ? (
            <Button variant="ghost" className={styles.quiet} onClick={onPrint} icon={<Printer />}>
              Save as PDF
            </Button>
          ) : (
            <Button variant="ghost" className={styles.quiet} onClick={onOpen} icon={<Maximize2 />} disabled={loading}>
              Open full view
            </Button>
          )}
          <Button variant="ghost" className={styles.quiet} onClick={onCopy} icon={<Link2 />} disabled={loading}>
            Copy link
          </Button>
        </div>
      </div>
    </Paper>
  );
}
