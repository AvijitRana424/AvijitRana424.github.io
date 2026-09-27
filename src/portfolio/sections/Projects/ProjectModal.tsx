import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button, LinkButton, Modal } from '@/ui';
import type { Project } from '@/data/profile';
import { ProjectArt } from './ProjectArt';
import { KindSticker, projectLinks } from './ProjectCard';
import { techFill, techMonogram } from './tech';
import s from './ProjectModal.module.css';

interface Props {
  project: Project | null;
  index: number;
  total: number;
  onClose: () => void;
  onStep: (dir: 1 | -1) => void;
}

/** Project details: big art, full bullets, tech chips, links, prev/next. */
export function ProjectModal({ project, index, total, onClose, onStep }: Props) {
  const reduce = useReducedMotion();
  // keep content during the exit animation
  const last = useRef<Project | null>(project);
  if (project) last.current = project;
  const p = project ?? last.current;

  useEffect(() => {
    if (!project || total < 2) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'ArrowRight') onStep(1);
      if (e.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project, total, onStep]);

  const links = p ? projectLinks(p) : [];

  return (
    <Modal open={!!project} onClose={onClose} title={p?.title} width={780} tone="paper" className={s.modal}>
      {p && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={p.id}
            className={s.wrap}
            style={{ ['--tint' as string]: p.tint }}
            initial={reduce ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={s.art}>
              <ProjectArt id={p.id} title={p.title} />
              <KindSticker kind={p.kind} className={s.kind} />
            </div>

            <p className={s.subtitle}>{p.subtitle}</p>

            <div className={s.grid}>
              <div>
                <p className={s.blurb}>{p.blurb}</p>
                <h3 className={s.label}>what I built</h3>
                <ul className={s.bullets}>
                  {p.bullets.map((b) => (
                    <li key={b}>
                      <svg viewBox="0 0 16 16" aria-hidden="true" className={s.tick}>
                        <path d="M2.5 8.6 C4 9.8, 5.2 11.2, 6.2 12.6 C8 8.6, 10.6 5.4, 13.6 2.8" />
                      </svg>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <aside className={s.side}>
                <h3 className={s.label}>built with</h3>
                <ul className={s.chips}>
                  {p.tech.map((t) => (
                    <li key={t} className={s.chip}>
                      <span className={s.mono} style={{ background: techFill(t) }} aria-hidden="true">
                        {techMonogram(t)}
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
                {links.length > 0 && (
                  <>
                    <h3 className={s.label}>links</h3>
                    <div className={s.links}>
                      {links.map((l) => (
                        <LinkButton key={l.key} href={l.href} target="_blank" rel="noopener noreferrer" variant="ink" size="sm" icon={l.icon}>
                          {l.label}
                        </LinkButton>
                      ))}
                    </div>
                  </>
                )}
              </aside>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {total > 1 && (
        <nav className={s.pager} aria-label="More projects">
          <Button variant="ghost" size="sm" icon={<ArrowLeft />} onClick={() => onStep(-1)}>
            previous
          </Button>
          <span className={s.count}>
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          <Button variant="ghost" size="sm" iconRight={<ArrowRight />} onClick={() => onStep(1)}>
            next
          </Button>
        </nav>
      )}
    </Modal>
  );
}
