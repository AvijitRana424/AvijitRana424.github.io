import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { ArrowUpRight, ExternalLink, FileText } from 'lucide-react';
import { GitHubIcon, IconLink, Paper } from '@/ui';
import type { Project } from '@/data/profile';
import { ProjectArt } from './ProjectArt';
import { techFill } from './tech';
import s from './ProjectCard.module.css';

export const KIND_LABEL: Record<Project['kind'], string> = {
  personal: 'personal',
  work: 'work',
  'this-site': 'this site',
};

export function projectLinks(p: Project) {
  const out: { key: string; href: string; label: string; icon: ReactNode }[] = [];
  if (p.links.repo) out.push({ key: 'repo', href: p.links.repo, label: 'Source code', icon: <GitHubIcon /> });
  if (p.links.live) out.push({ key: 'live', href: p.links.live, label: 'Live site', icon: <ExternalLink /> });
  if (p.links.caseStudy) out.push({ key: 'case', href: p.links.caseStudy, label: 'Case study', icon: <FileText /> });
  return out;
}

export function KindSticker({ kind, className }: { kind: Project['kind']; className?: string }) {
  return <span className={[s.kind, s[`kind-${kind}`], className].filter(Boolean).join(' ')}>{KIND_LABEL[kind]}</span>;
}

/**
 * Greedy one-row fit: keep the data order, skip a name that is too long for the space left and
 * try the next one, reserving room for the "+N" chip whenever something is left out.
 */
function pickFit(widths: number[], moreW: number, gap: number, avail: number, max: number): number[] {
  const all = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, widths.length - 1);
  if (widths.length <= max && all <= avail + 0.5) return widths.map((_, i) => i);
  const out: number[] = [];
  let used = moreW;
  for (let i = 0; i < widths.length && out.length < max; i++) {
    const next = used + gap + widths[i];
    if (next <= avail + 0.5) {
      out.push(i);
      used = next;
    }
  }
  return out;
}

interface Measured {
  key: string;
  widths: number[];
  more: number;
  gap: number;
}

/**
 * Readable full-name tech chips on a single row (up to `max`), then "+N" for the rest.
 * Every chip is rendered once to read its width (before paint, so nothing flashes); after that a
 * resize only re-picks from the cached widths. The complete list stays in the accessible name
 * and in the details modal.
 */
export function TechChips({ tech, max = 4 }: { tech: string[]; max?: number }) {
  const ref = useRef<HTMLUListElement>(null);
  const measured = useRef<Measured | null>(null);
  const [fit, setFit] = useState<{ key: string; idx: number[] } | null>(null);
  const [tick, setTick] = useState(0);
  const key = tech.join('|');
  const measuring = !fit || fit.key !== key;

  useLayoutEffect(() => {
    if (!measuring) return;
    const ul = ref.current;
    const avail = ul?.clientWidth ?? 0;
    if (!ul || !avail) return; // not laid out yet → the ResizeObserver asks again
    const kids = Array.from(ul.children) as HTMLElement[];
    const n = key ? key.split('|').length : 0;
    // offsetWidth ignores the card's 3D transforms; it is rounded, so add 1px of slack
    const m: Measured = {
      key,
      widths: kids.slice(0, n).map((el) => el.offsetWidth + 1),
      more: (kids[n]?.offsetWidth ?? 0) + 1,
      gap: parseFloat(getComputedStyle(ul).columnGap) || 0,
    };
    measured.current = m;
    setFit({ key, idx: pickFit(m.widths, m.more, m.gap, avail, max) });
  }, [measuring, key, max, tick]);

  // a web font still loading changes every width → measure once more when it lands
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts || fonts.status !== 'loading') return;
    let alive = true;
    fonts.ready.then(() => {
      if (!alive) return;
      measured.current = null;
      setFit(null);
    });
    return () => {
      alive = false;
    };
  }, []);

  // container width changed (viewport / card resize) → re-pick from the cached widths
  useEffect(() => {
    const ul = ref.current;
    if (!ul || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = ul.clientWidth;
      if (!w) return;
      const m = measured.current;
      if (!m) return setTick((t) => t + 1);
      const idx = pickFit(m.widths, m.more, m.gap, w, max);
      setFit((prev) => (prev && prev.key === m.key && prev.idx.join() === idx.join() ? prev : { key: m.key, idx }));
    });
    ro.observe(ul);
    return () => ro.disconnect();
  }, [max]);

  const shown = measuring ? tech.map((_, i) => i) : fit.idx;
  const rest = tech.filter((_, i) => !shown.includes(i));
  const restCount = measuring ? tech.length : rest.length; // measuring pass renders a "+N" probe

  return (
    <ul ref={ref} className={s.tech} aria-label="Built with">
      {shown.map((i) => (
        <li key={tech[i]} className={s.chip} style={{ ['--chip' as string]: techFill(tech[i]) }}>
          {tech[i]}
        </li>
      ))}
      {restCount > 0 && (
        <li className={`${s.chip} ${s.more}`} title={rest.join(', ')}>
          <span aria-hidden="true">+{restCount}</span>
          <span className="sr-only">and {rest.join(', ')}</span>
        </li>
      )}
    </ul>
  );
}

interface Props {
  project: Project;
  /** Card click / title / "details" — parent decides (open modal or bring to front). */
  onActivate: () => void;
  /** Fixed-height layout used on the 3D wall & swipe deck (blurb clamps). */
  fixed?: boolean;
  /** Remove the card's controls from the tab order (cards turned away on the wall). */
  inactive?: boolean;
  className?: string;
  style?: CSSProperties;
  headingLevel?: 'h3' | 'h4';
  /** Resting rotation (deg). */
  tilt?: number;
}

/** A pinned paper project card: illustrated art panel, title, red tagline, blurb, readable tech chips + links. */
export function ProjectCard({ project: p, onActivate, fixed, inactive, className, style, headingLevel = 'h3', tilt = 0 }: Props) {
  const links = projectLinks(p);
  const Heading = headingLevel;
  const tab = inactive ? -1 : 0;

  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) return; // external links handle themselves
    onActivate();
  };

  return (
    <Paper
      pin
      tilt={tilt}
      className={[s.card, fixed && s.fixed, className].filter(Boolean).join(' ')}
      style={{ ...style, ['--tint' as string]: p.tint }}
      onClick={onClick}
      data-project={p.id}
    >
      <div className={s.artPanel}>
        <ProjectArt id={p.id} title={p.title} />
        <KindSticker kind={p.kind} className={s.kindPos} />
      </div>

      <div className={s.body}>
        <Heading className={s.title}>
          <button type="button" className={s.titleBtn} tabIndex={tab} aria-haspopup="dialog">
            {p.title}
          </button>
        </Heading>
        <p className={s.subtitle}>{p.subtitle}</p>
        <p className={s.blurb}>{p.blurb}</p>

        <div className={s.foot}>
          <TechChips tech={p.tech} />
          <div className={s.links}>
            {links.map((l) => (
              <IconLink key={l.key} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`${p.title}: ${l.label}`} title={l.label} tabIndex={tab}>
                {l.icon}
              </IconLink>
            ))}
            {links.length === 0 && (
              <button type="button" className={s.details} tabIndex={tab} aria-haspopup="dialog" aria-label={`Details: ${p.title}`}>
                details <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </Paper>
  );
}
