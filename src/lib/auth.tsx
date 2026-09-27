import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { config, isDemoMode } from '@/config';

const DEMO_PREVIEW_KEY = 'demo-preview';

/** In a production build without Supabase keys, the demo is opt-in (?demo or a remembered flag),
 *  so ordinary visitors never see upload controls or sample tracker data. Dev builds always preview. */
function readDemoPreview(): boolean {
  if (!isDemoMode) return false;
  if (import.meta.env.DEV) return true;
  try {
    if (new URLSearchParams(window.location.search).has('demo')) {
      localStorage.setItem(DEMO_PREVIEW_KEY, '1');
      return true;
    }
    return localStorage.getItem(DEMO_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

export interface AuthState {
  /** true once the initial session (and owner) check has finished */
  ready: boolean;
  /** No Supabase keys configured: data lives in this browser only. */
  demo: boolean;
  /** Demo mode AND the viewer opted into the preview (always true in dev). */
  demoPreview: boolean;
  enableDemoPreview: () => void;
  session: Session | null;
  email: string | null;
  /** Owner can upload resumes and use the tracker. In demo mode: true only while previewing. */
  isOwner: boolean;
  /** Signed in with the configured owner email, but the database's is_owner() says no —
   *  the email in supabase/schema.sql and VITE_OWNER_EMAIL disagree. Show a specific hint. */
  ownerMismatch: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const SESSION_KEY = 'avijit-portfolio-auth';

const hasStoredSession = () => {
  try {
    return !!localStorage.getItem(SESSION_KEY);
  } catch {
    return false;
  }
};

/**
 * eager — load Supabase and check the session right away (tracker). Otherwise (portfolio) the
 * client is only loaded when a stored session exists, so anonymous visitors never download it.
 */
export function AuthProvider({ children, eager = false }: { children: ReactNode; eager?: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(isDemoMode);
  const [demoPreview, setDemoPreview] = useState(readDemoPreview);
  // Owner status comes from the database's is_owner() — the single source of truth.
  const [owner, setOwner] = useState<{ uid: string; isOwner: boolean } | null>(null);

  useEffect(() => {
    if (isDemoMode) return;
    if (!eager && !hasStoredSession()) {
      setSessionChecked(true);
      return;
    }
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    getSupabase()
      .then(async (sb) => {
        if (!sb || !alive) return;
        const { data } = await sb.auth.getSession();
        if (!alive) return;
        setSession(data.session);
        const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
        unsubscribe = () => sub.subscription.unsubscribe();
      })
      .catch((err) => console.error('[auth] session check failed', err))
      .finally(() => alive && setSessionChecked(true));
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  // Ask the database whether this session is the owner whenever the signed-in user changes.
  const userId = session?.user?.id ?? null;
  const email = session?.user?.email?.toLowerCase() ?? null;
  useEffect(() => {
    if (isDemoMode || !userId) return;
    let alive = true;
    const emailMatches = !!email && email === config.ownerEmail;
    getSupabase()
      .then(async (sb) => {
        if (!sb) return;
        const { data, error } = await sb.rpc('is_owner');
        // rpc unavailable (schema not run yet) → fall back to the configured owner email
        if (alive) setOwner({ uid: userId, isOwner: error ? emailMatches : data === true });
      })
      .catch(() => alive && setOwner({ uid: userId, isOwner: emailMatches }));
    return () => {
      alive = false;
    };
  }, [userId, email]);

  const enableDemoPreview = useCallback(() => {
    try {
      localStorage.setItem(DEMO_PREVIEW_KEY, '1');
    } catch {
      /* private mode: preview for this page view only */
    }
    setDemoPreview(true);
  }, []);

  const value = useMemo<AuthState>(() => {
    const ownerKnown = !!userId && owner?.uid === userId;
    return {
      ready: isDemoMode || (sessionChecked && (!userId || ownerKnown)),
      demo: isDemoMode,
      demoPreview,
      enableDemoPreview,
      session,
      email,
      isOwner: isDemoMode ? demoPreview : ownerKnown && !!owner?.isOwner,
      ownerMismatch: !isDemoMode && ownerKnown && !owner?.isOwner && !!email && email === config.ownerEmail,
      async signIn(emailIn, password) {
        const sb = await getSupabase();
        if (!sb) return { error: null };
        const { data, error } = await sb.auth.signInWithPassword({ email: emailIn.trim(), password });
        if (!error) setSession(data.session);
        return { error: error?.message ?? null };
      },
      async signOut() {
        const sb = await getSupabase();
        // local scope: signing out here doesn't revoke the owner's sessions on other devices
        if (sb) await sb.auth.signOut({ scope: 'local' });
      },
    };
  }, [sessionChecked, session, userId, email, owner, demoPreview, enableDemoPreview]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
