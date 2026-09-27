import { profile } from '@/data/profile';

/** Copy text to the clipboard with a textarea fallback for older / insecure contexts. Resolves true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** mailto: link with the default "Hello <first name>" subject. */
export const mailtoHref = (email: string, subject = `Hello ${profile.firstName}`) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}`;
