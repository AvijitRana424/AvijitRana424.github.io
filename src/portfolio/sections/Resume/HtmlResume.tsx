import { forwardRef, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { profile } from '@/data/profile';
import styles from './HtmlResume.module.css';

/** Design size of the HTML page: US Letter at 96 dpi. */
export const PAGE_W = 816;
export const PAGE_H = 1056;

const displayUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

function Contact({ interactive }: { interactive: boolean }) {
  const s = profile.socials;
  const items: { key: string; text: string; href?: string }[] = [
    { key: 'loc', text: profile.location },
    s.email ? { key: 'email', text: s.email, href: `mailto:${s.email}` } : null,
    profile.showPhone && s.phone ? { key: 'phone', text: s.phone, href: `tel:${s.phone.replace(/\s+/g, '')}` } : null,
    s.linkedin ? { key: 'in', text: displayUrl(s.linkedin), href: s.linkedin } : null,
    s.github ? { key: 'gh', text: displayUrl(s.github), href: s.github } : null,
  ].filter(Boolean) as { key: string; text: string; href?: string }[];
  return (
    <p className={styles.contact}>
      {items.map((it, i) => (
        <span key={it.key}>
          {i > 0 && <span className={styles.sep} aria-hidden="true">|</span>}
          {interactive && it.href ? (
            <a href={it.href} target={it.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
              {it.text}
            </a>
          ) : (
            it.text
          )}
        </span>
      ))}
    </p>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ left, right, sub, subRight }: { left: ReactNode; right?: ReactNode; sub?: ReactNode; subRight?: ReactNode }) {
  return (
    <>
      <div className={styles.row}>
        <span className={styles.rowLeft}>{left}</span>
        {right && <span className={styles.rowRight}>{right}</span>}
      </div>
      {(sub || subRight) && (
        <div className={`${styles.row} ${styles.subRow}`}>
          <span>{sub}</span>
          {subRight && <span>{subRight}</span>}
        </div>
      )}
    </>
  );
}

interface HtmlResumeProps {
  /** Real links (mail, LinkedIn, GitHub) instead of plain text. */
  interactive?: boolean;
  /**
   * 'page' (default): fixed 816px Letter page, auto-shrunk to fit one page; wrap it in <FitPage> to scale it.
   * 'flow': a reflowing single column at reading size (phones), sized by the --rs-text CSS variable.
   */
  layout?: 'page' | 'flow';
}

/** The resume, typeset like a one-page LaTeX resume, rendered from src/data/profile.ts. */
export const HtmlResume = forwardRef<HTMLDivElement, HtmlResumeProps>(function HtmlResume({ interactive = false, layout = 'page' }, ref) {
  const projects = profile.projects.filter((p) => p.kind !== 'work');
  const localRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      localRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );
  useFitToOnePage(localRef, layout === 'page');
  return (
    <div
      ref={setRefs}
      className={[styles.page, layout === 'flow' && styles.flow].filter(Boolean).join(' ')}
      data-resume-page={layout === 'page' ? '' : undefined}
    >
      <header className={styles.head}>
        <p className={styles.name}>{profile.name}</p>
        <p className={styles.role}>{profile.role}</p>
        <Contact interactive={interactive} />
      </header>

      <Section title="Summary">
        <p className={styles.summary}>{profile.summary}</p>
      </Section>

      <Section title="Experience">
        {profile.experience.map((x) => (
          <div key={x.company} className={styles.entry}>
            <Row
              left={
                <>
                  <strong>{x.company}</strong>
                  {x.companyNote && <span className={styles.note}> ({x.companyNote})</span>}
                </>
              }
              right={x.location}
            />
            {x.roles.map((r) => (
              <div key={r.title} className={styles.role2}>
                <div className={`${styles.row} ${styles.subRow}`}>
                  <span>{r.title}</span>
                  <span>
                    {r.start} – {r.end}
                  </span>
                </div>
                <ul className={styles.bullets}>
                  {r.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </Section>

      <Section title="Projects">
        {projects.map((p) => (
          <div key={p.id} className={styles.entry}>
            <div className={styles.row}>
              <span className={styles.rowLeft}>
                <strong>{p.title}</strong>
                <span className={styles.sep} aria-hidden="true">|</span>
                <em className={styles.tech}>{p.tech.join(', ')}</em>
              </span>
            </div>
            <ul className={styles.bullets}>
              {p.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section title="Technical Skills">
        <ul className={styles.skills}>
          {profile.skills.map((g) => (
            <li key={g.label}>
              <strong>{g.label}:</strong> {g.items.join(', ')}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Education">
        {profile.education.map((e) => (
          <div key={e.school} className={styles.entry}>
            <Row
              left={<strong>{e.school}</strong>}
              right={e.location}
              sub={
                <>
                  {e.degree}
                  {e.detail && <span className={styles.note}> · {e.detail}</span>}
                </>
              }
              subRight={`${e.start} – ${e.end}`}
            />
          </div>
        ))}
      </Section>

      {profile.achievements.length > 0 && (
        <Section title="Achievements">
          <ul className={styles.bullets}>
            {profile.achievements.map((a) => (
              <li key={a.title}>
                <strong>{a.title}</strong>, {a.org} ({a.year})
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
});

/** Shrinks the base font size (all sizes are em-based) until the content fits one Letter page. */
function useFitToOnePage(ref: { current: HTMLDivElement | null }, enabled: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled) {
      el.style.fontSize = '';
      return;
    }
    const fit = () => {
      let size = 12;
      el.style.fontSize = `${size}px`;
      // scrollHeight >= PAGE_H because of min-height; anything above it is overflow
      while (el.scrollHeight > PAGE_H + 1 && size > 9) {
        size -= 0.2;
        el.style.fontSize = `${size.toFixed(2)}px`;
      }
    };
    fit();
    let alive = true;
    document.fonts?.ready.then(() => alive && fit()).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ref, enabled]);
}

/**
 * Scales a fixed-width page (default 816px) to `width` CSS px (or the parent's width),
 * reserving the scaled height so layout flows naturally.
 */
export function FitPage({ width, children, className }: { width: number; children: ReactNode; className?: string }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState(PAGE_H);
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setNatural(Math.max(PAGE_H, el.offsetHeight));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = width > 0 ? width / PAGE_W : 1;
  return (
    <div className={[styles.fit, className].filter(Boolean).join(' ')} style={{ width: width || '100%', height: natural * scale }}>
      <div ref={innerRef} className={styles.fitInner} style={{ width: PAGE_W, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
