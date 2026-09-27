import { ArrowLeft, LogOut, RefreshCw } from 'lucide-react';
import { homeUrl } from '@/config';
import { RadarIcon } from './RadarIcon';
import styles from './TopBar.module.css';

interface Props {
  mode: 'demo' | 'supabase';
  email?: string | null;
  onSignOut?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function TopBar({ mode, email, onSignOut, onRefresh, refreshing }: Props) {
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <a className={styles.brand} href="#jobs" aria-label="Job Radar — jobs">
          <RadarIcon size={38} />
          <span className={styles.word}>
            Job <span className={styles.accent}>Radar</span>
          </span>
        </a>
        {mode === 'demo' ? (
          <span className={styles.demo} title="Data is stored only in this browser">
            Demo
          </span>
        ) : (
          <span className={styles.live} title="Connected to Supabase">
            <span className={styles.liveDot} aria-hidden="true" />
            Live
          </span>
        )}
        <div className={styles.spacer} />
        {onRefresh && (
          <button
            className={[styles.iconBtn, refreshing && styles.spinning].filter(Boolean).join(' ')}
            onClick={onRefresh}
            aria-label="Refresh data"
            title="Refresh data"
            disabled={refreshing}
          >
            <RefreshCw size={17} />
          </button>
        )}
        <a className={styles.back} href={homeUrl} aria-label="Back to portfolio">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Portfolio</span>
        </a>
        {mode === 'supabase' && email && (
          <div className={styles.user}>
            <span className={styles.email} title={email}>
              {email}
            </span>
            <button className={styles.iconBtn} onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
