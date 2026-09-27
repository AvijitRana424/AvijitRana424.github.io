import { motion, useReducedMotion } from 'framer-motion';
import { profile } from '@/data/profile';
import { Paper, SectionHeading } from '@/ui';
import { CompanyBlock } from './CompanyBlock';
import { EducationBlock } from './EducationBlock';
import { CatLaptop, WavyDivider } from './doodles';
import styles from './Experience.module.css';

/** Experience & education: one big taped paper sheet with a timeline, promotion ladder and metrics. */
export default function Experience() {
  const reduce = useReducedMotion();

  return (
    <section id="experience" className={styles.section} aria-labelledby="experience-title">
      <div className="container">
        <motion.div
          className={styles.sheetWrap}
          initial={reduce ? false : { opacity: 0, y: 40, rotate: -1.5 }}
          whileInView={{ opacity: 1, y: 0, rotate: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
        >
          <CatLaptop className={styles.cat} />
          <Paper tape="corners" tilt={-0.35} className={styles.sheet}>
            <SectionHeading id="experience-title" onPaper title="Experience" accent="& education" />

            <div className={styles.timeline}>
              {profile.experience.map((c) => (
                <CompanyBlock key={c.company} company={c} />
              ))}
            </div>

            <WavyDivider className={styles.divider} />

            <EducationBlock education={profile.education} achievements={profile.achievements} />
          </Paper>
        </motion.div>
      </div>
    </section>
  );
}
