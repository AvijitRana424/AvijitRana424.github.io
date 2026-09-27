import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Minus, Plus, RotateCcw, Save } from 'lucide-react';
import type { ExperienceLevel, SearchCriteria } from '@/lib/types';
import { Button, Paper } from '@/ui';
import { Segmented, Skeleton, Switch } from '../components/Bits';
import { TagInput } from '../components/TagInput';
import { useTracker } from '../data';
import { relTime, scanTimeLocal } from '../lib/format';
import form from '../components/Form.module.css';
import styles from './Criteria.module.css';

type Draft = Omit<SearchCriteria, 'id' | 'updated_at'>;

const LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'entry', label: 'Entry' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
];

const toDraft = (c: SearchCriteria): Draft => {
  const { id: _id, updated_at: _u, ...rest } = c;
  return structuredClone(rest);
};

function YearsInput({ label, value, onChange, min = 0, max = 40 }: { label: string; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number }) {
  const set = (n: number | null) => onChange(n === null ? null : Math.max(min, Math.min(max, n)));
  return (
    <div className={form.field}>
      <span className={form.label} id={`yrs-${label}`}>
        {label}
      </span>
      <div className={styles.stepper} role="group" aria-labelledby={`yrs-${label}`}>
        <button type="button" onClick={() => set((value ?? 1) - 1)} aria-label={`Decrease ${label}`} disabled={value === null || value <= min}>
          <Minus size={15} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value ?? ''}
          placeholder="—"
          aria-labelledby={`yrs-${label}`}
          onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))}
        />
        <button type="button" onClick={() => set((value ?? -1) + 1)} aria-label={`Increase ${label}`} disabled={value !== null && value >= max}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

