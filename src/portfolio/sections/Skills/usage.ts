import { profile } from '@/data/profile';

/**
 * "Where I used it": looks a skill up in the experience bullets and project (tech + bullets)
 * listed in profile.ts. Only reports what the data actually says; nothing is inferred.
 */

export interface RoleHit {
  title: string;
  company: string;
  start: string;
  end: string;
}
export interface ProjectHit {
  id: string;
  title: string;
  kind: string;
}
export interface Usage {
  roles: RoleHit[];
  projects: ProjectHit[];
  /** Set when nothing matched the exact skill and a broader term was used (e.g. "AWS" for "AWS EC2"). */
  via?: string;
}

interface Term {
  text: string;
  /** Case-sensitive match (for short derived words like "React" from "React.js"). */
  cs?: boolean;
  /** Only match project tech tags, not free-text bullets. */
  techOnly?: boolean;
}

/** Hand-written synonyms for skills that are phrased differently in bullets. */
const ALIASES: Record<string, string[]> = {
  'REST APIs': ['REST'],
  RBAC: ['role-based access control'],
  'Event-Driven Architecture': ['event-driven'],
  OOP: ['object-oriented'],
  'Data Structures': ['data structure'],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function toRegex(t: Term) {
  // (?<!…)/(?!…) instead of \b so terms like "CI/CD" or "C++" work; an optional plural "s" is allowed.
  return new RegExp(`(?<![A-Za-z0-9])${escape(t.text)}s?(?![A-Za-z0-9])`, t.cs ? '' : 'i');
}

/** Ordered tiers of search terms: the first tier that finds anything wins. */
function tiers(name: string): Term[][] {
  const primary: Term[] = [{ text: name }];
  for (const a of ALIASES[name] ?? []) primary.push({ text: a });
  if (/\.js$/i.test(name)) primary.push({ text: name.replace(/\.js$/i, ''), cs: true, techOnly: true });
  if (name.includes('/') && !/^[A-Z]+\/[A-Z]+$/.test(name)) {
    // "Agile / Scrum" → "Agile", "Scrum" (but keep acronyms like "CI/CD" whole)
    for (const part of name.split('/')) if (part.trim().length > 1) primary.push({ text: part.trim() });
  }
  const out = [primary];
  const vendor = /^(AWS|GCP|Azure)\s+\S/.exec(name);
  if (vendor) out.push([{ text: vendor[1], cs: true }]);
  return out;
}

function search(terms: Term[]): Omit<Usage, 'via'> {
  const textRes = terms.filter((t) => !t.techOnly).map(toRegex);
  const techRes = terms.map(toRegex);
  const inText = (s: string) => textRes.some((r) => r.test(s));
  const inTech = (s: string) => techRes.some((r) => r.test(s));
  const roles: RoleHit[] = [];
  for (const exp of profile.experience) {
    for (const role of exp.roles) {
      if (role.bullets.some(inText)) roles.push({ title: role.title, company: exp.company, start: role.start, end: role.end });
    }
  }
  const projects: ProjectHit[] = [];
  for (const p of profile.projects) {
    if (p.tech.some(inTech) || p.bullets.some(inText)) projects.push({ id: p.id, title: p.title, kind: p.kind });
  }
  return { roles, projects };
}

const cache = new Map<string, Usage>();

export function findUsage(skill: string): Usage {
  const cached = cache.get(skill);
  if (cached) return cached;
  let result: Usage = { roles: [], projects: [] };
  const ts = tiers(skill);
  for (let i = 0; i < ts.length; i++) {
    const r = search(ts[i]);
    if (r.roles.length || r.projects.length) {
      result = i === 0 ? r : { ...r, via: ts[i][0].text };
      break;
    }
  }
  cache.set(skill, result);
  return result;
}
