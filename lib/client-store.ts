import type { Snapshot } from './model';

const DB_NAME = 'pik-avito-dashboard';
const STORE = 'data';

export function isGithubPages() {
  return (
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('.github.io') ||
      import.meta.env.VITE_STATIC_DEPLOY === '1')
  );
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function browserSnapshot(): Promise<Snapshot | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get('snapshot');
    request.onsuccess = () => resolve((request.result as Snapshot) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveBrowserSnapshot(snapshot: Snapshot) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(snapshot, 'snapshot');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function browserConnection() {
  try {
    const saved = JSON.parse(localStorage.getItem('pik-connection') ?? '{}');
    return (
      saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
    ) as {
      url?: string;
      token?: string;
    };
  } catch {
    return {};
  }
}

export function saveBrowserConnection(url: string, token: string) {
  localStorage.setItem('pik-connection', JSON.stringify({ url, token }));
}
