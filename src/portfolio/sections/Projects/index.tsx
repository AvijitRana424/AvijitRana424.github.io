import { useCallback, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SectionHeading } from '@/ui';
import { profile, type Project } from '@/data/profile';
import { ProjectCard } from './ProjectCard';
import { ProjectModal } from './ProjectModal';
import { SwipeDeck } from './SwipeDeck';
import { Wall } from './Wall';
import { useMediaQuery } from './hooks';
import s from './Projects.module.css';

type Filter = 'all' | 'personal' | 'work';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'personal', label: 'Personal' },
  { key: 'work', label: 'Work' },
];
/** "Personal" covers side projects and this site; "Work" is client/employer work. */
const matches = (p: Project, f: Filter) => f === 'all' || (f === 'work' ? p.kind === 'work' : p.kind !== 'work');
const GRID_TILT = [-1.2, 0.9, -0.6, 1.1, -0.9, 0.7];

/** Projects — "pinned up" on a 3D wall that turns as you scroll. */
export default function Projects() {
  const reduce = useReducedMotion();
  const desktop = useMediaQuery('(min-width: 900px)');
  const all = profile.projects as Project[];
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useMemo(() => all.filter((p) => matches(p, filter)), [all, filter]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, all.filter((p) => matches(p, f.key)).length])) as Record<Filter, number>,
    [all],
  );

  const openIndex = list.findIndex((p) => p.id === openId);
  const openProject = openIndex >= 0 ? list[openIndex] : null;
  const step = useCallback(
    (dir: 1 | -1) => {
      if (openIndex < 0 || !list.length) return;
      setOpenId(list[(openIndex + dir + list.length) % list.length].id);
    },
    [openIndex, list],
  );
  const close = useCallback(() => setOpenId(null), []);

  const mode: 'wall' | 'deck' | 'grid' = reduce ? 'grid' : desktop ? 'wall' : 'deck';

  const header = (
    <div className={s.head}>
      <SectionHeading id="projects-title" title="Projects" accent="pinned up" className={s.heading} />
      <FilterChips value={filter} onChange={setFilter} counts={counts} />
    </div>
  );

  return (
    <section id="projects" aria-labelledby="projects-title" className={[s.section, mode === 'wall' && s.wallMode].filter(Boolean).join(' ')}>
      {mode === 'wall' ? (
        <Wall projects={list} header={header} onOpen={setOpenId} />
      ) : (
        <>
          <div className="container">{header}</div>
          {mode === 'deck' ? (
            <SwipeDeck projects={list} onOpen={setOpenId} />
          ) : (
            <div className="container">
              <ul className={s.grid}>
                {list.map((p, i) => (
                  <li key={p.id}>
                    <ProjectCard project={p} tilt={GRID_TILT[i % GRID_TILT.length]} onActivate={() => setOpenId(p.id)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <ProjectModal project={openProject} index={Math.max(0, openIndex)} total={list.length} onClose={close} onStep={step} />
    </section>
  );
}

function FilterChips({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: Record<Filter, number> }) {
  const reduce = useReducedMotion();
  return (
    <div className={s.filters} role="group" aria-label="Filter projects" data-no-drag>
      {FILTERS.map((f) => {
        const on = f.key === value;
        return (
          <button key={f.key} type="button" className={[s.chip, on && s.chipOn].filter(Boolean).join(' ')} aria-pressed={on} onClick={() => onChange(f.key)}>
            {on && (
              <motion.svg
                layoutId={reduce ? undefined : 'projects-filter-loop'}
                className={s.loop}
                viewBox="0 0 120 48"
                preserveAspectRatio="none"
                aria-hidden="true"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              >
                <motion.path
                  d="M20 9 C48 2, 104 3, 114 19 C122 33, 92 44, 58 44 C24 44, 3 37, 5 23 C7 13, 22 8, 36 6.5"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                />
              </motion.svg>
            )}
            <span className={s.chipLabel}>{f.label}</span>
            <span className={s.chipCount} aria-label={`${counts[f.key]} projects`}>
              {counts[f.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
