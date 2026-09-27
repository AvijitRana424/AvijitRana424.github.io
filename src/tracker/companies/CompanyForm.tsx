import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CircleCheck, Eye, Info, Plus, TriangleAlert } from 'lucide-react';
import type { AtsType, Company } from '@/lib/types';
import {
  ATS_LABEL,
  ATS_OPTIONS,
  detectAts,
  isValidUrl,
  normaliseUrl,
  parseUrl,
  PREVIEWABLE,
  previewJobs,
  type ConcreteAts,
  type PreviewResult,
} from '@/lib/tracker/ats';
import type { NewCompanyInput } from '@/lib/tracker/store';
import { Button } from '@/ui';
import { Switch } from '../components/Bits';
import { relTime } from '../lib/format';
import form from '../components/Form.module.css';
import styles from './Companies.module.css';

const TOKEN_WORD: Record<ConcreteAts, string> = {
  greenhouse: 'token',
  lever: 'company',
  ashby: 'org',
  workday: 'site',
  smartrecruiters: 'company',
  recruitee: 'company',
  workable: 'account',
  custom: '',
};

/** "stripe" → "Stripe", "nvidia.wd5.myworkdayjobs.com/nvidia/External" → "Nvidia", careers.acme.com → "Acme". */
function guessName(d: ReturnType<typeof detectAts>, url: string) {
  let base = '';
  if (d.type === 'workday') base = d.identifier?.split('/')[1] ?? '';
  else if (d.identifier) base = d.identifier;
  else if (!d.host) {
    // a company's own careers site (not an ATS domain like boards.greenhouse.io, which says nothing about the name)
    const host = parseUrl(url)?.hostname.replace(/^(www|careers|jobs|apply)\./, '') ?? '';
    base = host.split('.')[0] ?? '';
  }
  base = base.replace(/[-_]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

export interface CompanyFormValues extends NewCompanyInput {
  active: boolean;
  /** career_url or the ATS choice changed → the scanner must re-derive the board (identifier, status). */
  sourceChanged: boolean;
}

/** What the ATS select shows for a stored company: "auto" unless the stored type disagrees with the URL
 *  (an explicit override, or an embedded board the scanner discovered). */
function initialOverride(c?: Company): AtsType {
  if (!c || c.ats_type === 'auto') return 'auto';
  return c.ats_type === detectAts(c.career_url).type ? 'auto' : c.ats_type;
}

interface Props {
  mode: 'add' | 'edit';
  initial?: Company;
  existing: Company[];
  onSubmit: (v: CompanyFormValues) => Promise<boolean>;
  onCancel?: () => void;
}

export function CompanyForm({ mode, initial, existing, onSubmit, onCancel }: Props) {
  const reduce = useReducedMotion();
  const [name, setName] = useState(initial?.name ?? '');
  const [nameTouched, setNameTouched] = useState(!!initial);
  const [url, setUrl] = useState(initial?.career_url ?? '');
  const startOverride = useMemo(() => initialOverride(initial), [initial]);
  const [override, setOverride] = useState<AtsType>(startOverride);
  const [overrideTouched, setOverrideTouched] = useState(false);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const detected = useMemo(() => detectAts(url), [url]);
  const urlOk = isValidUrl(url);
  // only for the live preview + hints — never saved (the scanner derives and stores the identifier)
  const effective: ConcreteAts = override === 'auto' ? detected.type : (override as ConcreteAts);
  const urlChanged = !initial || normaliseUrl(url) !== normaliseUrl(initial.career_url);
  // (an embedded board the scanner discovered on the company's own domain can still be previewed)
  const identifier =
    effective === detected.type ? detected.identifier : !urlChanged && initial?.ats_type === effective ? initial.ats_identifier : null;
  const canPreview = urlOk && PREVIEWABLE.includes(effective) && !!identifier;
  const sourceChanged = mode === 'add' || urlChanged || override !== startOverride;

  const duplicate = useMemo(() => {
    const u = parseUrl(url);
    if (!u) return null;
    const key = (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '')).toLowerCase();
    return (
      existing.find((c) => {
        if (c.id === initial?.id) return false;
        const cu = parseUrl(c.career_url);
        return cu && (cu.hostname.replace(/^www\./, '') + cu.pathname.replace(/\/$/, '')).toLowerCase() === key;
      }) ?? null
    );
  }, [url, existing, initial?.id]);

  const errors = {
    name: !name.trim() ? 'Give it a name.' : '',
    url: !url.trim() ? 'Paste the careers page URL.' : !urlOk ? "That doesn't look like a URL." : '',
  };
  const invalid = !!(errors.name || errors.url);

  const onUrl = (v: string) => {
    setUrl(v);
    setPreview(null);
    // a new URL makes the stored (scanner-derived) type stale — go back to auto unless the user picked one
    if (!overrideTouched) setOverride(initial && normaliseUrl(v) === normaliseUrl(initial.career_url) ? startOverride : 'auto');
    if (!nameTouched) setName(isValidUrl(v) ? guessName(detectAts(v), v) : '');
  };

  const runPreview = async () => {
    setPreviewing(true);
    setPreview(await previewJobs(effective, identifier));
    setPreviewing(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (invalid) return;
    setBusy(true);
    const ok = await onSubmit({
      name: name.trim(),
      career_url: normaliseUrl(url),
      ats_type: override, // 'auto' by default: the scanner runs its own detection
      notes: notes.trim() || null,
      active,
      sourceChanged,
    });
    setBusy(false);
    if (ok && mode === 'add') {
      setName('');
      setNameTouched(false);
      setUrl('');
      setOverride('auto');
      setOverrideTouched(false);
      setNotes('');
      setActive(true);
      setSubmitted(false);
      setPreview(null);
    }
  };

  let detect: { tone: 'ok' | 'warn' | 'info'; text: ReactNode };
  if (!url.trim()) {
    detect = {
      tone: 'info',
      text: 'Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Recruitee and Workable links are detected automatically.',
    };
  } else if (!urlOk) {
    detect = { tone: 'warn', text: "That doesn't look like a URL yet." };
  } else if (mode === 'edit' && initial && !sourceChanged && initial.ats_identifier && initial.ats_type !== 'custom' && initial.ats_type !== 'auto') {
    detect = {
      tone: 'ok',
      text: (
        <>
          The scanner reads <b>{ATS_LABEL[initial.ats_type]}</b> · <code>{initial.ats_identifier}</code>
        </>
      ),
    };
  } else if (override !== 'auto' && override !== detected.type) {
    detect = {
      tone: 'warn',
      text:
        override === 'custom' ? (
          <>
            Override: <b>Custom page</b> — the scanner will parse job links from the page HTML instead of an ATS API.
          </>
        ) : (
          <>
            Override: <b>{ATS_LABEL[override]}</b> (the URL looks like {detected.host ? ATS_LABEL[detected.host] : 'a custom page'}). The
            scanner will look for the {ATS_LABEL[override]} board itself.
          </>
        ),
    };
  } else if (detected.type === 'custom' && detected.host) {
    detect = {
      tone: 'warn',
      text: (
        <>
          That's a {ATS_LABEL[detected.host]} link, but there's no {TOKEN_WORD[detected.host]} in it — paste the board's main page.
        </>
      ),
    };
  } else if (detected.type === 'custom') {
    detect = {
      tone: 'info',
      text: 'Custom page — the scanner parses job links from the HTML (and switches to an embedded Greenhouse/Lever/Ashby board if it finds one).',
    };
  } else {
    detect = {
      tone: 'ok',
      text: (
        <>
          Detected: <b>{ATS_LABEL[detected.type]}</b> · {TOKEN_WORD[detected.type]} <code>{detected.identifier}</code>
        </>
      ),
    };
  }
  const DetectIcon = detect.tone === 'ok' ? CircleCheck : detect.tone === 'warn' ? TriangleAlert : Info;

  const idp = mode === 'add' ? 'add-co' : `edit-co-${initial?.id}`;

  const failing = mode === 'edit' && initial?.last_status === 'error';

  return (
    <form className={form.form} onSubmit={submit} noValidate>
      {failing && (
        <div className={styles.lastError} role="note">
          <TriangleAlert size={17} aria-hidden="true" />
          <div className={styles.lastErrorBody}>
            <p className={styles.lastErrorHead}>
              Last check failed <span>{relTime(initial?.last_checked_at)}</span>
            </p>
            <p className={styles.lastErrorText}>{initial?.last_error || 'The scanner gave no details.'}</p>
            <p className={styles.lastErrorHint}>
              {sourceChanged
                ? 'Saving this change clears the error — the company waits for the next scan.'
                : "Fix the URL (or pick the ATS) below; saving a change resets it to “waiting for the next scan”."}
            </p>
          </div>
        </div>
      )}
      <label className={form.field}>
        <span className={form.label}>Career page URL</span>
        <input
          id={`${idp}-url`}
          className={form.input}
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://job-boards.greenhouse.io/stripe"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={submitted && !!errors.url}
          aria-describedby={`${idp}-detect`}
        />
        <motion.span
          id={`${idp}-detect`}
          key={detect.tone + String(detected.type)}
          className={[styles.detect, styles[`detect_${detect.tone}`]].join(' ')}
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          aria-live="polite"
        >
          <DetectIcon size={15} aria-hidden="true" />
          <span>{detect.text}</span>
        </motion.span>
        {submitted && errors.url && <span className={form.error}>{errors.url}</span>}
        {duplicate && (
          <span className={form.error}>
            Heads up — you already watch <b>{duplicate.name}</b> with this URL.
          </span>
        )}
      </label>

      <div className={form.row}>
        <label className={form.field}>
          <span className={form.label}>Company name</span>
          <input
            className={form.input}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder="Stripe"
            aria-invalid={submitted && !!errors.name}
          />
          {submitted && errors.name && <span className={form.error}>{errors.name}</span>}
        </label>
        <label className={form.field}>
          <span className={form.label}>ATS</span>
          <select
            className={form.select}
            value={override}
            onChange={(e) => {
              setOverride(e.target.value as AtsType);
              setOverrideTouched(true);
              setPreview(null);
            }}
          >
            {ATS_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {ATS_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={form.field}>
        <span className={form.label}>
          Notes <span className={form.optional}>optional</span>
        </span>
        <textarea className={form.textarea} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Team you're targeting, referral contact…" />
      </label>

      {mode === 'edit' && <Switch checked={active} onChange={setActive} label={active ? 'Watching — included in daily scans' : 'Paused — skipped by the scanner'} />}

      <AnimatePresence initial={false}>
        {preview && (
          <motion.div
            className={[styles.preview, preview.ok ? styles.previewOk : styles.previewFail].join(' ')}
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0, rotate: -1 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto', rotate: -0.6 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            role="status"
          >
            {preview.ok ? (
              <>
                <p className={styles.previewHead}>
                  {preview.count ? (
                    <>
                      <b>{preview.count}</b> open role{preview.count === 1 ? '' : 's'} on the board right now
                    </>
                  ) : (
                    'The board is reachable but has no open roles right now.'
                  )}
                </p>
                {preview.sampleTitles.length > 0 && (
                  <ul className={styles.previewList}>
                    {preview.sampleTitles.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                )}
                <p className={styles.previewFoot}>Only roles matching your criteria will land on the radar.</p>
              </>
            ) : (
              <p className={styles.previewHead}>{preview.message}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={[form.actions, form.actionsSplit].join(' ')}>
        <Button
          type="button"
          variant="ghost"
          icon={<Eye />}
          onClick={runPreview}
          loading={previewing}
          disabled={!canPreview}
          title={canPreview ? 'Fetch the public job board from your browser' : 'Live preview works for Greenhouse, Lever and Ashby boards'}
          className={styles.previewBtn}
        >
          Preview openings
        </Button>
        <span className={styles.formBtns}>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant={mode === 'add' ? 'marker' : 'ink'} icon={mode === 'add' ? <Plus /> : undefined} loading={busy}>
            {mode === 'add' ? 'Add company' : 'Save changes'}
          </Button>
        </span>
      </div>
    </form>
  );
}
