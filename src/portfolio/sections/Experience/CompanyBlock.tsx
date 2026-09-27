import { useEffect, useId, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import type { Experience, Role } from '@/data/profile';
import { CountUp } from '@/ui';
import { Highlighted, isPresent, monthIndex } from './Highlight';
import { PromoArrow } from './doodles';
import styles from './Experience.module.css';

const METRIC_TILTS = [-2.2, 1.6, -1.1, 2.1, -1.6, 1.2];

/** One employer on the timeline: header, metric index cards, then the promotion ladder of roles. */
/** True for mouse/trackpad users; drag is only enabled there so touch scrolling is never hijacked. */
function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const on = () => setFine(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return fine;
}

export function CompanyBlock({ company }: { company: Experience }) {
  const reduce = useReducedMotion();
  const headingId = useId();
  const canDrag = useFinePointer() && !reduce;

  return (
    <article className={styles.company} aria-labelledby={headingId}>
      {/* the dashed red timeline rail */}
      <motion.span
        aria-hidden="true"
        className={styles.rail}
        initial={reduce ? false : { clipPath: 'inset(0% 0% 100% 0%)' }}
        whileInView={{ clipPath: 'inset(0% 0% 0% 0%)' }}
        viewport={{ once: true, margin: '0px 0px -15% 0px' }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      />

      <div className={styles.monogram} style={{ '--mono': company.color } as CSSProperties} aria-hidden="true">
        {company.logo ? <img src={company.logo} alt="" /> : company.monogram}
      </div>

      <div className={styles.companyBody}>
        <header className={styles.companyHead}>
          <div className={styles.companyName}>
            <h3 id={headingId} className={styles.companyTitle}>
              {company.url ? (
                <a href={company.url} target="_blank" rel="noreferrer" className={`squiggle ${styles.companyLink}`}>
                  {company.company}
                  <ArrowUpRight className={styles.extIcon} aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <span className="squiggle">{company.company}</span>
              )}
            </h3>
            {company.companyNote && <p className={styles.companyNote}>{company.companyNote}</p>}
          </div>
          <p className={styles.location}>{company.location}</p>
        </header>

        {company.metrics && company.metrics.length > 0 && (
          <div className={styles.metricsWrap}>
            <p className={styles.metricsLabel} aria-hidden="true">
              impact, in numbers
            </p>
            <ul
              className={styles.metrics}
              aria-label={`${company.company} impact metrics`}
              style={{ '--cols': Math.min(company.metrics.length, 5) } as CSSProperties}
            >
              {company.metrics.map((m, i) => {
                const tilt = METRIC_TILTS[i % METRIC_TILTS.length];
                return (
                  <motion.li
                    key={m.label}
                    className={styles.metric}
                    initial={reduce ? false : { opacity: 0, y: 18, rotate: tilt * 2 }}
                    whileInView={{ opacity: 1, y: 0, rotate: tilt }}
                    whileHover={reduce ? undefined : { y: -7, rotate: 0, scale: 1.05 }}
                    drag={canDrag}
                    dragSnapToOrigin
                    dragElastic={0.55}
                    dragTransition={{ bounceStiffness: 380, bounceDamping: 16 }}
                    whileDrag={{ scale: 1.1, rotate: tilt * -1.5, zIndex: 5, cursor: 'grabbing' }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18, delay: reduce ? 0 : i * 0.07 }}
                    style={{ rotate: reduce ? tilt : undefined }}
                  >
                    <CountUp
                      className={styles.metricValue}
                      value={m.value}
                      prefix={m.prefix}
                      suffix={m.suffix}
                      decimals={m.decimals ?? 0}
                    />
                    <span className={styles.metricLabel}>{m.label}</span>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        )}

        <ol className={styles.ladder}>
          {company.roles.map((role, i) => {
            const newer = company.roles[i - 1];
            let months: number | null = null;
            if (newer) {
              const a = monthIndex(role.start);
              const b = monthIndex(newer.start);
              if (a != null && b != null && b > a) months = b - a;
            }
            return (
              <li key={`${role.title}-${role.start}`} className={styles.roleItem}>
                {newer && <Promotion months={months} />}
                <RoleCard role={role} current={isPresent(role.end)} />
              </li>
            );
          })}
        </ol>
      </div>
    </article>
  );
}

function Promotion({ months }: { months: number | null }) {
  return (
    <div className={styles.promo}>
      <PromoArrow className={styles.promoArrow} />
      <p className={styles.promoText}>
        promoted!
        {months != null && <span className={styles.promoAfter}> after {months} months</span>}
      </p>
    </div>
  );
}

function RoleCard({ role, current }: { role: Role; current: boolean }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const moreId = useId();
  const [first, ...rest] = role.bullets;

  return (
    <motion.div
      className={styles.role}
      initial={reduce ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className={styles.dot} data-current={current || undefined} aria-hidden="true" />
      <div className={styles.roleHead}>
        <h4 className={styles.roleTitle}>{role.title}</h4>
        <p className={styles.dates}>
          <span>{role.start}</span>
          <span aria-hidden="true"> – </span>
          <span className="sr-only"> to </span>
          {current ? (
            <span className={styles.present}>
              <span className={styles.live} aria-hidden="true" />
              {role.end}
            </span>
          ) : (
            <span>{role.end}</span>
          )}
        </p>
      </div>

      {first && (
        <ul className={styles.bullets}>
          <li>
            <Highlighted text={first} />
          </li>
        </ul>
      )}

      {rest.length > 0 && (
        <>
          <div id={moreId} className={styles.moreWrap}>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="more"
                  className={styles.moreInner}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { height: { type: 'spring', stiffness: 170, damping: 24 }, opacity: { duration: 0.25 } }}
                >
                  <ul className={`${styles.bullets} ${styles.bulletsMore}`}>
                    {rest.map((b, i) => (
                      <motion.li
                        key={i}
                        initial={reduce ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: reduce ? 0 : 0.06 + i * 0.06, duration: 0.35 }}
                      >
                        <Highlighted text={b} />
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={moreId}
            onClick={() => setOpen((v) => !v)}
          >
            <span>{open ? 'Show less' : `Show ${rest.length} more`}</span>
            <ChevronDown className={styles.toggleIcon} data-open={open || undefined} aria-hidden="true" />
            <span className="sr-only"> for {role.title}</span>
          </button>
        </>
      )}
    </motion.div>
  );
}
