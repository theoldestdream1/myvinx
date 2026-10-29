// A tiny offline outbox. When a save fails because the network is down, the memory is kept on this device
// (IndexedDB, with an in-memory fallback for private windows) and sent automatically later.
// Nothing here talks to the server: callers pass in the function that sends one item.

export interface QueuedCapture {
  id: string;                 // doubles as the idempotency key (client_id) on the server side
  userId: string;
  content: string;
  source: string;
  image?: Blob | null;
  imageName?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  attempts: number;
}

const DB_NAME = 'vinx-outbox';
const STORE = 'items';
const MAX_ITEMS = 200;
const MAX_ATTEMPTS = 8;

const fallback = new Map<string, QueuedCapture>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

/** Test hook: forget the cached connection and the in-memory fallback. */
export function __resetQueueForTests() { dbPromise = null; fallback.clear(); }

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function listQueued(userId?: string): Promise<QueuedCapture[]> {
  const db = await openDb();
  let all: QueuedCapture[];
  if (db) { try { all = (await tx(db, 'readonly', (s) => s.getAll())) as QueuedCapture[]; } catch { all = [...fallback.values()]; } }
  else all = [...fallback.values()];
  return all.filter((i) => !userId || i.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function enqueue(item: Omit<QueuedCapture, 'createdAt' | 'attempts'>): Promise<boolean> {
  if ((await listQueued()).length >= MAX_ITEMS) return false;
  const full: QueuedCapture = { ...item, createdAt: Date.now(), attempts: 0 };
  const db = await openDb();
  if (db) {
    try { await tx(db, 'readwrite', (s) => s.put(full)); return true; } catch { /* fall through to memory */ }
  }
  fallback.set(full.id, full);
  return true;
}

export async function removeQueued(id: string): Promise<void> {
  fallback.delete(id);
  const db = await openDb();
  if (db) { try { await tx(db, 'readwrite', (s) => s.delete(id)); } catch { /* ignore */ } }
}

async function bump(item: QueuedCapture) {
  const next = { ...item, attempts: item.attempts + 1 };
  if (next.attempts >= MAX_ATTEMPTS) { await removeQueued(item.id); return; }
  const db = await openDb();
  if (db) { try { await tx(db, 'readwrite', (s) => s.put(next)); return; } catch { /* fall through */ } }
  fallback.set(next.id, next);
}

/** True for "the request never reached the server" (offline, DNS, dropped connection). */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String((e as { message?: string })?.message ?? e ?? '');
  return (e instanceof TypeError || (e as { name?: string })?.name === 'TypeError') && /fetch|network|load failed|connection/i.test(msg)
    || /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
}

let flushing: Promise<{ sent: number; remaining: number }> | null = null;

/**
 * Send queued items oldest first. A network error stops the run (we are still offline). Any other
 * error counts as an attempt and moves on, and an item that keeps failing is dropped after a few tries
 * so one bad item can never block the rest. Runs one at a time.
 */
export function flushQueue(userId: string, send: (item: QueuedCapture) => Promise<void>): Promise<{ sent: number; remaining: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const item of await listQueued(userId)) {
      try { await send(item); await removeQueued(item.id); sent++; }
      catch (e) {
        if (isNetworkError(e)) break;
        await bump(item);
      }
    }
    return { sent, remaining: (await listQueued(userId)).length };
  })().finally(() => { flushing = null; });
  return flushing;
}
