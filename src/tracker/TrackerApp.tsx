import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Building2, History, Kanban, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { profile } from '@/data/profile';
import { ErrorBoundary } from '@/ui';
import { Skeleton } from './components/Bits';
import { Kpis } from './components/Kpis';
import { ScanStrip } from './components/ScanStrip';
import { Tabs, useHashTab, type TabDef } from './components/Tabs';
import { ToastProvider } from './components/Toast';
import { TopBar } from './components/TopBar';
import { AuthGate } from './auth/AuthGate';
import { TrackerDataProvider, useTracker } from './data';
import { JobsTab } from './jobs/JobsTab';
import { greeting, plural } from './lib/format';
import styles from './TrackerApp.module.css';

const CompaniesTab = lazy(() => import('./companies/CompaniesTab').then((m) => ({ default: m.CompaniesTab })));
const CriteriaTab = lazy(() => import('./criteria/CriteriaTab').then((m) => ({ default: m.CriteriaTab })));
const HistoryTab = lazy(() => import('./history/HistoryTab').then((m) => ({ default: m.HistoryTab })));

const TAB_KEYS = ['jobs', 'companies', 'criteria', 'history'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const BANNER_KEY = 'job-radar-demo-banner-dismissed';

function DemoBanner() {
  const { resetDemo, persistent } = useTracker();
  const reduce = useReducedMotion();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(BANNER_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <AnimatePresence initial={false}>
      {!hidden && (
        <motion.div
          className={styles.banner}
          role="note"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10, rotate: -1 }}
          animate={{ opacity: 1, y: 0, rotate: -0.4 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, height: 0, marginBottom: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <span className={styles.bannerTape} aria-hidden="true" />
          <p className={styles.bannerText}>
            <b>Demo mode</b>{' '}
            {persistent ? (
              <>
                — sample data, saved only in this browser.{' '}
                <span className={styles.bannerMore}>
                  Connect Supabase to go live (<code>docs/SETUP.md</code>).
                </span>
              </>
            ) : (
              <>— your browser is blocking storage, so changes last only until you reload.</>
            )}
          </p>
          <div className={styles.bannerActions}>
            {confirm ? (
              <>
                <span className={styles.bannerAsk}>Wipe your changes?</span>
                <button type="button" className={styles.bannerBtn} onClick={() => setConfirm(false)}>
                  No
                </button>
                <button
                  type="button"
                  className={[styles.bannerBtn, styles.bannerDanger].join(' ')}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await resetDemo();
                    setBusy(false);
                    setConfirm(false);
                  }}
                >
                  {busy ? 'Resetting…' : 'Yes, reset'}
                </button>
              </>
            ) : (
              <button type="button" className={styles.bannerBtn} onClick={() => setConfirm(true)}>
                <RotateCcw size={15} aria-hidden="true" /> Reset<span className={styles.bannerMore}> demo data</span>
              </button>
            )}
            <button type="button" className={styles.bannerClose} onClick={dismiss} aria-label="Dismiss demo banner">
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PanelFallback() {
  return (
    <div className={styles.panelFallback} aria-busy="true">
      <Skeleton h={180} r={14} />
      <Skeleton h={180} r={14} />
    </div>
  );
}

function Dashboard() {
  const auth = useAuth();
  const data = useTracker();
  const [tab, setTab] = useHashTab<TabKey>(TAB_KEYS, 'jobs');
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set([tab]));
  useEffect(() => setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab))), [tab]);

  const loading = data.state === 'loading';
  const demo = data.store.mode === 'demo';
  const newCount = data.jobs.filter((j) => j.status === 'new').length;
  const canReauth = !demo && (data.errorKind === 'auth' || data.errorKind === 'permission');

  const tabs: TabDef<TabKey>[] = [
    { key: 'jobs', label: 'Jobs', icon: <Kanban />, count: loading ? undefined : data.jobs.filter((j) => j.status !== 'archived').length },
    { key: 'companies', label: 'Companies', icon: <Building2 />, count: loading ? undefined : data.companies.length },
    { key: 'criteria', label: 'Criteria', icon: <SlidersHorizontal /> },
    { key: 'history', label: 'History', icon: <History />, count: loading ? undefined : data.runs.length },
  ];

  const panel = (k: TabKey, node: ReactNode) =>
    visited.has(k) ? (
      <div
        key={k}
        role="tabpanel"
        id={`tr-panel-${k}`}
        aria-labelledby={`tr-tab-${k}`}
        hidden={tab !== k}
        className={styles.panel}
        tabIndex={-1}
      >
        <ErrorBoundary name={`${k} tab`}>
          <Suspense fallback={<PanelFallback />}>{node}</Suspense>
        </ErrorBoundary>
      </div>
    ) : null;

  return (
    <>
      <TopBar
        mode={data.store.mode}
        email={auth.email}
        onSignOut={() => void auth.signOut()}
        onRefresh={() => void data.reload({ quiet: true })}
        refreshing={data.refreshing}
      />
      <main className={styles.shell}>
        {data.store.mode === 'demo' && <DemoBanner />}

        <div className={styles.hello}>
          <h1 className={styles.h1}>
            {/* the demo is sample data, so don't greet the visitor as the owner */}
            {demo ? greeting() : `${greeting()}, ${profile.firstName}`}
            <span className={styles.h1Sub}>
              {data.state === 'error' ? (
                'the radar is offline right now'
              ) : loading ? (
                'tuning the radar…'
              ) : newCount ? (
                <>
                  <span className={styles.hot}>{plural(newCount, 'new match', 'new matches')}</span>{' '}
                  {demo ? 'in the sample pipeline' : 'waiting for you'}
                </>
              ) : (
                'inbox zero — nothing new to review'
              )}
            </span>
            {demo && <span className={styles.sample}>sample data</span>}
          </h1>
        </div>

        {data.state === 'error' ? (
          <div className={styles.error} role="alert">
            <p className={styles.errorTitle}>The radar couldn't load</p>
            <p>{data.error}</p>
            <div className={styles.errorActions}>
              {canReauth && (
                <button type="button" className={styles.retry} onClick={() => void auth.signOut()}>
                  Sign in again
                </button>
              )}
              <button type="button" className={canReauth ? styles.retryGhost : styles.retry} onClick={() => void data.reload()}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            <ScanStrip runs={data.runs} loading={loading} />
            <Kpis jobs={data.jobs} companies={data.companies} loading={loading} />

            <div className={styles.tabsWrap}>
              <Tabs tabs={tabs} value={tab} onChange={setTab} idPrefix="tr" />
              {panel('jobs', <JobsTab onGoCompanies={() => setTab('companies')} />)}
              {panel('companies', <CompaniesTab />)}
              {panel('criteria', <CriteriaTab />)}
              {panel('history', <HistoryTab />)}
            </div>
          </>
        )}
      </main>
      <footer className={styles.foot}>
        <span className="hand">Job Radar</span> · private tracker ·{' '}
        {demo ? 'sample data, kept only in this browser' : 'synced with Supabase'}
      </footer>
    </>
  );
}

export function TrackerApp() {
  return (
    <ToastProvider>
      <div className="board-texture" aria-hidden="true" />
      <div className={styles.app}>
        <AuthGate>
          <TrackerDataProvider>
            <Dashboard />
          </TrackerDataProvider>
        </AuthGate>
      </div>
    </ToastProvider>
  );
}
