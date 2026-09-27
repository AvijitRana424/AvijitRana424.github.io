import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowUpRight, Check, Copy, Download, Phone, Send } from 'lucide-react';
import { profile } from '@/data/profile';
import { scrollToSection } from '@/portfolio/sections';
import { usePortfolioUI } from '@/portfolio/uiState';
import { GitHubIcon, LinkedInIcon, MailIcon, Modal, XIcon } from '@/ui';
import { copyText, mailtoHref } from './copy';
import styles from './ConnectModal.module.css';

const TITLE = "Let's build something";
const city = profile.location.split(',')[0].trim();
const prettyUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

interface Row {
  key: string;
  icon: ReactNode;
  label: string;
  value: string;
  href: string;
  external: boolean;
  /** When set, the row gets a copy button and a separate primary action. */
  copy?: string;
  actionLabel: string;
}

function buildRows(): Row[] {
  const s = profile.socials;
  const rows: (Row | false)[] = [
    !!s.email && {
      key: 'email',
      icon: <MailIcon />,
      label: 'Email',
      value: s.email,
      href: mailtoHref(s.email),
      external: false,
      copy: s.email,
      actionLabel: `Write an email to ${profile.firstName}`,
    },
    !!s.linkedin && {
      key: 'linkedin',
      icon: <LinkedInIcon />,
      label: 'LinkedIn',
      value: prettyUrl(s.linkedin),
      href: s.linkedin,
      external: true,
      actionLabel: `Open ${profile.firstName}'s LinkedIn profile (new tab)`,
    },
    !!s.github && {
      key: 'github',
      icon: <GitHubIcon />,
      label: 'GitHub',
      value: prettyUrl(s.github),
      href: s.github,
      external: true,
      actionLabel: `Open ${profile.firstName}'s GitHub profile (new tab)`,
    },
    !!s.x && {
      key: 'x',
      icon: <XIcon />,
      label: 'X',
      value: prettyUrl(s.x),
      href: s.x,
      external: true,
      actionLabel: `Open ${profile.firstName}'s X profile (new tab)`,
    },
    profile.showPhone &&
      !!s.phone && {
        key: 'phone',
        icon: <Phone />,
        label: 'Phone',
        value: s.phone,
        href: `tel:${s.phone.replace(/\s/g, '')}`,
        external: false,
        copy: s.phone,
        actionLabel: `Call ${profile.firstName}`,
      },
  ];
  return rows.filter(Boolean) as Row[];
}
const ROWS = buildRows();

export default function ConnectModal() {
  const { connectOpen, setConnectOpen } = usePortfolioUI();
  const close = useCallback(() => setConnectOpen(false), [setConnectOpen]);

  return (
    <Modal open={connectOpen} onClose={close} label={TITLE} title={<Title />} width={540} className={styles.panel}>
      <ConnectBody onClose={close} />
    </Modal>
  );
}

function Title() {
  const reduce = useReducedMotion();
  return (
    <span className={styles.title}>
      <span className={styles.titleLead}>Let&rsquo;s build</span>{' '}
      <span className={styles.titleHand}>
        something
        <svg className={styles.titleSquiggle} viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
          <motion.path
            d="M3 8 C 22 3, 40 10, 60 6 S 98 3, 117 7"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      </span>
      <PaperPlane />
    </span>
  );
}

/** False while the browser tab is in the background. */
function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/** Paper-plane doodle with a looping dashed trail (the bob pauses while the tab is hidden). */
function PaperPlane() {
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  return (
    <motion.svg
      className={styles.plane}
      viewBox="0 0 90 44"
      aria-hidden="true"
      initial={reduce ? false : { opacity: 0, x: -14, y: 8, rotate: -8 }}
      animate={reduce ? undefined : { opacity: 1, x: 0, y: visible ? [0, -3, 0] : 0, rotate: 0 }}
      transition={{
        opacity: { duration: 0.3, delay: 0.35 },
        x: { type: 'spring', stiffness: 160, damping: 16, delay: 0.35 },
        rotate: { type: 'spring', stiffness: 160, damping: 16, delay: 0.35 },
        y: visible ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1 } : { duration: 0.3 },
      }}
    >
      <path className={styles.planeTrail} d="M2 38 C 14 40, 22 30, 16 25 C 10 20, 4 30, 16 32 C 28 34, 38 26, 50 22" />
      <path className={styles.planeBody} d="M52 21 L86 6 L66 34 L61 25 Z M61 25 L86 6 M61 25 L60 32 L66 34" />
    </motion.svg>
  );
}

const listV: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } } };
const rowV: Variants = {
  hidden: { opacity: 0, y: 12, rotate: -1 },
  show: { opacity: 1, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 360, damping: 28 } },
};

