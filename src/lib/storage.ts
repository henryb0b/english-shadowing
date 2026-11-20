import type { ProgressData, Story } from '../types';

const PROGRESS_KEY = 'ishl-progress-v1';
const LESSONS_KEY = 'ishl-lessons-v1';
const VOICE_KEY = 'ishl-voice-v1';
const DB_NAME = 'ishl-audio';
const STORE = 'audio';

export const emptyProgress = (): ProgressData => ({ attempts: [], stories: {} });

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadProgress(): ProgressData {
  const data = readJSON<ProgressData>(PROGRESS_KEY, emptyProgress());
  return { attempts: data.attempts ?? [], stories: data.stories ?? {} };
}

export function saveProgress(data: ProgressData): boolean {
  return writeJSON(PROGRESS_KEY, data);
}

export function clearProgress(): void {
  try {
    window.localStorage.removeItem(PROGRESS_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

export function loadTeacherLessons(): Story[] {
  return readJSON<Story[]>(LESSONS_KEY, []);
}

export function saveTeacherLessons(lessons: Story[]): boolean {
  return writeJSON(LESSONS_KEY, lessons);
}

export function loadVoiceName(): string | null {
  try {
    return window.localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export function saveVoiceName(name: string): void {
  try {
    window.localStorage.setItem(VOICE_KEY, name);
  } catch {
    /* ignore: the default voice is used instead */
  }
}

/* ---------- Audio blobs for teacher uploads (IndexedDB) ---------- */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no-idb'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAudio(id: string, blob: Blob): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function getAudio(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob;
  } catch {
    return null;
  }
}

export async function deleteAudio(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* nothing to delete */
  }
}