export function CriteriaTab() {
  const { criteria, saveCriteria, state } = useTracker();
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState<Draft | null>(criteria ? toDraft(criteria) : null);
  const [busy, setBusy] = useState(false);

  // pick up the server copy when it first arrives / after a save or reset
  useEffect(() => {
    if (criteria) setDraft(toDraft(criteria));
  }, [criteria]);

  const dirty = useMemo(() => !!criteria && !!draft && JSON.stringify(toDraft(criteria)) !== JSON.stringify(draft), [criteria, draft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (state === 'loading' || !draft || !criteria) {
    return (
      <div className={styles.layout} aria-busy="true">
        <Skeleton h={560} r={14} />
        <Skeleton h={320} r={4} />
      </div>
    );
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const yearsBad = draft.min_years !== null && draft.max_years !== null && draft.min_years > draft.max_years;
  const emailBad = draft.email_enabled && !!draft.email_to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email_to);
  const rolesBad = draft.target_roles.length === 0;
  const invalid = yearsBad || emailBad || rolesBad;

  const save = async () => {
    if (!dirty || invalid) return;
    setBusy(true);
    await saveCriteria({ ...draft, email_to: draft.email_to?.trim() || null });
    setBusy(false);
  };

  return (
    <div className={styles.layout}>
      <Paper className={styles.sheet} tape="corners">
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
        >
          <header className={styles.head}>
            <h2 className={styles.title}>
              What should the radar <span className={styles.accent}>look for?</span>
            </h2>
            <p className={styles.updated}>Last saved {relTime(criteria.updated_at)}</p>
          </header>

          <fieldset className={form.fieldset}>
            <legend className={form.legend}>1 · Roles</legend>
            <TagInput
              label="Target roles"
              value={draft.target_roles}
              onChange={(v) => set('target_roles', v)}
              placeholder="Backend Engineer, SDE II…"
              hint="A posting's title must match one of these."
            />
            {rolesBad && <span className={form.error}>Add at least one role, or nothing will ever match.</span>}
          </fieldset>

          <fieldset className={form.fieldset}>
            <legend className={form.legend}>2 · Keywords</legend>
            <div className={styles.two}>
              <TagInput
                label="Boost when mentioned"
                tone="good"
                lowercase
                value={draft.include_keywords}
                onChange={(v) => set('include_keywords', v)}
                placeholder="java, kafka…"
                hint="Each hit raises the match score."
              />
              <TagInput
                label="Drop if the title contains"
                tone="bad"
                lowercase
                value={draft.exclude_keywords}
                onChange={(v) => set('exclude_keywords', v)}
                placeholder="intern, manager…"
                hint="Any hit in the title drops the job."
              />
            </div>
          </fieldset>

          <fieldset className={form.fieldset}>
            <legend className={form.legend}>3 · Where</legend>
            <TagInput
              label="Locations"
              value={draft.locations}
              onChange={(v) => set('locations', v)}
              placeholder="Bengaluru, Remote…"
              hint="Leave empty to accept anywhere."
            />
            <Switch checked={draft.remote_ok} onChange={(v) => set('remote_ok', v)} label="Remote roles are OK (unless limited to another region)" />
          </fieldset>

          <fieldset className={form.fieldset}>
            <legend className={form.legend}>4 · Experience</legend>
            <div className={styles.expRow}>
              <div className={form.field}>
                <span className={form.label}>Level</span>
                <Segmented<ExperienceLevel> tone="paper" label="Experience level" value={draft.experience_level} onChange={(v) => set('experience_level', v)} options={LEVELS} />
              </div>
              <YearsInput label="Min years" value={draft.min_years} onChange={(v) => set('min_years', v)} />
              <YearsInput label="Max years" value={draft.max_years} onChange={(v) => set('max_years', v)} />
            </div>
            {yearsBad && <span className={form.error}>Min years can't be more than max years.</span>}
          </fieldset>

          <fieldset className={form.fieldset}>
            <legend className={form.legend}>5 · Email digest</legend>
            <div className={styles.emailRow}>
              <Switch checked={draft.email_enabled} onChange={(v) => set('email_enabled', v)} label="Email me new matches after each scan" />
              <label className={[form.field, styles.emailField].join(' ')}>
                <span className="sr-only">Send digest to</span>
                <input
                  className={form.input}
                  type="email"
                  inputMode="email"
                  value={draft.email_to ?? ''}
                  onChange={(e) => set('email_to', e.target.value || null)}
                  placeholder="you@example.com"
                  disabled={!draft.email_enabled}
                  aria-invalid={emailBad}
                />
              </label>
            </div>
            {emailBad && <span className={form.error}>That email address doesn't look right.</span>}
          </fieldset>

          <div className={[styles.saveBar, dirty && styles.saveBarDirty].filter(Boolean).join(' ')}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={dirty ? 'dirty' : 'clean'}
                className={dirty ? styles.dirtyNote : styles.cleanNote}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                aria-live="polite"
              >
                {dirty ? 'unsaved changes' : 'all changes saved ✓'}
              </motion.span>
            </AnimatePresence>
            <span className={styles.saveBtns}>
              <Button type="button" variant="ghost" icon={<RotateCcw />} onClick={() => setDraft(toDraft(criteria))} disabled={!dirty || busy}>
                Discard
              </Button>
              <Button type="submit" variant={dirty ? 'marker' : 'ink'} icon={<Save />} disabled={!dirty || invalid} loading={busy}>
                Save criteria
              </Button>
            </span>
          </div>
        </form>
      </Paper>

      <aside className={styles.aside}>
        <Paper variant="sticky" tape="top" tilt={1.4} className={styles.note}>
          <h3 className={styles.noteTitle}>How matching works</h3>
          <ol className={styles.steps}>
            <li>
              The <b>title must match a target role</b> — otherwise the job is skipped.
            </li>
            <li>
              An <b>excluded word in the title</b> drops the job, no matter what else matches.
            </li>
            <li>
              <b>Include words boost the score</b> (0–100), so the best fits float to the top.
            </li>
            <li>
              The <b>location</b> must match one of yours — or the role is remote, remote is OK, and it isn't limited to
              another region.
            </li>
          </ol>
          <p className={styles.noteFoot}>Changes apply from the next scan (daily at {scanTimeLocal()} your time).</p>

        </Paper>
        <figure className={styles.doodle} aria-hidden="true">
          <svg viewBox="0 0 160 110">
            {[
              'M58 62c0-17 13-30 30-30s30 13 30 30-13 30-30 30-30-13-30-30Z',
              'M72 62c0-9 7-16 16-16s16 7 16 16-7 16-16 16-16-7-16-16Z',
              'M86 62c0-1.2 1-2.2 2.2-2.2s2.2 1 2.2 2.2-1 2.2-2.2 2.2-2.2-1-2.2-2.2Z',
              'M14 20c22 12 48 26 72 40',
              'M14 20l2 11M14 20l11 -1',
              'M122 98c6-4 14-4 22 0',
            ].map((d, i) => (
              <motion.path
                key={i}
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </svg>
          <figcaption>tight criteria = fewer, better emails</figcaption>
        </figure>
      </aside>
    </div>
  );
}
