import { useId, useRef, useState, type DragEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, FileText, Info, UploadCloud, X } from 'lucide-react';
import { Button } from '@/ui';
import { checkResumeFile, formatBytes, MAX_RESUME_BYTES } from '@/lib/resumeStore';
import styles from './UploadTray.module.css';

interface Props {
  demo: boolean;
  /** Resolves on success; throws (Error.message is shown) on failure. */
  onUpload: (file: File, label: string) => Promise<void>;
  /** A valid PDF was picked (a good moment to warm up the PDF renderer). */
  onPick?: () => void;
}

/** Owner-only chalk tray: drag & drop / pick a PDF, optional label, upload. */
export function UploadTray({ demo, onUpload, onPick }: Props) {
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const errId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const depth = useRef(0);

  const choose = async (f: File | undefined | null) => {
    if (!f || busy) return;
    const msg = await checkResumeFile(f);
    setError(msg);
    setFile(msg ? null : f);
    if (!msg) onPick?.();
  };

  const reset = () => {
    setFile(null);
    setLabel('');
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(file, label);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const dragProps = {
    onDragEnter: (e: DragEvent) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      depth.current += 1;
      if (depth.current === 1) onPick?.();
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = busy ? 'none' : 'copy';
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      void choose(e.dataTransfer.files?.[0]);
    },
  };

  return (
    <div className={styles.tray} data-over={over || undefined} data-busy={busy || undefined} {...dragProps}>
      <div className={styles.head}>
        <h3 className={styles.title}>Swap in a new resume</h3>
        <span className={styles.ownerTag}>{demo ? 'demo' : 'owner only'}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="resume-file-input"
        onChange={(e) => void choose(e.target.files?.[0])}
      />

      <AnimatePresence mode="wait" initial={false}>
        {!file ? (
          <motion.button
            key="drop"
            type="button"
            className={styles.drop}
            onClick={() => inputRef.current?.click()}
            aria-describedby={error ? errId : undefined}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <UploadDoodle over={over} />
            <span className={styles.dropMain}>{over ? 'Let go to drop it in' : 'Drop a PDF here'}</span>
            <span className={styles.dropSub}>
              or <u>browse files</u> · PDF up to {formatBytes(MAX_RESUME_BYTES)}
            </span>
          </motion.button>
        ) : (
          <motion.form
            key="chosen"
            className={styles.chosen}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles.fileChip}>
              <FileText size={20} aria-hidden="true" />
              <div className={styles.fileMeta}>
                <span className={styles.fileName} title={file.name}>
                  {file.name}
                </span>
                <span className={styles.fileSize}>{formatBytes(file.size)} · PDF</span>
              </div>
              <button type="button" className={styles.clear} onClick={reset} aria-label="Remove selected file" disabled={busy}>
                <X size={16} />
              </button>
            </div>

            <label className={styles.field} htmlFor={labelId}>
              <span>
                Label <em>(optional)</em>
              </span>
              <input
                id={labelId}
                type="text"
                value={label}
                maxLength={80}
                placeholder="e.g. Backend-focused v3"
                onChange={(e) => setLabel(e.target.value)}
                disabled={busy}
                autoComplete="off"
              />
            </label>

            <div className={styles.row}>
              <Button type="submit" variant="marker" loading={busy} icon={busy ? undefined : <UploadCloud />}>
                {busy ? 'Uploading…' : 'Upload & make current'}
              </Button>
              <Button type="button" variant="chalk" onClick={reset} disabled={busy}>
                Cancel
              </Button>
            </div>
            {busy && (
              <div className={styles.progress} role="progressbar" aria-label="Uploading resume" aria-valuetext="Uploading">
                <span />
              </div>
            )}
          </motion.form>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.p
            id={errId}
            key={error}
            role="alert"
            className={styles.error}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, x: [0, -5, 5, -3, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
          </motion.p>
        )}
      </AnimatePresence>

      {demo && (
        <p className={styles.demo}>
          <Info size={14} aria-hidden="true" />
          Demo mode: stored only in this browser
        </p>
      )}
    </div>
  );
}

/** Hand-drawn chalk page with an arrow; draws itself on, bounces while dragging over. */
function UploadDoodle({ over }: { over: boolean }) {
  const reduce = useReducedMotion();
  const draw = reduce
    ? {}
    : { initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true }, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const } };
  return (
    <motion.svg
      className={styles.doodle}
      viewBox="0 0 64 64"
      aria-hidden="true"
      animate={reduce ? undefined : over ? { y: [0, -5, 0] } : { y: 0 }}
      transition={over ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
    >
      <motion.path d="M17 9.5 C 26 8.6, 33 9.2, 39.5 9 L 49 18.6 C 48.6 30, 49.2 42, 48.4 54.8 C 38 55.4, 27 55, 16.4 55.3 C 16 40, 16.8 24, 17 9.5 Z" {...draw} />
      <motion.path d="M39.5 9.4 C 39.2 13, 39.6 16, 39.4 18.8 C 42.6 18.6, 45.6 18.9, 48.8 18.6" {...draw} />
      <motion.path d="M32.4 45 C 32.6 38, 32.2 32, 32.5 26.5" {...draw} />
      <motion.path d="M26 32.4 C 28.4 30.4, 30.4 28.3, 32.5 26.2 C 34.6 28.4, 36.6 30.3, 39 32.6" {...draw} />
    </motion.svg>
  );
}
