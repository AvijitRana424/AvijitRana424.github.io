import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Phone } from 'lucide-react';
import { profile } from '@/data/profile';
import { GitHubIcon, LinkedInIcon, MailIcon, XIcon } from './BrandIcons';
import styles from './SocialLinks.module.css';

interface Props {
  size?: 'sm' | 'md';
  className?: string;
}

/** Round "stamp" social buttons (red dotted ring). Links with empty URLs are hidden. */
export function SocialLinks({ size = 'md', className }: Props) {
  const s = profile.socials;
  const items = [
    s.linkedin && { key: 'linkedin', href: s.linkedin, label: 'LinkedIn', icon: <LinkedInIcon /> },
    s.github && { key: 'github', href: s.github, label: 'GitHub', icon: <GitHubIcon /> },
    s.email && { key: 'email', href: `mailto:${s.email}`, label: `Email ${s.email}`, icon: <MailIcon /> },
    s.x && { key: 'x', href: s.x, label: 'X (Twitter)', icon: <XIcon /> },
    profile.showPhone && s.phone && { key: 'phone', href: `tel:${s.phone.replace(/\s/g, '')}`, label: `Call ${s.phone}`, icon: <Phone size={18} /> },
  ].filter(Boolean) as { key: string; href: string; label: string; icon: ReactNode }[];

  return (
    <ul className={[styles.list, styles[size], className].filter(Boolean).join(' ')}>
      {items.map((it, i) => (
        <li key={it.key}>
          <motion.a
            className={styles.link}
            href={it.href}
            aria-label={it.label}
            title={it.label}
            target={it.href.startsWith('http') ? '_blank' : undefined}
            rel="noreferrer"
            whileHover={{ y: -3, rotate: i % 2 ? 6 : -6 }}
            whileTap={{ scale: 0.92 }}
          >
            {it.icon}
          </motion.a>
        </li>
      ))}
    </ul>
  );
}
