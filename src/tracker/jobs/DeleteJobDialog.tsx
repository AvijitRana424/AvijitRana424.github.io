import { useRef } from 'react';
import { Archive, Trash2 } from 'lucide-react';
import type { Job } from '@/lib/types';
import { Button, Modal } from '@/ui';
import form from '../components/Form.module.css';
import styles from './Jobs.module.css';

/**
 * Deleting a scraped job isn't final — the scanner re-adds it as New on its next run — so the dialog
 * steers to Archive. Manual jobs just need a confirm (the delete itself has an undo window).
 */
export function DeleteJobDialog({
  job,
  onClose,
  onArchive,
  onDelete,
}: {
  job: Job | null;
  onClose: () => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const scraped = job?.source === 'scraper';
  const hasNotes = !!job?.notes?.trim();
  return (
    <Modal
      open={!!job}
      onClose={onClose}
      title={<span className={styles.modalTitle}>{scraped ? 'Delete for good?' : 'Delete this job?'}</span>}
      label="Delete job"
      width={480}
      initialFocus={keepRef}
    >
      {job && (
        <div className={styles.confirmBody}>
          <p>
            <b>{job.title}</b>
          </p>
          {scraped ? (
            <p>
              The scanner will find this posting again on its next run and add it back as <b>New</b>
              {hasNotes ? ' — without your notes' : ''}. To hide it for good, <b>archive</b> it instead.
            </p>
          ) : (
            <p>
              This removes the job{hasNotes ? ' and your notes' : ''}. You can undo for a few seconds afterwards.
            </p>
          )}
          <div className={form.actions}>
            <Button ref={keepRef} variant="ghost" onClick={onClose}>
              Keep it
            </Button>
            {scraped && job.status !== 'archived' && (
              <Button
                variant="ink"
                icon={<Archive />}
                onClick={() => {
                  onClose();
                  onArchive(job.id);
                }}
              >
                Archive instead
              </Button>
            )}
            <Button
              variant="marker"
              icon={<Trash2 />}
              onClick={() => {
                onClose();
                onDelete(job.id);
              }}
            >
              {scraped ? 'Delete anyway' : 'Delete'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
