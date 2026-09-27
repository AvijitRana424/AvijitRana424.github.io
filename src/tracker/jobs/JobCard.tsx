import { type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUpRight, Ellipsis, GripVertical, MapPin } from 'lucide-react';
import type { Company, Job, JobStatus } from '@/lib/types';
import { Monogram, ScoreRing } from '../components/Bits';
import { StatusMenu } from '../components/Menu';
import { ago, relTime, STATUS_META, tiltFor } from '../lib/format';
import styles from './Board.module.css';

interface Props {
  job: Job;
  company?: Company;
  onOpen?: (id: string) => void;
  onMove?: (id: string, s: JobStatus) => void;
  onKeyMove?: (job: Job, dir: -1 | 1) => void;
  /** card element pointer-down (mouse drag) */
  onDragStart?: (e: ReactPointerEvent<HTMLElement>, job: Job, viaHandle: boolean) => void;
  hole?: boolean;
  ghost?: boolean;
  settle?: boolean;
}

export function JobCard({ job, company, onOpen, onMove, onKeyMove, onDragStart, hole, ghost }: Props) {
  const tilt = ghost ? 0 : tiltFor(job.id, 0.7);
  const name = company?.name ?? 'Unknown company';
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen?.(job.id);
    } else if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      onKeyMove?.(job, e.key === 'ArrowRight' ? 1 : -1);
    }
  };

  return (
    <article
      className={[styles.card, hole && styles.hole, ghost && styles.ghostCard, !job.is_active && styles.closed].filter(Boolean).join(' ')}
      style={{ '--tilt': `${tilt}deg`, '--c': STATUS_META[job.status].color } as CSSProperties}
      tabIndex={ghost ? -1 : 0}
      aria-label={`${job.title} at ${name}. ${STATUS_META[job.status].label}. Match ${job.match_score}. Press Enter for details, Shift plus arrow keys to move between columns.`}
      onClick={() => onOpen?.(job.id)}
      onKeyDown={onKey}
      onPointerDown={(e) => onDragStart?.(e, job, false)}
      data-job-id={job.id}
    >
      <header className={styles.cardHead}>
        <Monogram name={name} size={24} />
        <span className={styles.company}>{name}</span>
        <ScoreRing score={job.match_score} size={34} />
      </header>
      <h3 className={styles.title}>{job.title}</h3>
      <div className={styles.meta}>
        {job.location && (
          <span className={styles.loc}>
            <MapPin size={12.5} aria-hidden="true" />
            <span>{job.location}</span>
          </span>
        )}
        {job.remote && !/remote/i.test(job.location ?? '') && <span className={styles.remote}>Remote</span>}
        {!job.is_active && <span className={styles.closedTag}>Closed</span>}
      </div>
      <footer className={styles.cardFoot}>
        <time className={styles.found} dateTime={job.date_found} title={`Found ${relTime(job.date_found)}`}
          aria-label={`Found ${relTime(job.date_found)}`}>
          {ago(job.date_found)} ago
          {job.source === 'manual' && <span className={styles.manual}> · manual</span>}
        </time>
        <span className={styles.actions}>
          {job.url && (
            <a
              className={styles.act}
              href={job.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open posting for ${job.title} (new tab)`}
              title="Open posting"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ArrowUpRight size={16} />
            </a>
          )}
          {onMove && (
            <StatusMenu
              current={job.status}
              onSelect={(s) => onMove(job.id, s)}
              label={`Change status of ${job.title}`}
              triggerClassName={styles.act}
              trigger={<Ellipsis size={16} />}
            />
          )}
          {onDragStart && (
            <span
              className={styles.grip}
              aria-hidden="true"
              title="Drag to another column"
              onPointerDown={(e) => {
                e.stopPropagation();
                onDragStart(e, job, true);
              }}
            >
              <GripVertical size={16} />
            </span>
          )}
        </span>
      </footer>
    </article>
  );
}
