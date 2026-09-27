import type { SupabaseClient } from '@supabase/supabase-js';
import { config, isDemoMode } from '@/config';

export const RESUME_BUCKET = 'resumes';

let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient | null> | null = null;

/**
 * Shared Supabase client, loaded on demand so supabase-js (~55 KB gz) stays out of the portfolio's
 * critical path. Resolves to null in demo mode. Same storage key on every page, so a login on
 * /tracker/ is also seen by the portfolio page (resume upload).
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (isDemoMode) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  loading ??= import('@supabase/supabase-js').then(({ createClient }) => {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'avijit-portfolio-auth' },
    });
    return client;
  });
  return loading;
}

/** The client if getSupabase() has already resolved, else null. (The tracker awaits it before rendering.) */
export function peekSupabase(): SupabaseClient | null {
  return client;
}
