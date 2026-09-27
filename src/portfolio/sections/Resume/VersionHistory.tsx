import { useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, Star, Trash2 } from 'lucide-react';
import { Button } from '@/ui';
import { formatBytes } from '@/lib/resumeStore';
import type { ResumeVersion } from '@/lib/types';
import { formatDate, relativeTime, useNow } from './hooks';
import styles from './VersionHistory.module.css';

interface Props {
  versions: ResumeVersion[];
  previewId: string | null;
  /** id of the version whose action is running */
  pendingId: string | null;
  onPreview: (v: ResumeVersion) => void;
  onMakeCurrent: (v: ResumeVersion) => void;
  onDelete: (v: ResumeVersion) => Promise<void> | void;
}

export function VersionHistory({ versions, previewId, pendingId, onPreview, onMakeCurrent, onDelete }: Props) {
  const reduce = useReducedMotion();
  const now = useNow();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h3 className={styles.title}>Version history</h3>
        <span className={styles.count} aria-label={`${versions.length} versions`}>
          {versions.length}
        </span>
      </div>

      {versions.length === 0 ? (
        <p className={styles.empty}>Nothing uploaded yet. Your first PDF will show up here.</p>
      ) : (
        <LayoutGroup>
          <ul className={styles.list}>
            <AnimatePresence initial={false}>
              {versions.map((v) => {
                const name = v.label || v.file_name;
                const previewing = previewId === v.id;
                const confirming = confirmId === v.id;
                const busy = pendingId === v.id;
                return (
                  <motion.li
                    key={v.id}
                    layout={!reduce}
                    className={styles.item}
                    data-current={v.is_current || undefined}
                    data-previewing={previewing || undefined}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: 60, rotate: 3, transition: { duration: 0.25 } }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  >
                    <div className={styles.main}>
                      <div className={styles.nameRow}>
                        <span className={styles.name} title={name}>
                          {name}
                        </span>
                        {v.is_current && <span className={styles.badge}>current</span>}
                      </div>
                      <p className={styles.sub}>
                        {v.label && (
                          <>
                            <span className={styles.file} title={v.file_name}>
                              {v.file_name}
                            </span>
                            <span aria-hidden="true"> · </span>
                          </>
                        )}
                        <time dateTime={v.uploaded_at} title={formatDate(v.uploaded_at)}>
                          {relativeTime(v.uploaded_at, now)}
                        </time>
                        <span aria-hidden="true"> · </span>
                        {formatBytes(v.size_bytes)}
                      </p>
                    </div>

                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.act}
                        onClick={() => onPreview(v)}
                        aria-pressed={previewing}
                        aria-label={previewing ? `Stop previewing ${name}` : `Preview ${name}`}
                        title={previewing ? 'Stop preview' : 'Preview on the clipboard'}
                      >
                        {previewing ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                      {!v.is_current && (
                        <button
                          type="button"
                          className={styles.act}
                          onClick={() => onMakeCurrent(v)}
                          disabled={busy}
                          aria-label={`Make ${name} the current resume`}
                          title="Make current"
                        >
                          <Star size={17} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${styles.act} ${styles.danger}`}
                        onClick={() => setConfirmId(confirming ? null : v.id)}
                        disabled={busy}
                        aria-expanded={confirming}
                        aria-label={`Delete ${name}`}
                        title="Delete"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>

                    <AnimatePresence initial={false}>
                      {confirming && (
                        <motion.div
                          className={styles.confirm}
                          role="alertdialog"
                          aria-label={`Delete ${name}?`}
                          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                          animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className={styles.confirmInner}>
                            <span>
                              Delete this version{v.is_current ? ' (it is live right now)' : ''}? This can't be undone.
                            </span>
                            <div className={styles.confirmBtns}>
                              <Button
                                variant="ink"
                                size="sm"
                                loading={busy}
                                autoFocus
                                onClick={async () => {
                                  await onDelete(v);
                                  setConfirmId(null);
                                }}
                              >
                                Delete
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)} disabled={busy}>
                                Keep it
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </LayoutGroup>
      )}
    </div>
  );
}