function ConnectBody({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion();
  const [announce, setAnnounce] = useState('');

  const downloadResume = () => {
    onClose();
    // wait for the modal to release the scroll lock / restore focus, then glide to the resume
    window.setTimeout(() => scrollToSection('resume'), 80);
  };

  return (
    <div className={styles.body}>
      <p className={styles.lede}>{profile.pitch}</p>

      {profile.openToWork && (
        <motion.p
          className={styles.open}
          initial={reduce ? false : { opacity: 0, scale: 0.85, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: -2 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.3 }}
        >
          <span className={styles.openDot} aria-hidden="true" />
          open to new roles
        </motion.p>
      )}

      <motion.ul className={styles.rows} variants={listV} initial={reduce ? false : 'hidden'} animate="show">
        {ROWS.map((r) => (
          <motion.li key={r.key} variants={reduce ? undefined : rowV}>
            {r.copy ? (
              <div className={styles.row}>
                <span className={styles.badge}>{r.icon}</span>
                <span className={styles.rowText}>
                  <span className={styles.rowLabel}>
                    <span className={styles.labelIcon} aria-hidden="true">
                      {r.icon}
                    </span>
                    {r.label}
                  </span>
                  <span className={styles.rowValue}>{r.value}</span>
                </span>
                <span className={styles.rowActions}>
                  <CopyButton
                    text={r.copy}
                    label={`Copy ${r.label.toLowerCase()}`}
                    onCopied={() => setAnnounce(`${r.label} copied to clipboard`)}
                  />
                  <a className={`${styles.act} ${styles.actPrimary}`} href={r.href} aria-label={r.actionLabel}>
                    <Send aria-hidden="true" />
                    <span className={styles.actText}>{r.key === 'phone' ? 'call' : 'write'}</span>
                  </a>
                </span>
              </div>
            ) : (
              <a
                className={`${styles.row} ${styles.rowLink}`}
                href={r.href}
                target={r.external ? '_blank' : undefined}
                rel={r.external ? 'noreferrer' : undefined}
                aria-label={r.actionLabel}
              >
                <span className={styles.badge}>{r.icon}</span>
                <span className={styles.rowText}>
                  <span className={styles.rowLabel}>
                    <span className={styles.labelIcon} aria-hidden="true">
                      {r.icon}
                    </span>
                    {r.label}
                  </span>
                  <span className={styles.rowValue}>{r.value}</span>
                </span>
                <span className={styles.rowActions}>
                  <span className={styles.act} aria-hidden="true">
                    <span className={styles.actText}>open</span>
                    <ArrowUpRight />
                  </span>
                </span>
              </a>
            )}
          </motion.li>
        ))}
      </motion.ul>

      <div className={styles.foot}>
        <LocalClock />
        <button type="button" className={styles.resumeLink} onClick={downloadResume}>
          <Download aria-hidden="true" />
          <span>Download resume</span>
        </button>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}

function CopyButton({ text, label, onCopied }: { text: string; label: string; onCopied: () => void }) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    onCopied();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button type="button" className={[styles.act, copied && styles.actDone].filter(Boolean).join(' ')} onClick={onClick} aria-label={label}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span className={styles.actText}>{copied ? 'copied' : 'copy'}</span>
      <AnimatePresence>
        {copied && (
          <motion.span
            className={styles.burst}
            aria-hidden="true"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.6, rotate: -14 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, rotate: -6 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          >
            copied!
            <svg viewBox="0 0 40 24" className={styles.burstLines}>
              {['M6 20 L2 14', 'M16 16 L16 8', 'M26 20 L31 13', 'M10 12 L20 22 L36 4'].map((d, i) => (
                <motion.path
                  key={d}
                  d={d}
                  className={i === 3 ? styles.burstCheck : undefined}
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.35, delay: 0.05 + i * 0.05 }}
                />
              ))}
            </svg>
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

const TIME_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
const HM_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "It's 10:42 AM in Gurugram (IST)" with a tiny doodled analog clock. Updates every 30s. */
function LocalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const parts = HM_FMT.formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const hourDeg = (h % 12) * 30 + m * 0.5;
  const minDeg = m * 6;

  return (
    <p className={styles.clock}>
      <svg className={styles.clockFace} viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 3.2 C 23.4 2.8, 29 8.4, 28.8 16.2 C 28.6 23.6, 23 29, 15.6 28.8 C 8.4 28.6, 3 23, 3.2 15.8 C 3.4 8.6, 8.8 3.4, 16 3.2 Z" />
        <line x1="16" y1="16" x2="16" y2="10" style={{ transform: `rotate(${hourDeg}deg)` }} className={styles.hand} />
        <line x1="16" y1="16" x2="16" y2="7" style={{ transform: `rotate(${minDeg}deg)` }} className={`${styles.hand} ${styles.handMin}`} />
        <circle cx="16" cy="16" r="1.3" />
      </svg>
      <span>
        It&rsquo;s <time dateTime={now.toISOString()}>{TIME_FMT.format(now)}</time> in {city} (IST)
      </span>
    </p>
  );
}
