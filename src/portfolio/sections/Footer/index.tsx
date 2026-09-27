import { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LockKeyhole } from 'lucide-react';
import { profile } from '@/data/profile';
import { trackerUrl } from '@/config';
import { usePortfolioUI } from '@/portfolio/uiState';
import { Button, SocialLinks } from '@/ui';
import { Mountains } from './Mountains';
import styles from './Footer.module.css';

const YEAR = new Date().getFullYear();
const EASE = [0.22, 1, 0.36, 1] as const;

export default function Footer() {
  const reduce = useReducedMotion();
  const { setConnectOpen } = usePortfolioUI();
  const sectionRef = useRef<HTMLElement>(null);

  const reveal = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { clipPath: 'inset(-20% 100% -30% 0)' },
          whileInView: { clipPath: 'inset(-20% 0% -30% 0)' },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.9, delay, ease: EASE },
        };

  return (
    <section id="contact" ref={sectionRef} className={styles.section} aria-labelledby="contact-title">
      <div className="container">
        <div className={styles.cta}>
          <h2 id="contact-title" className={styles.headline}>
            <motion.span className={styles.lineA} {...reveal(0)}>
              keep climbing
            </motion.span>{' '}
            <motion.span className={styles.lineB} {...reveal(0.55)}>
              <span className={styles.dash} aria-hidden="true">
                —{' '}
              </span>
              <span className={styles.talk}>
                let&rsquo;s talk
                <svg className={styles.talkLine} viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
                  <motion.path
                    d="M4 9 C 40 4, 80 12, 120 7 S 180 4, 196 8"
                    initial={reduce ? false : { pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 1.3, ease: EASE }}
                  />
                </svg>
              </span>
            </motion.span>
          </h2>

          <motion.div
            className={styles.ctaRow}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 22 }}
          >
            <p className={styles.sub}>Have a role, a project or a gnarly backend problem in mind? Say hello.</p>
            <div className={styles.buttonWrap}>
              <svg className={styles.arrow} viewBox="0 0 80 50" aria-hidden="true">
                <motion.path
                  d="M4 8 C 20 4, 40 10, 48 24 C 53 33, 56 38, 64 42"
                  initial={reduce ? false : { pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 1.5 }}
                />
                <motion.path
                  d="M54 43 L65 43 L62 32"
                  initial={reduce ? false : { pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.25, delay: 2.05 }}
                />
              </svg>
              <Button variant="marker" size="lg" className={styles.connect} onClick={() => setConnectOpen(true)}>
                connect
              </Button>
            </div>
          </motion.div>
        </div>

        <div className={styles.scene}>
          <Mountains sectionRef={sectionRef} />
        </div>

        <div className={styles.bottom}>
          <SocialLinks className={styles.socials} />
          <p className={styles.legal}>
            <span>
              © {YEAR} {profile.name}
            </span>
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
            <span className={styles.built}>built with React, Three.js &amp; Supabase</span>
          </p>
          <a className={styles.owner} href={trackerUrl} aria-label="Owner login" title="Owner login">
            <LockKeyhole aria-hidden="true" strokeWidth={2.2} />
          </a>
        </div>
      </div>
    </section>
  );
}
