import { openDB, type IDBPDatabase } from 'idb';
import { useEffect, useState } from 'preact/hooks';
import type { Card } from 'ts-fsrs';
import { getState, replaceState, type State } from './store';

export interface CardRow extends Card {
  id: string; // `${phraseId}:${kind}`
  phraseId: string;
  kind: 'read' | 'listen';
  introduced: number; // ms since epoch
}
export interface LogRow {
  cardId: string;
  rating: number;
  ts: number;
}
export interface Backup {
  app: 'shuoba';
  version: 1;
  exportedAt: string;
  state: State;
  cards: CardRow[];
  log: LogRow[];
}

let dbp: Promise<IDBPDatabase> | null = null;
const db = () =>
  (dbp ??= openDB('shuoba', 1, {
    upgrade(d) {
      d.createObjectStore('cards', { keyPath: 'id' });
      d.createObjectStore('log', { autoIncrement: true });
    },
  }));

let cards: CardRow[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadCards() {
  try {
    cards = await (await db()).getAll('cards');
  } catch {
    /* storage unavailable (e.g. private window): run in memory */
  }
  loaded = true;
  emit();
}
loadCards();

export function useCards() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return { cards, loaded };
}

let persistAsked = false;

export async function saveCards(rows: CardRow[], log: LogRow[] = []) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  rows.forEach((r) => byId.set(r.id, r));
  cards = [...byId.values()];
  emit();
  try {
    const tx = (await db()).transaction(['cards', 'log'], 'readwrite');
    rows.forEach((r) => tx.objectStore('cards').put(r));
    log.forEach((l) => tx.objectStore('log').add(l));
    await tx.done;
  } catch {
    /* keep the in-memory copy */
  }
  if (!persistAsked) {
    persistAsked = true;
    navigator.storage?.persist?.().catch(() => {}); // ask iOS not to evict our data under storage pressure
  }
}

export async function exportData(): Promise<Backup> {
  const d = await db();
  return { app: 'shuoba', version: 1, exportedAt: new Date().toISOString(), state: getState(), cards: await d.getAll('cards'), log: await d.getAll('log') };
}

const revive = (c: CardRow): CardRow => ({ ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined });

export async function importData(b: Backup) {
  if (b?.app !== 'shuoba' || b.version !== 1 || !Array.isArray(b.cards) || !Array.isArray(b.log) || !b.state) {
    throw new Error('This file is not a Shuōba backup.');
  }
  const rows = b.cards.map(revive);
  const d = await db();
  const tx = d.transaction(['cards', 'log'], 'readwrite');
  await tx.objectStore('cards').clear();
  await tx.objectStore('log').clear();
  rows.forEach((r) => tx.objectStore('cards').put(r));
  b.log.forEach((l) => tx.objectStore('log').add(l));
  await tx.done;
  cards = rows;
  replaceState(b.state);
  emit();
}
