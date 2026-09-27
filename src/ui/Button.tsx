import { forwardRef, type ButtonHTMLAttributes, type AnchorHTMLAttributes, type ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'marker' | 'chalk' | 'paper' | 'ghost' | 'ink';
type Size = 'sm' | 'md' | 'lg';

interface Common {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

export type ButtonProps = Common & ButtonHTMLAttributes<HTMLButtonElement>;
export type LinkButtonProps = Common & AnchorHTMLAttributes<HTMLAnchorElement>;

const cls = (variant: Variant, size: Size, extra?: string, loading?: boolean) =>
  [styles.btn, styles[variant], styles[size], loading && styles.loading, extra].filter(Boolean).join(' ');

/**
 * Variants:
 *  marker — red scribbled marker blob (primary CTA, like "connect")
 *  chalk  — dashed chalk outline on the board
 *  paper  — cream paper button (on the board)
 *  ink    — dark ink button (on paper)
 *  ghost  — text-only
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'paper', size = 'md', icon, iconRight, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={cls(variant, size, className, loading)} disabled={disabled || loading} {...rest}>
      {icon && <span className={styles.icon}>{icon}</span>}
      {children && <span>{children}</span>}
      {iconRight && <span className={styles.icon}>{iconRight}</span>}
    </button>
  );
});

export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { variant = 'paper', size = 'md', icon, iconRight, loading, className, children, ...rest },
  ref,
) {
  return (
    <a ref={ref} className={cls(variant, size, className, loading)} {...rest}>
      {icon && <span className={styles.icon}>{icon}</span>}
      {children && <span>{children}</span>}
      {iconRight && <span className={styles.icon}>{iconRight}</span>}
    </a>
  );
});

/** Square icon-only button used on cards (repo / live links). */
export function IconButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={[styles.iconBtn, className].filter(Boolean).join(' ')} {...rest} />;
}

export function IconLink({ className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={[styles.iconBtn, className].filter(Boolean).join(' ')} {...rest} />;
}
