import { Brain, Cloud, Code2, Database, LayoutTemplate, Server, ShieldCheck, Smartphone, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { profile, type SkillGroup } from '@/data/profile';

export const GROUP_ICONS: Record<SkillGroup['icon'], LucideIcon> = {
  code: Code2,
  server: Server,
  layout: LayoutTemplate,
  phone: Smartphone,
  database: Database,
  zap: Zap,
  cloud: Cloud,
  wrench: Wrench,
  shield: ShieldCheck,
  brain: Brain,
};

/** Chalk palette used to color-code categories (cycles when there are more groups than colors). */
const PALETTE = ['var(--chalk-yellow)', 'var(--chalk-blue)', 'var(--chalk-green)', 'var(--chalk-red)', 'var(--chalk)'];

export const groupColor = (group: number) => PALETTE[group % PALETTE.length];

export interface SkillItem {
  id: string;
  name: string;
  group: number;
  /** Shorter label for the 3D sphere (the full name is still used everywhere else). */
  label?: string;
  /** Part of the headline stack: drawn larger in the sphere and listed first on phones. */
  core?: boolean;
}

export const groups: SkillGroup[] = profile.skills;

/** The headline stack, in the order it is listed on phones. "AWS" covers every "AWS …" service. */
const CORE = ['Java', 'Spring Boot', 'Microservices', 'Kafka', 'Redis', 'AWS', 'System Design'];

/** Index in CORE (or -1): "AWS EC2" counts as "AWS", but "JavaScript" is not "Java". */
export const coreRank = (name: string) => CORE.findIndex((c) => name === c || name.startsWith(`${c} `));

/** Labels that are too long to read well on the sphere. */
const SPHERE_LABEL: Record<string, string> = {
  'Event-Driven Architecture': 'Event-Driven',
  'Agile / Scrum': 'Agile',
};

export const allSkills: SkillItem[] = groups.flatMap((g, gi) =>
  g.items.map((name) => ({ id: `${gi}:${name}`, name, group: gi, core: coreRank(name) >= 0 })),
);

/** Every skill, headline stack first (then category order). Used for the phone "All" view. */
export const skillsByImportance: SkillItem[] = [...allSkills].sort((a, b) => {
  const ra = coreRank(a.name);
  const rb = coreRank(b.name);
  return (ra < 0 ? CORE.length : ra) - (rb < 0 ? CORE.length : rb);
});

/**
 * Items for the 3D sphere: "AWS EC2 / S3 / RDS / SNS" collapse into one big "AWS" word and long
 * names get a short label, so the cloud has fewer, more legible words than the full list.
 */
export const sphereSkills: SkillItem[] = groups.flatMap((g, gi) => {
  const out: SkillItem[] = [];
  let aws = false;
  for (const name of g.items) {
    if (/^AWS\s/.test(name)) {
      if (!aws) out.push({ id: `${gi}:AWS`, name: 'AWS', group: gi, core: true });
      aws = true;
      continue;
    }
    out.push({ id: `${gi}:${name}`, name, group: gi, label: SPHERE_LABEL[name], core: coreRank(name) >= 0 });
  }
  return out;
});
