// Tiny IndexedDB wrapper for the demo-mode resume store.
// The database ('portfolio-demo') may be shared with other demo stores, so we never assume a
// fixed version: open whatever exists, and bump the version only when our object store is missing.

import type { ResumeVersion } from '@/lib/types';

const DB_NAME = 'portfolio-demo';
const STORE = 'resumes';

export interface StoredResume extends ResumeVersion {
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** IndexedDB is missing or blocked (private windows, "block site data" settings). */
export class StorageUnavailableError extends Error {
  constructor(message = 'IndexedDB is not available in this browser.') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function ensureStore(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
}

function attach(db: IDBDatabase): IDBDatabase {
  // Let other code (or other tabs) upgrade the shared database.
  db.onversionchange = () => {
    db.close();
    dbPromise = null;
  };
  return db;
}

function openAt(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new StorageUnavailableError());
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
    } catch (e) {
      // Some browsers throw synchronously (SecurityError) when site data is blocked.
      reject(new StorageUnavailableError((e as Error)?.message || undefined));
      return;
    }
    req.onupgradeneeded = () => ensureStore(req.result);
    req.onsuccess = () => resolve(req.result);
    // Opening fails (InvalidStateError / UnknownError / SecurityError) when storage is blocked.
    req.onerror = () => reject(new StorageUnavailableError(req.error?.message || undefined));
    req.onblocked = () => reject(new Error('The demo database is busy in another tab. Close it and retry.'));
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openAt();
      if (db.objectStoreNames.contains(STORE)) return attach(db);
      const next = db.version + 1;
      db.close();
      return attach(await openAt(next));
    })().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

export async function idbAll(): Promise<StoredResume[]> {
  const db = await openDb();
  return reqToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<StoredResume[]>);
}

export async function idbGet(id: string): Promise<StoredResume | undefined> {
  const db = await openDb();
  return reqToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(id) as IDBRequest<StoredResume | undefined>);
}

/** Runs `fn` over all rows inside one readwrite transaction; resolves when it commits. */
export async function idbMutate(fn: (store: IDBObjectStore, rows: StoredResume[]) => void): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
  done.catch(() => undefined); // callers await `done`; this only silences the early-exit paths below
  const rows = await reqToPromise(store.getAll() as IDBRequest<StoredResume[]>);
  try {
    fn(store, rows);
  } catch (e) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    throw e;
  }
  return done;
}
