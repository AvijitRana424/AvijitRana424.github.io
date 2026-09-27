import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Modal } from '@/ui';
import type { JobStatus } from '@/lib/types';
import { JOB_STATUSES } from '@/lib/types';
import { isValidUrl, normaliseUrl } from '@/lib/tracker/ats';
import { useTracker } from '../data';
import { STATUS_META } from '../lib/format';
import form from '../components/Form.module.css';
import styles from './Jobs.module.css';

export function AddJobModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (id: string) => void }) {
  const { companies, addJob } = useTracker();
  const [companyId, setCompanyId] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<JobStatus>('saved');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCompanyId((c) => (c && companies.some((x) => x.id === c) ? c : companies[0]?.id || ''));
      setTouched(false);
      const t = window.setTimeout(() => titleRef.current?.focus(), 80); // after Modal focuses its panel
      return () => window.clearTimeout(t);
    }
  }, [open, companies]);

  const urlBad = url.trim() !== '' && !isValidUrl(url);
  const errors = {
    company: !companyId ? 'Pick a company (add one on the Companies tab first).' : '',
    title: !title.trim() ? 'A job title is required.' : '',
    url: urlBad ? "That doesn't look like a link." : '',
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    const job = await addJob({
      company_id: companyId,
      title: title.trim(),
      url: url.trim() ? normaliseUrl(url) : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      status,
    });
    setBusy(false);
    if (job) {
      setTitle('');
      setUrl('');
      setLocation('');
      setNotes('');
      setStatus('saved');
      onClose();
      onAdded?.(job.id);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={<span className={styles.modalTitle}>Add a job by hand</span>} label="Add a job by hand" width={560}>
      <form className={form.form} onSubmit={submit} noValidate>
        <p className={form.hint}>For roles you found yourself — a referral, LinkedIn post or a page the scanner can't read.</p>
        <div className={form.row}>
          <label className={form.field}>
            <span className={form.label}>Company</span>
            <select className={form.select} value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-invalid={touched && !!errors.company}>
              {!companies.length && <option value="">No companies yet</option>}
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {touched && errors.company && <span className={form.error}>{errors.company}</span>}
          </label>
          <label className={form.field}>
            <span className={form.label}>Status</span>
            <select className={form.select} value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={form.field}>
          <span className={form.label}>Job title</span>
          <input
            className={form.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Senior Software Engineer, Payments"
            aria-invalid={touched && !!errors.title}
            ref={titleRef}
          />
          {touched && errors.title && <span className={form.error}>{errors.title}</span>}
        </label>
        <div className={form.row}>
          <label className={form.field}>
            <span className={form.label}>
              Posting URL <span className={form.optional}>optional</span>
            </span>
            <input
              className={form.input}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
              aria-invalid={urlBad}
            />
            {errors.url && <span className={form.error}>{errors.url}</span>}
          </label>
          <label className={form.field}>
            <span className={form.label}>
              Location <span className={form.optional}>optional</span>
            </span>
            <input className={form.input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bengaluru" />
          </label>
        </div>
        <label className={form.field}>
          <span className={form.label}>
            Notes <span className={form.optional}>optional</span>
          </span>
          <textarea className={form.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who referred you, salary band, next step…" rows={3} />
        </label>
        <div className={form.actions}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="ink" loading={busy}>
            Add job
          </Button>
        </div>
      </form>
    </Modal>
  );
}
