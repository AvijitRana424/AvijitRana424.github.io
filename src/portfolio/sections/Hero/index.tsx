import { Fragment, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SocialLinks } from '@/ui';
import { profile } from '@/data/profile';
import { scrollToSection } from '@/portfolio/sections';
import { usePortfolioUI } from '@/portfolio/uiState';
import { Polaroid } from './Polaroid';
import { StickyHighlights } from './StickyHighlights';
import { GitHubActivity } from './GitHubActivity';
import { DownArrow } from './Doodles';
import { T, useLive } from './motion';
import styles from './Hero.module.css';

const spring = { type: 'spring', stiffness: 260, damping: 20 } as const;

/** Name written letter by letter; each letter wiggles on hover. */
function NameLetters({ text }: { text: string }) {
  const reduce = !!useReducedMotion();
  return (
    <span aria-hidden="true" className={styles.letters}>
      {Array.from(text).map((ch, i) => {
        const delay = T.name + i * T.letterStagger;
        return ch === ' ' ? (
          <span key={i} className={styles.space} />
        ) : (
          <motion.span
            key={i}
            className={styles.letter}
            initial={reduce ? false : { opacity: 0, y: 22, rotate: i % 2 ? 8 : -8, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, rotate: 0, filter: 'blur(0px)' }}
            transition={{ ...spring, delay, opacity: { duration: 0.18, delay }, filter: { duration: 0.24, delay } }}
          >
            <motion.span
              className={styles.letterInner}
              whileHover={reduce ? undefined : { y: -7, rotate: i % 2 ? 7 : -7, transition: { type: 'spring', stiffness: 500, damping: 11 } }}
            >
              {ch}
            </motion.span>
          </motion.span>
        );
      })}
    </span>
  );
}

/** One line under the name: the first tagline handwritten in red, the rest (role) in plain chalk. */
function Taglines() {
  const reduce = !!useReducedMotion();
  const [lead, ...rest] = profile.taglines;
  if (!lead) return null;
  return (
    <p className={styles.taglines}>
      <span className={styles.tagInner}>
        <span className={`${styles.tagline} ${styles.tagHand}`}>
          {lead.split(' ').map((w, j) => (
            <Fragment key={j}>
              {j > 0 && ' '}
              <motion.span
                className={styles.word}
                initial={reduce ? false : { opacity: 0, y: 8, rotate: -4 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{ ...spring, delay: T.tagline + j * 0.035 }}
              >
                {w}
              </motion.span>
            </Fragment>
          ))}
        </span>
        {rest.map((t, i) => (
          <motion.span
            key={i}
            className={`${styles.tagline} ${styles.tagPlain}`}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: T.tagline + 0.12 + i * 0.06 }}
          >
            {t}
          </motion.span>
        ))}
      </span>
    </p>
  );
}

function OpenToWork() {
  const reduce = !!useReducedMotion();
  const { setConnectOpen } = usePortfolioUI();
  return (
    <motion.button
      type="button"
      className={styles.badge}
      onClick={() => setConnectOpen(true)}
      initial={reduce ? false : { opacity: 0, scale: 0.8, rotate: -6 }}
      animate={{ opacity: 1, scale: 1, rotate: -2 }}
      whileHover={reduce ? undefined : { rotate: 0, scale: 1.04 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ ...spring, delay: T.badge }}
      title="I'm open to new roles, say hi"
    >
      <span className={styles.dot} aria-hidden="true" />
      open to new roles
      <span className="sr-only">: get in touch</span>
    </motion.button>
  );
}

/** A quiet bouncing chalk arrow at the bottom of the first screen (no "scroll" narration). */
function ScrollArrow() {
  const reduce = !!useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const live = useLive(ref, '0px');
  return (
    <motion.button
      ref={ref}
      type="button"
      className={styles.scrollHint}
      onClick={() => scrollToSection('lately')}
      aria-label="Skip down to what I've been up to lately"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: T.decor + 0.2, duration: 0.6 }}
    >
      <motion.span
        className={styles.scrollArrow}
        animate={reduce || !live ? { y: 0 } : { y: [0, 8, 0] }}
        transition={reduce || !live ? { duration: 0.3 } : { duration: 1.7, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
      >
        <DownArrow />
      </motion.span>
    </motion.button>
  );
}

export default function Hero() {
  const reduce = !!useReducedMotion();

  return (
    <section id="about" className={styles.hero} aria-labelledby="hero-name">
      <div className={`container ${styles.grid}`}>
        <div className={styles.left}>
          <Polaroid />
        </div>

        <div className={styles.right}>
          <header className={styles.head}>
            <div className={styles.titleRow}>
              <h1 id="hero-name" className={styles.name}>
                <span className="sr-only">{profile.name}</span>
                <NameLetters text={profile.name} />
              </h1>
              {profile.openToWork && <OpenToWork />}
            </div>
            <Taglines />
            <motion.div
              className={styles.socials}
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: T.socials }}
            >
              <SocialLinks />
            </motion.div>
          </header>

          <StickyHighlights />
          <GitHubActivity />
        </div>
      </div>

      <ScrollArrow />
    </section>
  );
}
