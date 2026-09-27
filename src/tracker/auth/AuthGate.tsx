import { useState, type FormEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Eye, Lock, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { config, homeUrl } from '@/config';
import { profile } from '@/data/profile';
import { Button, Paper } from '@/ui';
import { RadarIcon } from '../components/RadarIcon';
import { Skeleton } from '../components/Bits';
import form from '../components/Form.module.css';
import styles from './AuthGate.module.css';

const GATES = ['loading', 'login', 'denied', 'setup', 'mismatch'] as const;
type DevGate = (typeof GATES)[number];

/** Dev-only: ?gate=loading|login|denied|setup|mismatch previews each gate state in demo mode. */
function devGate(): DevGate | null {
  if (!import.meta.env.DEV) return null;
  const g = new URLSearchParams(window.location.search).get('gate') as DevGate | null;
  return g && GATES.includes(g) ? g : null;
}

function Card({ children, label, wide }: { children: ReactNode; label: string; wide?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <main className={styles.center}>
      <motion.div
        className={[styles.cardWrap, wide && styles.cardWide].filter(Boolean).join(' ')}
        initial={reduce ? false : { opacity: 0, y: 30, rotate: -3 }}
        animate={{ opacity: 1, y: 0, rotate: -1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <Paper tape="corners" className={styles.card} aria-label={label} role="region">
          <div className={styles.brand}>
            <RadarIcon size={46} className={styles.radarOnPaper} />
            <div>
              <h1 className={styles.title}>
                Job <span className={styles.accent}>Radar</span>
              </h1>
              <p className={styles.kicker}>
                <Lock size={13} aria-hidden="true" /> private · owner only
              </p>
            </div>
          </div>
          {children}
        </Paper>
      </motion.div>
      <a className={styles.back} href={homeUrl}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to portfolio
      </a>
    </main>
  );
}

function LoginCard({ preview }: { preview?: boolean }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    const res = preview ? { error: 'Preview only — sign-in is disabled in demo mode.' } : await signIn(email, password);
    setBusy(false);
    if (res.error) setError(/invalid login/i.test(res.error) ? 'Wrong email or password.' : res.error);
  };

  return (
    <Card label="Sign in">
      <p className={styles.lead}>
        This is {profile.firstName}'s private job-search tracker. Sign in with the owner account to continue.
      </p>
      <form className={form.form} onSubmit={submit} noValidate>
        <label className={form.field}>
          <span className={form.label}>Email</span>
          <input
            className={form.input}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            autoFocus
          />
        </label>
        <label className={form.field}>
          <span className={form.label}>Password</span>
          <input
            className={form.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
          />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="ink" size="lg" loading={busy} className={styles.submit}>
          Sign in
        </Button>
      </form>
    </Card>
  );
}

function NotOwner({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <Card label="Access denied">
      <p className={styles.denied}>This radar belongs to {profile.firstName}.</p>
      <p className={styles.lead}>
        You're signed in as <b>{email ?? 'an unknown account'}</b>, which isn't the owner account. Nothing here is
        shared publicly.
      </p>
      <Button variant="ink" icon={<LogOut />} onClick={onSignOut} className={styles.submit}>
        Sign out
      </Button>
    </Card>
  );
}

/** Production build without Supabase keys: explain what this is instead of silently showing sample data. */
function SetupCard({ onPreview }: { onPreview: () => void }) {
  const docs = config.githubRepo ? `https://github.com/${config.githubRepo}/blob/main/docs/SETUP.md` : null;
  return (
    <Card label="Job Radar isn't connected yet" wide>
      <p className={styles.denied}>Job Radar isn't connected yet</p>
      <p className={styles.lead}>
        It's {profile.firstName}'s private job-search tracker. Every morning a scanner reads the careers pages on the watch list,
        keeps only the roles that fit the search criteria, and pins them to a board — <i>New → Applied → Interview → Offer</i>.
      </p>
      <p className={styles.lead}>
        This copy of the site has no database keys, so there's nothing live to show. To connect it, follow{' '}
        {docs ? (
          <a className={styles.link} href={docs} target="_blank" rel="noreferrer">
            docs/SETUP.md
          </a>
        ) : (
          <code className={styles.code}>docs/SETUP.md</code>
        )}{' '}
        (Supabase + a scheduled GitHub Action).
      </p>
      <Button variant="ink" size="lg" icon={<Eye />} onClick={onPreview} className={styles.submit}>
        Preview the demo
      </Button>
      <p className={styles.hint}>The preview runs on sample data that stays in your browser.</p>
    </Card>
  );
}

/** Signed in with the configured owner email, but the database disagrees about who the owner is. */
function OwnerMismatch({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <Card label="Owner check failed" wide>
      <p className={styles.denied}>Almost there — the owner check failed</p>
      <p className={styles.lead}>
        Signed in as <b>{email ?? 'this account'}</b>, but the database's <code className={styles.code}>is_owner()</code> allows a
        different address — make <code className={styles.code}>supabase/schema.sql</code> and{' '}
        <code className={styles.code}>VITE_OWNER_EMAIL</code> match.
      </p>
      <p className={styles.hint}>Fix the email in is_owner(), re-run schema.sql in the Supabase SQL editor, then reload this page.</p>
      <Button variant="ink" icon={<LogOut />} onClick={onSignOut} className={styles.submit}>
        Sign out
      </Button>
    </Card>
  );
}

export function GateSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Loading Job Radar">
      <div className={styles.skelBar}>
        <Skeleton h={34} w={160} />
        <Skeleton h={34} w={110} r={999} style={{ marginLeft: 'auto' }} />
      </div>
      <div className={styles.skelBody}>
        <Skeleton h={44} w="40%" />
        <Skeleton h={92} r={14} />
        <div className={styles.skelGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} h={96} r={12} />
          ))}
        </div>
        <Skeleton h={320} r={14} />
      </div>
    </div>
  );
}

/** ready? → (demo: previewing?) → session? → owner? → app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const dev = devGate();
  if (dev === 'loading' || !auth.ready) return <GateSkeleton />;
  if (dev === 'login') return <LoginCard preview />;
  if (dev === 'denied') return <NotOwner email="someone@example.com" onSignOut={() => {}} />;
  if (dev === 'setup') return <SetupCard onPreview={() => {}} />;
  if (dev === 'mismatch') return <OwnerMismatch email={config.ownerEmail} onSignOut={() => {}} />;
  if (auth.demo) return auth.isOwner ? <>{children}</> : <SetupCard onPreview={auth.enableDemoPreview} />;
  if (!auth.session) return <LoginCard />;
  if (auth.ownerMismatch) return <OwnerMismatch email={auth.email} onSignOut={() => void auth.signOut()} />;
  if (!auth.isOwner) return <NotOwner email={auth.email} onSignOut={() => void auth.signOut()} />;
  return <>{children}</>;
}
