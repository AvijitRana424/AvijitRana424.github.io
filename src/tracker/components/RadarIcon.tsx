import { useId } from 'react';
import styles from './RadarIcon.module.css';

/** Chalk-drawn radar with a rotating sweep and blinking blips (static for reduced-motion users). */
export function RadarIcon({ size = 36, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={[styles.radar, className].filter(Boolean).join(' ')} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={`sw-${id}`} x1="20" y1="20" x2="34" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.05" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="var(--chalk)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 2.6c9.8-.2 17.5 7.6 17.4 17.5-.1 9.7-7.9 17.4-17.6 17.3C10.2 37.3 2.5 29.6 2.6 19.9 2.7 10.4 10.4 2.8 20 2.6Z" strokeWidth="1.8" />
        <path d="M20 9.2c6-.1 10.9 4.8 10.8 10.9-.1 5.9-4.9 10.7-10.9 10.7-6 0-10.8-4.9-10.7-10.9C9.3 14 14 9.3 20 9.2Z" strokeWidth="1.2" opacity="0.55" />
        <path d="M20 15.4c2.6 0 4.7 2.1 4.6 4.7 0 2.5-2.1 4.5-4.6 4.5-2.6 0-4.6-2.1-4.6-4.7.1-2.5 2.1-4.5 4.6-4.5Z" strokeWidth="1" opacity="0.4" />
        <path d="M3.2 20.3h33.5M20.2 3v34" strokeWidth="0.9" opacity="0.3" strokeDasharray="1.5 2.5" />
      </g>
      <g className={styles.sweep}>
        <path d="M20 20 L20 3.2 A16.8 16.8 0 0 1 34.6 11.6 Z" fill={`url(#sw-${id})`} />
        <path d="M20 20 L34.6 11.6" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <circle className={styles.blip} cx="27.5" cy="13.5" r="1.9" fill="var(--chalk-yellow)" />
      <circle className={[styles.blip, styles.b2].join(' ')} cx="12.5" cy="25.5" r="1.5" fill="var(--chalk-yellow)" />
      <circle className={[styles.blip, styles.b3].join(' ')} cx="25" cy="28" r="1.3" fill="var(--chalk-yellow)" />
      <circle cx="20" cy="20" r="1.6" fill="var(--chalk)" />
    </svg>
  );
}
