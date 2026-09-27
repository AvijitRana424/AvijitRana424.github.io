import { useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import styles from './TagInput.module.css';

interface Props {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'bad';
  /** lowercase tags (keywords) */
  lowercase?: boolean;
}

/** Chips + free text. Enter or comma adds, Backspace on an empty field removes the last chip, paste splits on commas. */
export function TagInput({ label, value, onChange, placeholder, hint, tone = 'neutral', lowercase }: Props) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  const add = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .map((s) => (lowercase ? s.toLowerCase() : s))
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      const dup = next.find((v) => v.toLowerCase() === p.toLowerCase());
      if (dup) {
        setFlash(dup);
        window.setTimeout(() => setFlash(null), 600);
      } else next.push(p);
    }
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };

  const remove = (tag: string) => {
    onChange(value.filter((v) => v !== tag));
    inputRef.current?.focus();
  };

  return (
    <div className={[styles.wrap, styles[tone]].join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
        <span className={styles.count}>{value.length}</span>
      </label>
      <div className={styles.box} onClick={() => inputRef.current?.focus()}>
        <ul className={styles.chips} aria-label={`${label} tags`}>
          <AnimatePresence initial={false}>
            {value.map((tag) => (
              <motion.li
                key={tag}
                layout={!reduce}
                className={[styles.chip, flash === tag && styles.flash].filter(Boolean).join(' ')}
                initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: -6 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: 8, transition: { duration: 0.14 } }}
                transition={{ type: 'spring', stiffness: 520, damping: 26 }}
              >
                <span>{tag}</span>
                <button
                  type="button"
                  className={styles.x}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(tag);
                  }}
                  aria-label={`Remove ${tag}`}
                >
                  <X size={12} strokeWidth={2.6} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <input
          ref={inputRef}
          id={id}
          className={styles.input}
          value={draft}
          placeholder={value.length ? 'Add more…' : placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          enterKeyHint="enter"
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(',')) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) {
              e.preventDefault();
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/[,\n]/.test(text)) {
              e.preventDefault();
              add(draft + text);
            }
          }}
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
