/** What went wrong, so the UI can offer the right way out (sign in again, retry, run the schema…). */
export type TrackerErrorKind = 'auth' | 'permission' | 'network' | 'schema' | 'notfound' | 'other';

export class TrackerError extends Error {
  readonly kind: TrackerErrorKind;
  constructor(message: string, kind: TrackerErrorKind = 'other') {
    super(message);
    this.name = 'TrackerError';
    this.kind = kind;
  }
}

export const errorKind = (e: unknown): TrackerErrorKind => (e instanceof TrackerError ? e.kind : 'other');
