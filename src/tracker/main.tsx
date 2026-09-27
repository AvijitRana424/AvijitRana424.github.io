import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/global.css';
import { AuthProvider } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import { TrackerApp } from './TrackerApp';

// Load the Supabase client first (no-op in demo mode) so the tracker store can use it synchronously.
getSupabase()
  .catch((err) => console.error('[tracker] could not load Supabase', err))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <AuthProvider eager>
          <TrackerApp />
        </AuthProvider>
      </StrictMode>,
    );
  });
