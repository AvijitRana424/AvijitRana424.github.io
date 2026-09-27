import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Paper, SectionHeading } from '@/ui';
import { useAuth } from '@/lib/auth';
import { usePortfolioUI } from '@/portfolio/uiState';
import { homeUrl, isDemoMode } from '@/config';
import { profile } from '@/data/profile';
import { ResumeStore, type CurrentResume } from '@/lib/resumeStore';
import { loadPdfjs, openPdf, type LoadedPdf } from '@/lib/resume/pdf';
import type { ResumeVersion } from '@/lib/types';
import { Clipboard, type SheetMotion } from './Clipboard';
import { FitPage, HtmlResume } from './HtmlResume';
import { PdfCanvas, Shimmer } from './PdfCanvas';
import { InfoCard, type ShownResume } from './InfoCard';
import { UploadTray } from './UploadTray';
import { VersionHistory } from './VersionHistory';
import { FullViewer } from './FullViewer';
import { useToast } from './Toast';
import { copyText, prefersSaveData, useNearViewport } from './hooks';
import { printResumePage } from './printResume';
import styles from './Resume.module.css';

type Sheet =
  | { kind: 'loading' }
  | { kind: 'html' }
  | { kind: 'pdf'; url: string; loaded: LoadedPdf }
  | { kind: 'error'; url: string; message: string };

const toShown = (c: CurrentResume): ShownResume => ({
  url: c.url,
  downloadUrl: c.downloadUrl,
  shareUrl: c.shareUrl,
  fileName: c.fileName,
  uploadedAt: c.uploadedAt,
  version: c.version,
  source: c.source,
  isPreview: false,
});

const fallbackDownloadName = `${profile.name.replace(/\s+/g, '-')}-Resume.pdf`;

