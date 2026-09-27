import { profile } from '@/data/profile';
import { SectionHeading } from '@/ui';
import { Clothesline } from './Clothesline';
import styles from './Lately.module.css';

/** "What I've been up to lately" — polaroids pinned on a swaying clothesline. */
export default function Lately() {
  const items = profile.lately;
  if (!items.length) return null;
  return (
    <section id="lately" className={styles.section} aria-labelledby="lately-heading">
      <div className={`container ${styles.head}`}>
        <SectionHeading id="lately-heading" title="What I've been" accent="up to lately" />
      </div>
      <Clothesline items={items} />
    </section>
  );
}
