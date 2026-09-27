import { useCallback, useId, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Company } from '@/lib/types';
import { detectAts } from '@/lib/tracker/ats';
import type { CompanyPatch } from '@/lib/tracker/store';
import { Button, Modal, Paper, Pin, TiltCard } from '@/ui';
import { AtsBadge, Monogram, Skeleton, Switch, Tooltip } from '../components/Bits';
import { useMediaQuery } from '../components/Drawer';
import { EmptyState } from '../components/EmptyState';
import { useTracker } from '../data';
import { hostOf, num, plural, relTime, tiltFor } from '../lib/format';
import form from '../components/Form.module.css';
import { CompanyForm, type CompanyFormValues } from './CompanyForm';
import styles from './Companies.module.css';

function StatusDot({ c }: { c: Company }) {
  const label =
    c.last_status === 'ok' ? 'Last check OK' : c.last_status === 'error' ? 'Last check failed' : 'Not checked yet';
  const tip =
    c.last_status === 'error' ? (
      <>
        <b>Last check failed</b>
        <br />
        {c.last_error ?? 'Unknown error'}
      </>
    ) : c.last_status === 'ok' ? (
      `Scanned fine ${relTime(c.last_checked_at)}`
    ) : (
      'Waiting for the next scheduled scan'
    );
  return (
    <Tooltip tip={tip}>
      {(id) => (
        <span className={styles.checked} tabIndex={0} aria-describedby={id}>
          <span className={[styles.dot, styles[`dot_${c.last_status}`]].join(' ')} aria-hidden="true" />
          <span className="sr-only">{label}. </span>
          {c.last_status === 'pending' ? 'Waiting for the next scan' : c.last_checked_at ? `Checked ${relTime(c.last_checked_at)}` : 'Never checked'}
        </span>
      )}
    </Tooltip>
  );
}

