import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { GitHubIcon, Paper } from '@/ui';
import { profile } from '@/data/profile';
import { describeDay, useContributions, type Day } from './contributions';
import styles from './GitHubActivity.module.css';

const ROW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Position of `el` inside `root` in layout (untransformed) coordinates, accounting for scrolled ancestors. */
function posIn(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    const p = n.offsetParent as HTMLElement | null;
    if (p && p !== root) {
      x -= p.scrollLeft;
      y -= p.scrollTop;
    }
    n = p;
  }
  return { x, y };
}

function handleFromUrl(url: string) {
  const m = /github\.com\/([^/?#]+)/i.exec(url);
  return m ? m[1] : '';
}

interface Tip {
  x: number;
  y: number;
  shift: number;
  text: string;
}

/**
 * GitHub-style contribution heatmap on a taped paper card.
 * Only real data is ever shown to visitors: without `profile.githubUsername` the card is not rendered in
 * production (dev shows a clearly-bannered sample), and a failed fetch hides the card.
 */
export function GitHubActivity() {
  const username = profile.githubUsername.trim();
  if (!username && !import.meta.env.DEV) return null;
  return <ContributionCard username={username} />;
}

function ContributionCard({ username }: { username: string }) {
  const handle = username || handleFromUrl(profile.socials.github);
  const profileUrl = handle ? `https://github.com/${handle}` : '';
  const { status, calendar } = useContributions(username);
  const isSample = status === 'sample';
  const loading = status === 'loading';
  const reduce = !!useReducedMotion();

  const cardRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const inView = useInView(gridRef, { once: true, margin: '0px 0px -40px 0px' });
  const [settled, setSettled] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  const [active, setActive] = useState<{ w: number; d: number } | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [announce, setAnnounce] = useState('');

  const weeksN = calendar.weeks.length;
  const hovered = month ? calendar.months.find((m) => m.key === month) : undefined;

  // Latest weeks first when the grid is wider than the card (mobile).
  useLayoutEffect(() => {
    const s = scrollerRef.current;
    if (s) s.scrollLeft = s.scrollWidth;
  }, [calendar]);

  // Freeze the weekday labels only while the grid actually scrolls.
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const s = scrollerRef.current;
    if (!s || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const o = s.scrollWidth > s.clientWidth + 1;
      setOverflow(o);
      if (o) s.scrollLeft = s.scrollWidth;
    });
    ro.observe(s);
    return () => ro.disconnect();
  }, []);

  // After the pop-in wave, drop the animation so hover/dim states can take over.
  useEffect(() => {
    if (!inView || reduce || loading) return;
    const t = window.setTimeout(() => setSettled(true), (weeksN + 7) * 11 + 650);
    return () => window.clearTimeout(t);
  }, [inView, reduce, weeksN, loading]);

  const lastPos = () => {
    const w = weeksN - 1;
    const d = calendar.weeks[w].reduce((acc, day, i) => (day ? i : acc), 0);
    return { w, d };
  };

  const cellEl = (w: number, d: number) => gridRef.current?.querySelector<HTMLElement>(`[data-w="${w}"][data-d="${d}"]`) ?? null;

  const showTip = (cell: HTMLElement, day: Day) => {
    const card = cardRef.current;
    if (!card) return;
    const p = posIn(cell, card);
    const cxm = p.x + cell.offsetWidth / 2;
    const half = 105;
    const x = Math.min(Math.max(cxm, half + 6), card.clientWidth - half - 6);
    setTip({ x, y: p.y, shift: cxm - x, text: describeDay(day) });
  };

  const pick = (w: number, d: number, fromKeyboard: boolean) => {
    const day = calendar.weeks[w]?.[d];
    const el = cellEl(w, d);
    if (!day || !el) return;
    setActive({ w, d });
    if (fromKeyboard) {
      // keep the cell inside the horizontal scroller
      const s = scrollerRef.current;
      if (s) {
        const left = posIn(el, s).x + s.scrollLeft;
        if (left < s.scrollLeft + 8) s.scrollLeft = left - 24;
        else if (left + el.offsetWidth > s.scrollLeft + s.clientWidth - 8) s.scrollLeft = left - s.clientWidth + 40;
      }
      setAnnounce(describeDay(day));
    }
    showTip(el, day);
  };

  const onOver = (e: PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.dataset.w == null || t.dataset.d == null) return;
    pick(Number(t.dataset.w), Number(t.dataset.d), false);
  };

  const clear = () => {
    setActive(null);
    setTip(null);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = active ?? lastPos();
    let { w, d } = cur;
    switch (e.key) {
      case 'ArrowRight':
        w++;
        break;
      case 'ArrowLeft':
        w--;
        break;
      case 'ArrowDown':
        d++;
        break;
      case 'ArrowUp':
        d--;
        break;
      case 'Home':
        w = 0;
        break;
      case 'End':
        ({ w, d } = lastPos());
        break;
      case 'Escape':
        clear();
        return;
      default:
        return;
    }
    e.preventDefault();
    w = Math.max(0, Math.min(weeksN - 1, w));
    d = Math.max(0, Math.min(6, d));
    if (!calendar.weeks[w][d]) ({ w, d } = lastPos()); // future day → today
    pick(w, d, true);
  };

  const legend = [0, 1, 2, 3, 4];

  // Couldn't reach GitHub: show nothing rather than a broken or invented graph.
  if (status === 'error') return null;

  return (
    <motion.div
      ref={cardRef}
      className={styles.wrap}
      initial={reduce ? false : { opacity: 0, y: 36, rotate: 1.5 }}
      whileInView={{ opacity: 1, y: 0, rotate: -0.4 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ type: 'spring', stiffness: 150, damping: 20, delay: 0.1 }}
    >
      <Paper tape="corners" className={cx(styles.card, isSample && styles.sampleCard)} aria-busy={loading || undefined}>
        {isSample && (
          <p className={styles.devBanner}>
            <strong>sample data</strong> (dev only, hidden in production). Set <code>githubUsername</code> in src/data/profile.ts
          </p>
        )}
        <div className={styles.head}>
          <h2 className={styles.title}>
            <GitHubIcon size={15} className={styles.ghIcon} />
            GitHub activity
          </h2>
          <div className={styles.meta}>
            {handle &&
              (profileUrl ? (
                <a className={styles.handle} href={profileUrl} target="_blank" rel="noreferrer">
                  @{handle}
                </a>
              ) : (
                <span className={styles.handle}>@{handle}</span>
              ))}
          </div>
        </div>

        <div
          ref={scrollerRef}
          className={cx(styles.scroller, overflow && styles.scrolls)}
          onScroll={() => tip && setTip(null)}
        >
          <div className={styles.inner} style={{ ['--weeks' as string]: weeksN } as CSSProperties}>
            <div className={styles.monthsRow} aria-hidden="true">
              <span className={styles.corner} />
              <div className={styles.months}>
                {calendar.months.map((m) => (
                  <span
                    key={m.key}
                    className={cx(styles.month, month === m.key && styles.monthOn)}
                    style={{ gridColumn: `${m.week + 1} / span 3` }}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setMonth(m.key)}
                    onPointerLeave={(e) => e.pointerType === 'mouse' && setMonth(null)}
                    onClick={() => setMonth((cur) => (cur === m.key ? null : m.key))}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.body}>
              <div className={styles.days} aria-hidden="true">
                {ROW_LABELS.map((l, i) => (
                  <span key={i}>{l}</span>
                ))}
              </div>

              <div className={styles.gridWrap}>
                <div className={styles.bandGrid} aria-hidden="true">
                  {hovered && hovered.startWeek >= 0 && (
                    <span className={styles.band} style={{ gridColumn: `${hovered.startWeek + 1} / ${hovered.endWeek + 2}` }} />
                  )}
                </div>
                <div
                  ref={gridRef}
                  role="group"
                  tabIndex={loading ? -1 : 0}
                  aria-label={
                    loading
                      ? 'Contribution graph, loading'
                      : `Contribution graph${isSample ? ' (sample data)' : ''}: ${calendar.total.toLocaleString('en-US')} contributions in the last year. Use the arrow keys to read individual days.`
                  }
                  className={cx(
                    styles.grid,
                    loading ? styles.skeleton : (inView || reduce) && styles.show,
                    !loading && (settled || reduce) && styles.settled,
                    !!month && styles.focusMonth,
                  )}
                  onPointerOver={loading ? undefined : onOver}
                  onPointerLeave={clear}
                  onKeyDown={loading ? undefined : onKey}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget && !active) {
                      const p = lastPos();
                      pick(p.w, p.d, true);
                    }
                  }}
                  onBlur={clear}
                >
                  {calendar.weeks.map((week, w) =>
                    week.map((day, d) =>
                      day ? (
                        <span
                          key={day.date}
                          data-w={w}
                          data-d={d}
                          className={cx(
                            styles.cell,
                            styles[`l${day.level}`],
                            month && day.month !== month && styles.dim,
                            active?.w === w && active?.d === d && styles.active,
                          )}
                          style={{ ['--i' as string]: w + d } as CSSProperties}
                        />
                      ) : (
                        <span key={`f${w}-${d}`} className={styles.future} />
                      ),
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.foot}>
          <p className={styles.total}>
            {loading ? (
              'Loading contributions…'
            ) : (
              <>
                <strong>{calendar.total.toLocaleString('en-US')}</strong> contributions in the last year
                {isSample && ' (made up)'}
              </>
            )}
          </p>
          <div className={styles.legend} aria-hidden="true">
            <span>Less</span>
            {legend.map((l) => (
              <i key={l} className={cx(styles.swatch, styles[`l${l}`])} />
            ))}
            <span>More</span>
          </div>
        </div>

        <span className="sr-only" aria-live="polite">
          {announce}
        </span>
      </Paper>
      {tip && (
        <span
          className={styles.tip}
          style={{ left: tip.x, top: tip.y, ['--shift' as string]: `${tip.shift}px` } as CSSProperties}
          aria-hidden="true"
        >
          {tip.text}
        </span>
      )}
    </motion.div>
  );
}
