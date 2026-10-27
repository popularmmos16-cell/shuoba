import type { WordRow } from './vocab';
import { WORDS } from './vocab';

// The lock-screen hanzi card is built by the service worker, which cannot see IndexedDB state of the page or
// localStorage. So the page leaves it a small file in the Cache API: the words learnt so far, in the order they
// were started, and the day the compulsory words were last finished (to decide whether the noon nudge is needed).
export const LOCK_CACHE = 'shuoba-lockscreen';
const FILE = 'lockscreen.json';

export interface LockData {
  words: { hanzi: string; py: string; en: string }[];
  doneDate: string | null;
}

// Words learnt so far in the order they were started, as the lock-screen card and the widget show them.
export function learntWords(rows: WordRow[]): LockData['words'] {
  const byId = new Map(WORDS.map((w) => [w.id, w]));
  return rows
    .slice()
    .sort((a, b) => (a.introduced < b.introduced ? -1 : a.introduced > b.introduced ? 1 : 0))
    .map((r) => byId.get(r.id))
    .filter((w) => !!w)
    .map((w) => ({ hanzi: w!.hanzi, py: w!.py, en: w!.en.split(';')[0].trim() }));
}

export async function syncLockscreen(rows: WordRow[], doneDate: string | null) {
  if (!('caches' in window)) return;
  const data: LockData = { words: learntWords(rows), doneDate };
  try {
    const cache = await caches.open(LOCK_CACHE);
    await cache.put(new URL(FILE, document.baseURI).href, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    /* best effort: the lock screen just keeps its last word */
  }
}