/** The scanner's full error, clamped to two lines with a toggle (the useful part is often at the end). */
function ErrorText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = text.length > 80;
  return (
    <div className={styles.errBox}>
      <p id={id} className={[styles.errText, long && !open && styles.errClamp].filter(Boolean).join(' ')} title={long && !open ? text : undefined}>
        {text}
      </p>
      {long && (
        <button type="button" className={styles.errMore} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show full error'}
          <ChevronDown size={14} className={open ? styles.flip : undefined} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function CompanyCard({ c, matches, onEdit, onDelete, onToggle }: { c: Company; matches: number; onEdit: () => void; onDelete: () => void; onToggle: (v: boolean) => void }) {
  return (
    <TiltCard max={5} lift={12} rest={tiltFor(c.id, 1.1)} glare={false} className={styles.tilt}>
      <Paper className={[styles.card, !c.active && styles.paused].filter(Boolean).join(' ')}>
        <Pin className={styles.pin} color={c.active ? 'var(--pin)' : 'var(--st-archived)'} />
        <header className={styles.cardHead}>
          <Monogram name={c.name} size={42} />
          <div className={styles.cardTitle}>
            <h3 className={styles.name}>{c.name}</h3>
            {c.ats_type === 'auto' ? (
              <AtsBadge type={detectAts(c.career_url).type} auto />
            ) : (
              <AtsBadge type={c.ats_type} identifier={c.ats_identifier} />
            )}
          </div>
        </header>
        <a className={styles.url} href={c.career_url} target="_blank" rel="noreferrer" title={c.career_url}>
          <span>{hostOf(c.career_url)}</span>
          <ArrowUpRight size={14} aria-hidden="true" />
          <span className="sr-only">(opens careers page)</span>
        </a>
        <div className={styles.statusRow}>
          <StatusDot c={c} />
          {c.last_status === 'error' && c.last_error && <ErrorText text={c.last_error} />}
        </div>
        <dl className={styles.nums}>
          <div>
            <dt>scanned last run</dt>
            <dd>{num(c.jobs_seen_count)}</dd>
          </div>
          <div>
            <dt>on the radar</dt>
            <dd className={matches ? styles.hotNum : undefined}>{matches}</dd>
          </div>
        </dl>
        {c.notes && <p className={styles.notes}>{c.notes}</p>}
        <footer className={styles.cardFoot}>
          <Switch checked={c.active} onChange={onToggle} label={c.active ? 'Watching' : 'Paused'} />
          <span className={styles.cardActs}>
            <button type="button" className={styles.iconBtn} onClick={onEdit} aria-label={`Edit ${c.name}`} title="Edit">
              <Pencil size={16} />
            </button>
            <button type="button" className={[styles.iconBtn, styles.iconDanger].join(' ')} onClick={onDelete} aria-label={`Delete ${c.name}`} title="Delete">
              <Trash2 size={16} />
            </button>
          </span>
        </footer>
        {!c.active && (
          <span className={styles.pausedStamp} aria-hidden="true">
            paused
          </span>
        )}
      </Paper>
    </TiltCard>
  );
}

export function CompaniesTab() {
  const { state, companies, jobs, addCompany, patchCompany, removeCompany } = useTracker();
  const reduce = useReducedMotion();
  const [editing, setEditing] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [q, setQ] = useState('');
  // phones / narrow windows: the list comes first, the add form opens on demand
  const narrow = useMediaQuery('(max-width: 980px)');
  const [adding, setAdding] = useState(false);
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const matchCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) m.set(j.company_id, (m.get(j.company_id) ?? 0) + 1);
    return m;
  }, [jobs]);

  const shown = companies.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const errors = companies.filter((c) => c.last_status === 'error').length;
  const deletingJobs = deleting ? matchCount.get(deleting.id) ?? 0 : 0;

  const addLead = 'Paste its careers page. The daily scanner reads the board and keeps only roles that match your criteria.';
  const toAdd = ({ sourceChanged: _s, ...v }: CompanyFormValues) => v;

  const saveEdit = async (c: Company, v: CompanyFormValues) => {
    const patch: CompanyPatch = { name: v.name, notes: v.notes ?? null, active: v.active };
    if (v.sourceChanged) {
      // new board: the scanner re-derives the identifier; until then the old error no longer applies
      Object.assign(patch, { career_url: v.career_url, ats_type: v.ats_type, ats_identifier: null, last_status: 'pending', last_error: null });
    }
    const ok = await patchCompany(c.id, patch);
    if (ok) setEditing(null);
    return ok;
  };

  return (
    <div className={styles.layout}>
      {!narrow && (
        <aside className={styles.side}>
          <Paper tape="top" className={styles.addCard} tilt={-0.6}>
            <h2 className={styles.addTitle}>
              Watch a new <span className={styles.accent}>company</span>
            </h2>
            <p className={styles.addLead}>{addLead}</p>
            <CompanyForm mode="add" existing={companies} onSubmit={async (v) => !!(await addCompany(toAdd(v)))} />
          </Paper>
        </aside>
      )}

      <section className={styles.main} aria-label="Watched companies">
        <div className={styles.mainHead}>
          <h2 className={styles.h2}>
            {plural(companies.filter((c) => c.active).length, 'company', 'companies')} on watch
            {errors > 0 && <span className={styles.errBadge}>{plural(errors, 'failing')}</span>}
          </h2>
          <span className={styles.mainTools}>
            {companies.length > 5 && (
              <label className={[form.searchWrap, styles.filter].join(' ')}>
                <Search size={15} className={form.searchIcon} aria-hidden="true" />
                <span className="sr-only">Filter companies</span>
                <input className={form.chalkInput} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" />
              </label>
            )}
            {narrow && (
              <Button variant="marker" icon={<Plus />} onClick={() => setAdding(true)}>
                Watch a company
              </Button>
            )}
          </span>
        </div>

        {state === 'loading' ? (
          <div className={styles.grid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} h={250} r={12} />
            ))}
          </div>
        ) : companies.length === 0 ? (
          <EmptyState kind="building" title="No companies yet">
            Add a careers page {narrow ? 'with “Watch a company”' : 'on the left'} — Stripe on Greenhouse, Plaid on Lever, anything with a job board.
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState kind="search" compact title={`No company matches “${q}”`} />
        ) : (
          <ul className={styles.grid}>
            <AnimatePresence initial={false}>
              {shown.map((c, i) => (
                <motion.li
                  key={c.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 24, rotate: -4 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85, rotate: 6, transition: { duration: 0.2 } }}
                  transition={{ type: 'spring', stiffness: 300, damping: 26, delay: reduce ? 0 : Math.min(i, 8) * 0.03 }}
                  style={{ '--i': i } as CSSProperties}
                >
                  <CompanyCard
                    c={c}
                    matches={matchCount.get(c.id) ?? 0}
                    onEdit={() => setEditing(c)}
                    onDelete={() => setDeleting(c)}
                    onToggle={(v) =>
                      void patchCompany(c.id, { active: v }, { message: v ? `Watching ${c.name} again` : `Paused ${c.name} — it'll be skipped by the scanner` })
                    }
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <Modal open={!!editing} onClose={closeEdit} title={<span className={styles.modalTitle}>Edit {editing?.name}</span>} label="Edit company" width={560}>
        {editing && (
          <CompanyForm
            key={editing.id}
            mode="edit"
            initial={editing}
            existing={companies}
            onCancel={() => setEditing(null)}
            onSubmit={(v) => saveEdit(editing, v)}
          />
        )}
      </Modal>

      <Modal
        open={narrow && adding}
        onClose={() => setAdding(false)}
        title={
          <span className={styles.modalTitle}>
            Watch a new <span className={styles.accent}>company</span>
          </span>
        }
        label="Watch a new company"
        width={560}
      >
        <p className={styles.addLead}>{addLead}</p>
        <CompanyForm
          mode="add"
          existing={companies}
          onCancel={() => setAdding(false)}
          onSubmit={async (v) => {
            const ok = !!(await addCompany(toAdd(v)));
            if (ok) setAdding(false);
            return ok;
          }}
        />
      </Modal>

      <Modal open={!!deleting} onClose={closeDelete} title={<span className={styles.modalTitle}>Delete {deleting?.name}?</span>} label="Delete company" width={460}>
        <div className={styles.confirmBody}>
          <p>
            The scanner will stop watching it, and{' '}
            {deletingJobs ? (
              <b className={styles.warn}>its {plural(deletingJobs, 'job')} (with your notes) will be deleted too.</b>
            ) : (
              'it has no jobs on the radar.'
            )}{' '}
            You'll have a few seconds to undo.
          </p>
          {deleting?.active && (
            <p className={styles.confirmHint}>
              Just want a break? <button type="button" onClick={() => { void patchCompany(deleting.id, { active: false }, { message: `Paused ${deleting.name}` }); setDeleting(null); }}>Pause it instead</button>.
            </p>
          )}
          <div className={form.actions}>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="marker"
              icon={<Trash2 />}
              onClick={() => {
                const c = deleting;
                setDeleting(null);
                if (c) removeCompany(c.id);
              }}
            >
              Delete company
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
