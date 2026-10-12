import { openDB, type IDBPDatabase } from 'idb';
import { useEffect, useState } from 'preact/hooks';
import type { Card } from 'ts-fsrs';
import { getState, replaceState, type State } from './store';
import type { WordRow } from './vocab';

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
  words?: WordRow[]; // absent in backups made before word typing existed
}

let dbp: Promise<IDBPDatabase> | null = null;
const db = () =>
  (dbp ??= openDB('shuoba', 2, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('cards')) d.createObjectStore('cards', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('log')) d.createObjectStore('log', { autoIncrement: true });
      if (!d.objectStoreNames.contains('words')) d.createObjectStore('words', { keyPath: 'id' });
    },
  }));

let cards: CardRow[] = [];
let words: WordRow[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadCards() {
  try {
    const d = await db();
    cards = await d.getAll('cards');
    words = await d.getAll('words');
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
    l(); // the data may have loaded between this render and this subscription: re-read it
    return () => void listeners.delete(l);
  }, []);
  return { cards, loaded };
}

export function useWords() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    l(); // the data may have loaded between this render and this subscription: re-read it
    return () => void listeners.delete(l);
  }, []);
  return { words, loaded };
}

export async function saveWord(row: WordRow) {
  words = [...words.filter((w) => w.id !== row.id), row];
  emit();
  try {
    await (await db()).put('words', row);
  } catch {
    /* keep the in-memory copy */
  }
  askPersist();
}

let persistAsked = false;
function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {}); // ask iOS not to evict our data under storage pressure
}

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
  askPersist();
}

export async function exportData(): Promise<Backup> {
  const d = await db();
  return { app: 'shuoba', version: 1, exportedAt: new Date().toISOString(), state: getState(), cards: await d.getAll('cards'), log: await d.getAll('log'), words: await d.getAll('words') };
}

const revive = (c: CardRow): CardRow => ({ ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined });

export async function importData(b: Backup) {
  if (b?.app !== 'shuoba' || b.version !== 1 || !Array.isArray(b.cards) || !Array.isArray(b.log) || !b.state) {
    throw new Error('This file is not a Shuōba backup.');
  }
  const rows = b.cards.map(revive);
  const d = await db();
  const wordRows = b.words ?? [];
  const tx = d.transaction(['cards', 'log', 'words'], 'readwrite');
  await tx.objectStore('cards').clear();
  await tx.objectStore('log').clear();
  await tx.objectStore('words').clear();
  rows.forEach((r) => tx.objectStore('cards').put(r));
  b.log.forEach((l) => tx.objectStore('log').add(l));
  wordRows.forEach((w) => tx.objectStore('words').put(w));
  await tx.done;
  cards = rows;
  words = wordRows;
  replaceState(b.state);
  emit();
}
