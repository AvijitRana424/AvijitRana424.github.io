// Runtime configuration. Values come from Vite env vars (see .env.example).
// With no Supabase values the whole site runs in DEMO mode: data lives in this browser only.

const env = import.meta.env;

export const config = {
  supabaseUrl: (env.VITE_SUPABASE_URL as string | undefined)?.trim() || '',
  supabaseAnonKey: (env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '',
  ownerEmail: ((env.VITE_OWNER_EMAIL as string | undefined)?.trim() || 'ranaavijit80@gmail.com').toLowerCase(),
  /** "owner/repo" — used to link to the GitHub Actions scan workflow. */
  githubRepo: (env.VITE_GITHUB_REPO as string | undefined)?.trim() || '',
  /** Base URL the site is served from ("/" or "/<repo>/"), always ends with "/". */
  baseUrl: env.BASE_URL,
};

export const isDemoMode = !config.supabaseUrl || !config.supabaseAnonKey;

/** Build an absolute-to-site URL for files in /public, respecting the GitHub Pages base path. */
export const asset = (path: string) => `${config.baseUrl}${path.replace(/^\//, '')}`;

/** URL of the job tracker page. */
export const trackerUrl = `${config.baseUrl}tracker/`;
/** URL of the portfolio page. */
export const homeUrl = config.baseUrl;

/** Link to the scanner workflow on GitHub (for "Run scan now"), or null if the repo is unknown. */
export const scanWorkflowUrl = config.githubRepo
  ? `https://github.com/${config.githubRepo}/actions/workflows/job-fetch.yml`
  : null;
