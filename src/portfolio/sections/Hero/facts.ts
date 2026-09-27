// Quick facts for the back of the polaroid, derived from profile data (never hard-coded).
import { profile } from '@/data/profile';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseMonth(s: string): Date | null {
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1].toLowerCase());
  return idx < 0 ? null : new Date(Number(m[2]), idx, 1);
}

export interface Fact {
  value: string;
  label: string;
}

export function quickFacts(): Fact[] {
  const facts: Fact[] = [];

  // Years of experience: from the earliest role start date.
  const starts = profile.experience
    .flatMap((e) => e.roles.map((r) => parseMonth(r.start)))
    .filter((d): d is Date => !!d)
    .map((d) => d.getTime());
  if (starts.length) {
    const years = Math.floor((Date.now() - Math.min(...starts)) / (365.25 * 24 * 3600 * 1000));
    if (years >= 1) facts.push({ value: `${years}+`, label: years === 1 ? 'year exp.' : 'years exp.' });
  }

  // CGPA from the first education entry ("CGPA 9.51 / 10").
  const edu = profile.education[0];
  const gpa = edu && /cgpa\s*([\d.]+)/i.exec(edu.detail);
  if (gpa) facts.push({ value: gpa[1], label: 'CGPA' });

  // App downloads metric.
  const dl = profile.experience.flatMap((e) => e.metrics ?? []).find((m) => /download/i.test(m.label));
  if (dl) facts.push({ value: `${dl.prefix ?? ''}${dl.value}${dl.suffix}`, label: 'downloads' });

  return facts.slice(0, 3);
}

export function currentRole() {
  const job = profile.experience[0];
  const role = job?.roles[0];
  return role ? { title: role.title, company: job.company } : { title: profile.role, company: '' };
}

export const city = profile.location.split(',')[0].trim();
