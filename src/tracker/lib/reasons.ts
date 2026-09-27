// Parses the scanner's match_reasons (backend/job_radar/matcher.py) into typed chips.
// Examples: 'title ≈ Backend Engineer', 'title ~ Software Engineer (partial)', 'level: senior',
// 'level: lead (above target)', '3+ yrs', '7–10 yrs (above range)', '📍 Bengaluru', '📍 location unknown',
// '🌐 remote', '🌐 remote (region-locked)', '+java +kafka'. Unknown strings still render as plain chips.

export type ReasonKind = 'role' | 'level' | 'years' | 'location' | 'remote' | 'keywords' | 'other';

export interface Reason {
  kind: ReasonKind;
  /** short text shown on the chip */
  text: string;
  /** longer description for screen readers / tooltips */
  full: string;
  /** a penalty or caveat — rendered under "Watch out" */
  negative: boolean;
  keywords?: string[];
}

const NEGATIVE = /\b(partial|above|below|unknown|penalty|region-locked|excluded|needs|max|min)\b|✗|[<>]/i;

const strip = (s: string) =>
  s
    .replace(/^[\u{1F4CD}\u{1F310}]️?\s*/u, '') // 📍 🌐
    .replace(/\s*✗\s*$/, '')
    .trim();

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The part in trailing parentheses, e.g. "7–10 yrs (above range)" → ["7–10 yrs", "above range"]. */
function splitNote(s: string): [string, string | null] {
  const m = s.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return m ? [m[1].trim(), m[2].trim()] : [s.trim(), null];
}

export function parseReason(raw: string): Reason {
  const r = raw.trim();
  const negative = NEGATIVE.test(r);

  // keywords: "+java +kafka +distributed"
  if (/^\+\S+(\s+\+\S+)*$/.test(r)) {
    const keywords = r.split(/\s+/).map((k) => k.replace(/^\+/, ''));
    return { kind: 'keywords', text: keywords.join(', '), full: `Mentions ${keywords.join(', ')}`, negative: false, keywords };
  }

  // title
  const title = r.match(/^title\s*(≈|~|=|:)\s*(.+)$/i);
  if (title) {
    const [role, note] = splitNote(title[2]);
    if (/no target role/i.test(role)) return { kind: 'role', text: 'No target role in the title', full: r, negative: true };
    return {
      kind: 'role',
      text: note ? `${role} · ${note} match` : role,
      full: note ? `Title only partly matches ${role}` : `Title matches ${role}`,
      negative,
    };
  }

  // seniority
  const level = r.match(/^level\s*:\s*(.+)$/i);
  if (level) {
    const [lv, note] = splitNote(strip(level[1]));
    const text = `${cap(lv)} level${note ? ` · ${note}` : ''}`;
    return { kind: 'level', text, full: `Seniority: ${text}`, negative };
  }

  // location / remote
  if (/^\u{1F310}/u.test(r) || /^remote\b/i.test(r)) {
    const [txt, note] = splitNote(strip(r));
    return { kind: 'remote', text: `${cap(txt)}${note ? ` · ${note}` : ''}`, full: note ? `Remote, but ${note}` : 'Remote role', negative };
  }
  if (/^\u{1F4CD}/u.test(r) || /\blocation\b/i.test(r)) {
    const place = strip(r);
    if (/unknown/i.test(place)) return { kind: 'location', text: 'Location unknown', full: 'The posting names no location', negative: true };
    return { kind: 'location', text: place, full: negative ? `Location ${place} is outside your list` : `Location matches ${place}`, negative };
  }

  // years of experience: "3+ yrs", "2–5 yrs (below range)", "needs 8+ yrs", "years 8+ > max"
  if (/\b(yrs?|years?)\b/i.test(r)) {
    const [yrs, note] = splitNote(r);
    const text = cap(note ? `${yrs} · ${note}` : yrs);
    return { kind: 'years', text, full: `Experience asked: ${text}`, negative };
  }

  return { kind: 'other', text: cap(strip(r)), full: r, negative };
}

export function groupReasons(reasons: string[]) {
  const seen = new Set<string>();
  const parsed = reasons
    .filter((r) => r && r.trim())
    .map(parseReason)
    .filter((p) => (seen.has(p.text) ? false : (seen.add(p.text), true)));
  return {
    good: parsed.filter((p) => !p.negative && p.kind !== 'keywords'),
    keywords: parsed.filter((p) => p.kind === 'keywords').flatMap((p) => p.keywords ?? []),
    watch: parsed.filter((p) => p.negative),
  };
}
