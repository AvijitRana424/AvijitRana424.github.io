import { useRef } from 'react';
import { Eraser } from 'lucide-react';
import type { Job } from '@/lib/types';
import { STALE_AFTER_DAYS, STALE_STATUSES } from '@/lib/tracker/stale';
import { Button, Modal } from '@/ui';
import { plural, STATUS_META } from '../lib/format';
import form from '../components/Form.module.css';
import styles from './Jobs.module.css';

/** Confirm for "Clear old jobs": shows exactly what goes (and what is kept) before anything changes. */
export function ClearStaleDialog({
  open,
  jobs,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** the jobs that would be cleared right now (isStale) */
  jobs: Job[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const n = jobs.length;
  const withNotes = jobs.filter((j) => j.notes?.trim()).length;
  const counts = STALE_STATUSES.map((s) => ({ s, n: jobs.filter((j) => j.status === s).length })).filter((c) => c.n);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className={styles.modalTitle}>Clear old jobs?</span>}
      label="Clear old jobs"
      width={500}
      initialFocus={keepRef}
    >
      <div className={styles.confirmBody}>
        <p>
          <b>{plural(n, 'job')}</b> {n === 1 ? 'was' : 'were'} found more than {STALE_AFTER_DAYS} days ago and you
          haven't applied:
        </p>
        <ul className={styles.breakdown} aria-label="By status">
          {counts.map(({ s, n: c }) => (
            <li key={s}>
              <span className={styles.dot} style={{ background: STATUS_META[s].color }} aria-hidden="true" />
              {c} {STATUS_META[s].label}
            </li>
          ))}
        </ul>
        <p>
          {n === 1 ? "It leaves the radar and the scanner won't add it back" : "They leave the radar and the scanner won't add them back"}
          {withNotes ? (n === 1 ? ', along with your notes on it' : <>, along with your notes on {withNotes} of them</>) : ''}. Jobs you applied
          to (or that moved further) and jobs you added by hand are kept.
        </p>
        <div className={form.actions}>
          <Button ref={keepRef} variant="ghost" onClick={onClose}>
            Keep them
          </Button>
          <Button
            variant="marker"
            icon={<Eraser />}
            disabled={!n}
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            Clear {plural(n, 'job')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