export default function Resume() {
  const auth = useAuth();
  const { setConnectOpen } = usePortfolioUI();
  const reduce = useReducedMotion();
  const canManage = auth.ready && auth.isOwner;

  const sectionRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef<HTMLDivElement>(null);
  // Nothing (data, PDF, pdf.js) loads until the section is close; with Save-Data, only once it's on screen.
  const near = useNearViewport(sectionRef, prefersSaveData() ? '0px' : '700px');

  const [current, setCurrent] = useState<CurrentResume | null | undefined>(undefined);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [preview, setPreview] = useState<ShownResume | null>(null);
  const [sheet, setSheet] = useState<Sheet>({ kind: 'loading' });
  const [page, setPage] = useState(1);
  const [motionKind, setMotionKind] = useState<SheetMotion>('fade');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toastNode, toast] = useToast();
  // stable identity: Modal re-runs its focus/scroll-lock effect whenever onClose changes
  const closeViewer = useCallback(() => setViewerOpen(false), []);

  const shown: ShownResume | null = preview ?? (current ? toShown(current) : null);
  const targetUrl = shown?.url ?? null;

  // ── data ────────────────────────────────────────────────────────────────
  // Always re-read from the store (never patch local state), so a failed or partial change still
  // leaves the UI showing what is really stored. A sequence number drops out-of-order answers.
  const refreshSeq = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    const [cur, list] = await Promise.all([
      // visitors of a demo build never read (or create) this browser's demo store
      ResumeStore.getCurrent({ demoUploads: canManage }).catch(() => null),
      canManage ? ResumeStore.list().catch(() => null) : Promise.resolve([] as ResumeVersion[]),
    ]);
    if (seq !== refreshSeq.current) return cur;
    setCurrent(cur);
    if (list) {
      setVersions(list);
      // a previewed version that no longer exists (deleted here or elsewhere) stops being previewed
      setPreview((p) => (p?.version && !list.some((v) => v.id === p.version!.id) ? null : p));
    }
    return cur;
  }, [canManage]);

  useEffect(() => {
    if (near) void refresh();
  }, [near, refresh]);

  // pdf.js is only fetched when there is a PDF to draw (openPdf below) or the owner picks one to upload.
  const warmPdf = useCallback(() => {
    loadPdfjs().catch(() => undefined);
  }, []);

  // Resolve what the clipboard shows. The old sheet stays until the new PDF is parsed, then flips.
  useEffect(() => {
    if (current === undefined && !preview) return;
    if (!targetUrl) {
      setSheet({ kind: 'html' });
      return;
    }
    if (!near) return;
    let alive = true;
    openPdf(targetUrl)
      .then((loaded) => alive && setSheet({ kind: 'pdf', url: targetUrl, loaded }))
      .catch((e: unknown) => {
        console.warn('[resume] could not open PDF', e);
        if (alive) setSheet({ kind: 'error', url: targetUrl, message: e instanceof Error ? e.message : 'Unknown error' });
      });
    return () => {
      alive = false;
    };
  }, [current, preview, targetUrl, near]);

  const sheetUrl = sheet.kind === 'pdf' || sheet.kind === 'error' ? sheet.url : null;
  useEffect(() => setPage(1), [sheetUrl]);

  const doc = sheet.kind === 'pdf' ? sheet.loaded.doc : null;
  const pageCount = doc?.numPages ?? 1;
  const busy = !!targetUrl && sheetUrl !== targetUrl && sheet.kind !== 'loading';
  const mode: 'loading' | 'pdf' | 'html' | 'error' =
    sheet.kind === 'html' ? 'html' : sheet.kind === 'loading' || (targetUrl && !sheetUrl) ? 'loading' : sheet.kind;
  // Info card follows what is actually on the clipboard (so it doesn't jump ahead of the flip).
  const infoShown = busy && current ? (sheetUrl === current.url ? toShown(current) : shown) : shown;

  // ── actions ─────────────────────────────────────────────────────────────
  const goPage = (n: number) => {
    const next = Math.min(Math.max(1, n), pageCount);
    if (next === page) return;
    setMotionKind(next > page ? 'next' : 'prev');
    setPage(next);
  };

  const bringBoardIntoView = () => {
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom < 80 || r.top > window.innerHeight - 120) {
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  };

  const handleUpload = async (file: File, label: string) => {
    let v: ResumeVersion;
    try {
      v = await ResumeStore.upload(file, label);
    } catch (e) {
      void refresh(); // a partial upload may have left a new (non-current) version behind
      throw e;
    }
    setMotionKind('file');
    setPreview(null);
    const cur = await refresh();
    // keep the tray in its "uploading…" state until the new sheet is ready to flip in
    if (cur?.url) await openPdf(cur.url).catch(() => undefined);
    toast(`"${v.label || v.file_name}" is now the live resume`);
    bringBoardIntoView();
  };

  const handlePreview = async (v: ResumeVersion) => {
    const stop = preview?.version?.id === v.id || (v.is_current && !!preview);
    setMotionKind('file');
    if (stop || v.is_current) {
      setPreview(null);
      return;
    }
    try {
      const u = await ResumeStore.urlFor(v);
      setPreview({
        url: u.url,
        downloadUrl: u.downloadUrl,
        shareUrl: u.shareUrl,
        fileName: v.file_name,
        uploadedAt: v.uploaded_at,
        version: v,
        source: isDemoMode ? 'demo' : 'supabase',
        isPreview: true,
      });
      bringBoardIntoView();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load that version', 'error');
    }
  };

  const handleMakeCurrent = async (v: ResumeVersion) => {
    if (pendingId) return;
    if (v.is_current && current?.version?.id === v.id) {
      setMotionKind('file');
      setPreview(null);
      return;
    }
    setPendingId(v.id);
    try {
      await ResumeStore.setCurrent(v.id);
      setMotionKind('file');
      setPreview(null);
      toast(`"${v.label || v.file_name}" is now the live resume`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not change the current resume', 'error');
    } finally {
      await refresh();
      setPendingId(null);
    }
  };

  const handleDelete = async (v: ResumeVersion) => {
    if (pendingId) return;
    setPendingId(v.id);
    try {
      await ResumeStore.remove(v.id);
      setMotionKind('file');
      if (preview?.version?.id === v.id) setPreview(null);
      toast('Version deleted');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete that version', 'error');
    } finally {
      await refresh();
      setPendingId(null);
    }
  };

  const handleCopy = async () => {
    const pageLink = new URL(`${homeUrl}#resume`, window.location.href).href;
    const link = mode === 'html' ? pageLink : (infoShown?.shareUrl ?? pageLink);
    const ok = await copyText(link);
    if (!ok) return toast("Couldn't copy. Your browser blocked clipboard access.", 'error');
    toast(infoShown?.shareUrl || mode === 'html' ? 'Link copied' : 'Copied the page link (demo PDFs live only in this browser)');
  };

  const handlePrint = () => {
    const el = htmlRef.current;
    if (!el) return;
    void printResumePage(el, `${profile.name} · Resume`);
  };

  // ── render ──────────────────────────────────────────────────────────────
  const sheetKey = sheet.kind === 'pdf' ? `${sheet.url}#${page}` : sheet.kind === 'error' ? `err:${sheet.url}` : sheet.kind;
  const downloadName = infoShown?.version ? infoShown.fileName : fallbackDownloadName;
  const showNoPdfNote = mode === 'html' && canManage;

  const renderSheet = (width: number) => {
    if (sheet.kind === 'pdf') return <PdfCanvas doc={sheet.loaded.doc} pageNumber={Math.min(page, pageCount)} width={width} withText />;
    if (sheet.kind === 'html')
      return (
        <FitPage width={width}>
          <HtmlResume ref={htmlRef} />
        </FitPage>
      );
    if (sheet.kind === 'error')
      return (
        <div className={styles.errorSheet}>
          <AlertTriangle size={28} aria-hidden="true" />
          <p className={styles.errorTitle}>This PDF couldn't be previewed here.</p>
          <p className={styles.errorSub}>The file is still available with the download button.</p>
        </div>
      );
    return (
      <div className={styles.loadingSheet}>
        <Shimmer />
      </div>
    );
  };

  const annotation = useMemo(
    () => (mode === 'html' ? 'typeset live from this site' : mode === 'pdf' ? 'the real PDF, rendered live' : null),
    [mode],
  );

  return (
    <section id="resume" ref={sectionRef} className={styles.section} aria-labelledby="resume-title">
      <div className="container">
        <SectionHeading id="resume-title" title="Resume," accent="fresh off the press" />

        <div className={styles.grid}>
          <div className={styles.left} ref={boardRef}>
            {annotation && <Annotation text={annotation} />}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 40, rotate: -2 }}
              whileInView={{ opacity: 1, y: 0, rotate: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
            >
              <Clipboard
                sheetKey={sheetKey}
                motion={motionKind}
                pageCount={pageCount}
                page={page}
                onPage={goPage}
                onOpen={mode === 'loading' ? undefined : () => setViewerOpen(true)}
                openLabel="Open the resume in full view"
                busy={busy}
                overlay={
                  showNoPdfNote ? (
                    <Paper variant="sticky" tape="top" tilt={4} className={styles.noPdf} role="note">
                      <strong>No PDF uploaded yet</strong>
                      <span>This web edition is built from the site. Drop a PDF in the tray to replace it.</span>
                    </Paper>
                  ) : null
                }
              >
                {renderSheet}
              </Clipboard>
            </motion.div>
          </div>

          <motion.div
            className={styles.side}
            data-sticky={canManage ? undefined : ''}
            initial={reduce ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.1 }}
          >
            <InfoCard
              shown={infoShown}
              mode={mode}
              pages={doc ? pageCount : null}
              bytes={sheet.kind === 'pdf' ? sheet.loaded.bytes : null}
              downloadName={downloadName}
              onOpen={() => setViewerOpen(true)}
              onCopy={handleCopy}
              onPrint={handlePrint}
              onMakeCurrent={preview?.version ? () => void handleMakeCurrent(preview.version!) : undefined}
              onExitPreview={
                preview
                  ? () => {
                      setMotionKind('file');
                      setPreview(null);
                    }
                  : undefined
              }
              busy={!!pendingId}
            />

            <button type="button" className={styles.connect} onClick={() => setConnectOpen(true)}>
              <span>rather talk than read? let's connect</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>

            {canManage && (
              <>
                <UploadTray demo={auth.demo} onUpload={handleUpload} onPick={warmPdf} />
                <VersionHistory
                  versions={versions}
                  previewId={preview?.version?.id ?? null}
                  pendingId={pendingId}
                  onPreview={(v) => void handlePreview(v)}
                  onMakeCurrent={(v) => void handleMakeCurrent(v)}
                  onDelete={handleDelete}
                />
              </>
            )}
          </motion.div>
        </div>
      </div>

      <FullViewer
        open={viewerOpen}
        onClose={closeViewer}
        title={mode === 'html' ? `${profile.name} · Resume` : (infoShown?.fileName ?? 'Resume')}
        doc={doc}
        downloadUrl={doc ? infoShown?.downloadUrl : undefined}
        downloadName={downloadName}
        openUrl={doc ? infoShown?.url : undefined}
        onPrint={mode === 'html' ? handlePrint : undefined}
      />
      {toastNode}
    </section>
  );
}

/** Chalk note with a hand-drawn arrow curling down to the clipboard (desktop only). */
function Annotation({ text }: { text: string }) {
  const reduce = useReducedMotion();
  const draw = reduce
    ? {}
    : {
        initial: { pathLength: 0 },
        whileInView: { pathLength: 1 },
        viewport: { once: true },
        transition: { duration: 0.9, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const },
      };
  return (
    <div className={styles.annotation} aria-hidden="true">
      <motion.span
        className={styles.annotationText}
        key={text}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.35 }}
      >
        {text}
      </motion.span>
      <svg className={styles.annotationArrow} viewBox="0 0 90 60">
        <motion.path d="M84 6 C 70 4, 52 8, 40 20 C 30 30, 26 40, 24 52" {...draw} />
        <motion.path d="M15.5 44.5 C 19 47.6, 21.6 50.4, 24 53.6 C 26.8 50, 29.6 47.4, 33 44.8" {...draw} />
      </svg>
    </div>
  );
}
