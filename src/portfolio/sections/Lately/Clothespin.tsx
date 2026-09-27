import { useId } from 'react';
import styles from './Card.module.css';

interface Props {
  /** Jaws open (before the card is pinned, or while it is being yanked). */
  open?: boolean;
  /** Slightly open while strained (dragging). */
  strained?: boolean;
  className?: string;
}

/**
 * A wooden clothespin, drawn upright: levers on top, metal spring in the middle,
 * a notch for the rope at y≈40 and the jaws gripping the card at the bottom.
 * The two halves pivot around the spring so the pin can visibly "snap" shut.
 */
export function Clothespin({ open, strained, className }: Props) {
  const uid = useId().replace(/:/g, '');
  const wood = `wood-${uid}`;
  const metal = `metal-${uid}`;
  const half =
    'M3.6 4.2 Q3.4 1.2 6.6 1.1 L11.4 1.5 Q12.8 1.6 12.8 3.2 L12.8 35.6 Q10 40 12.8 44.4 L12.8 68.8 Q12.7 71 10.9 70.9 L8.6 70.4 Q6.2 69.9 5.9 67.2 L3.6 12 Z';
  const state = open ? styles.pinOpen : strained ? styles.pinStrained : '';
  return (
    <svg className={[styles.pinSvg, state, className].filter(Boolean).join(' ')} viewBox="0 0 26 72" aria-hidden="true">
      <defs>
        <linearGradient id={wood} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className={styles.woodLight} />
          <stop offset="0.55" className={styles.woodMid} />
          <stop offset="1" className={styles.woodDark} />
        </linearGradient>
        <linearGradient id={metal} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" className={styles.metalLight} />
          <stop offset="1" className={styles.metalDark} />
        </linearGradient>
      </defs>
      <g className={styles.halfL}>
        <path d={half} fill={`url(#${wood})`} className={styles.woodEdge} />
        <path d="M6.4 7 Q7.4 22 6.9 34 M9.6 48 Q9.9 58 8.6 66" className={styles.grain} />
      </g>
      <g className={styles.halfR}>
        <g transform="translate(26 0) scale(-1 1)">
          <path d={half} fill={`url(#${wood})`} className={styles.woodEdge} />
          <path d="M6.2 9 Q7.2 20 6.8 32 M9.4 50 Q9.8 60 8.8 65" className={styles.grain} />
        </g>
      </g>
      {/* the split between the two halves */}
      <path d="M13 2.4 L13 21 M13 31 L13 36 M13 44.6 L13 69.6" className={styles.split} />
      {/* metal spring coil + lever wire */}
      <g className={styles.spring}>
        <path d="M5.2 23.5 L4.6 9.5" className={styles.wire} />
        <rect x="2.4" y="21.6" width="21.2" height="8.4" rx="4.2" fill={`url(#${metal})`} className={styles.metalEdge} />
        <path d="M7.2 22 Q6.4 25.8 7.2 29.6 M11 22 Q10.2 25.8 11 29.6 M14.8 22 Q14 25.8 14.8 29.6 M18.6 22 Q17.8 25.8 18.6 29.6" className={styles.coil} />
        <path d="M4.4 23.6 L21.4 23.6" className={styles.shine} />
      </g>
    </svg>
  );
}
