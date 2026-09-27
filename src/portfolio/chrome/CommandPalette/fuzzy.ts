export interface FuzzyResult {
  score: number;
  /** indices of matched characters in the text (for highlighting) */
  indices: number[];
}

const isBoundary = (ch: string | undefined) => ch === undefined || /[\s\-_/().#]/.test(ch);

/**
 * Tiny fuzzy matcher: contiguous substring matches win, otherwise characters must appear in order,
 * with bonuses for consecutive runs and word starts. Returns null when the query does not match.
 */
export function fuzzy(query: string, text: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();

  const sub = t.indexOf(q);
  if (sub >= 0) {
    const indices = Array.from({ length: q.length }, (_, i) => sub + i);
    return { score: 1000 - sub * 3 + (isBoundary(t[sub - 1]) ? 150 : 0) - t.length * 0.2, indices };
  }

  const chars = q.replace(/\s+/g, '');
  const indices: number[] = [];
  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of chars) {
    const at = t.indexOf(ch, from);
    if (at === -1) return null;
    score += 10;
    if (at === prev + 1) score += 18;
    if (isBoundary(t[at - 1])) score += 24;
    score -= Math.min(at - from, 12);
    indices.push(at);
    prev = at;
    from = at + 1;
  }
  return { score, indices };
}
