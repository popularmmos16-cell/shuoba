import { PHRASES, type Phrase } from './phrases';
import { canTypeEnglish } from './typing';

// Compulsory word practice: type answers, with a simple "prove it on three different days" memory rule.
//  - the first answer of the day decides: right -> streak +1, wrong -> streak 0 and back tomorrow
//  - streak 1 returns in 1 day, streak 2 in 2 days, streak 3 = mastered (moves on to new words)
export const MASTER_AT = 3;

export interface WordRow {
  id: string; // phrase id of a word item
  streak: number;
  misses: number;
  due: string; // YYYY-MM-DD, local
  mastered: boolean;
  introduced: string;
}

export type QType = 'hanzi-pinyin' | 'en-pinyin' | 'hanzi-en' | 'audio-pinyin';
export type VItem = { kind: 'learn'; word: Phrase } | { kind: 'test'; word: Phrase; q: QType; retry: boolean };

export const WORDS: Phrase[] = PHRASES.filter((p) => p.kind === 'word').sort(
  (a, b) => (a.freq ?? 1e6) - (b.freq ?? 1e6) || PHRASES.indexOf(a) - PHRASES.indexOf(b),
);

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export const newWordRow = (id: string, today: string): WordRow => ({ id, streak: 0, misses: 0, due: today, mastered: false, introduced: today });

export function applyFirstAnswer(row: WordRow, correct: boolean, today: string): WordRow {
  if (!correct) return { ...row, streak: 0, misses: row.misses + 1, due: addDays(today, 1) };
  const streak = row.streak + 1;
  if (streak >= MASTER_AT) return { ...row, streak, mastered: true };
  return { ...row, streak, due: addDays(today, streak) };
}

export const maxActive = (perDay: number) => perDay * 3;

export interface Plan { due: Phrase[]; fresh: Phrase[] }

export function planToday(rows: WordRow[], today: string, perDay: number): Plan {
  const byId = new Map(WORDS.map((w) => [w.id, w]));
  const due = rows.filter((r) => !r.mastered && r.due <= today && r.introduced !== today).map((r) => byId.get(r.id)!).filter(Boolean);
  const startedToday = rows.filter((r) => r.introduced === today).length;
  const active = rows.filter((r) => !r.mastered).length;
  const room = Math.max(0, Math.min(perDay - startedToday, maxActive(perDay) - active));
  const have = new Set(rows.map((r) => r.id));
  const fresh = WORDS.filter((w) => !have.has(w.id)).slice(0, room);
  return { due, fresh };
}

export const remaining = (plan: Plan) => plan.due.length + plan.fresh.length;

const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

export function pickType(word: Phrase, quiet: boolean, avoid?: QType): QType {
  const ok: QType[] = ['hanzi-pinyin', 'en-pinyin'];
  if (canTypeEnglish(word.en)) ok.push('hanzi-en');
  if (!quiet) ok.push('audio-pinyin');
  const pool = ok.filter((t) => t !== avoid);
  return pool[Math.floor(Math.random() * pool.length)] ?? ok[0];
}

// New words are shown first (so nothing is a surprise), then everything is tested in shuffled order,
// never the same word twice in a row.
export function buildQueue(plan: Plan, quiet: boolean): VItem[] {
  const tests = shuffle([...plan.fresh, ...plan.due]);
  for (let i = 1; i < tests.length; i++) if (tests[i] === tests[i - 1]) [tests[i], tests[tests.length - 1]] = [tests[tests.length - 1], tests[i]];
  return [
    ...plan.fresh.map((word): VItem => ({ kind: 'learn', word })),
    ...tests.map((word): VItem => ({ kind: 'test', word, q: pickType(word, quiet), retry: false })),
  ];
}
