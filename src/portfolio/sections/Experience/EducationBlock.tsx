import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Award, GraduationCap } from 'lucide-react';
import type { Education } from '@/data/profile';
import { Paper, TiltCard } from '@/ui';
import { CircleMark, Rosette } from './doodles';
import styles from './Experience.module.css';

interface Achievement {
  title: string;
  org: string;
  year: string;
}

/** "CGPA 9.51 / 10" → the first number gets a hand-drawn red circle around it. */
function CircledDetail({ text }: { text: string }) {
  const m = /\d+(?:\.\d+)?/.exec(text);
  if (!m) return <>{text}</>;
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  return (
    <>
      {before}
      <span className={styles.circled}>
        {m[0]}
        <CircleMark className={styles.circle} />
      </span>
      {after}
    </>
  );
}

export function EducationBlock({ education, achievements }: { education: Education[]; achievements: Achievement[] }) {
  const reduce = useReducedMotion();
  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const, delay: i * 0.08 },
        };

  return (
    <div className={styles.lower}>
      {education.length > 0 && (
        <section className={styles.edu} aria-labelledby="exp-education-title">
          <h3 id="exp-education-title" className={styles.subhead}>
            <GraduationCap aria-hidden="true" /> Education
          </h3>
          {education.map((e, i) => (
            <motion.article key={e.school} className={styles.eduItem} {...rise(i)}>
              <div className={`${styles.monogram} ${styles.monogramSm}`} style={{ '--mono': e.color } as CSSProperties} aria-hidden="true">
                {e.monogram}
              </div>
              <div className={styles.eduBody}>
                <div className={styles.eduTop}>
                  <h4 className={`${styles.school} squiggle`}>{e.school}</h4>
                  <p className={styles.location}>{e.location}</p>
                </div>
                <p className={styles.degree}>{e.degree}</p>
                <div className={styles.eduMeta}>
                  <p className={styles.detail}>
                    <CircledDetail text={e.detail} />
                  </p>
                  <p className={styles.eduDates}>
                    {e.start} <span aria-hidden="true">–</span>
                    <span className="sr-only">to</span> {e.end}
                  </p>
                </div>
              </div>
            </motion.article>
          ))}
        </section>
      )}

      {achievements.length > 0 && (
        <section className={styles.awards} aria-labelledby="exp-achievements-title">
          <h3 id="exp-achievements-title" className={styles.subhead}>
            <Award aria-hidden="true" /> Achievements
          </h3>
          <ul className={styles.awardList}>
            {achievements.map((a, i) => (
              <motion.li key={a.title} {...rise(i + 1)}>
                <TiltCard max={8} lift={16} rest={0} glare={false}>
                  <Paper variant="sticky" tape="top" tilt={i % 2 ? -1.6 : 1.8} className={styles.award}>
                    <Rosette className={styles.rosette} />
                    <div>
                      <p className={styles.awardTitle}>{a.title}</p>
                      <p className={styles.awardMeta}>
                        {a.org} <span aria-hidden="true">·</span> <span className={styles.awardYear}>{a.year}</span>
                      </p>
                    </div>
                  </Paper>
                </TiltCard>
              </motion.li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
