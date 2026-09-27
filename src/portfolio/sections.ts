// Single source of truth for the portfolio's sections (used by Nav, CommandPalette, App).
export interface SectionMeta {
  id: string; // DOM id of the <section>
  label: string; // nav label
  inNav: boolean;
}

export const SECTIONS: SectionMeta[] = [
  { id: 'about', label: 'About', inNav: true },
  { id: 'lately', label: 'Lately', inNav: true },
  { id: 'experience', label: 'Experience', inNav: true },
  { id: 'skills', label: 'Skills', inNav: false },
  { id: 'projects', label: 'Projects', inNav: true },
  { id: 'resume', label: 'Resume', inNav: true },
  { id: 'contact', label: 'Contact', inNav: false },
];

export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
  // move keyboard / screen-reader focus to the section heading without a second jump
  const target = el.querySelector<HTMLElement>('h1, h2') ?? el;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}
