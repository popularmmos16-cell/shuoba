import { PHRASES, type Phrase } from './phrases';
import { canTypeEnglish, englishAnswers } from './typing';

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

// *-pick questions are multiple choice (recognition); the rest are typed (recall).
export type QType = 'hanzi-en-pick' | 'en-hanzi-pick' | 'audio-en-pick' | 'hanzi-en' | 'hanzi-pinyin' | 'en-pinyin' | 'audio-pinyin';
export type VItem =
  | { kind: 'learn'; word: Phrase }
  | { kind: 'test'; word: Phrase; q: QType; retry: boolean; choices?: Phrase[] };

export const isPick = (q: QType) => q.endsWith('-pick');

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

export const MAX_ACTIVE = 20; // words being learned at any one time (not yet mastered)
export const MAX_DUE = 24; // the most review words in one day, so a few missed days never turn into a mountain

export interface Plan { due: Phrase[]; fresh: Phrase[] }

export function planToday(rows: WordRow[], today: string, perDay: number): Plan {
  const byId = new Map(WORDS.map((w) => [w.id, w]));
  const due = rows
    .filter((r) => !r.mastered && r.due <= today && r.introduced !== today)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : b.misses - a.misses)) // longest overdue, then most-missed, first
    .slice(0, MAX_DUE)
    .map((r) => byId.get(r.id)!)
    .filter(Boolean);
  const startedToday = rows.filter((r) => r.introduced === today).length;
  const active = rows.filter((r) => !r.mastered).length;
  const room = Math.max(0, Math.min(perDay - startedToday, MAX_ACTIVE - active));
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

// How likely each question is, by how many days in a row the word has been answered right (0, 1, 2).
// Meaning comes first: reading Chinese is the skill that matters, so hanzi -> English dominates, and the
// harder typed questions only appear once the word has been seen to stick.
const WEIGHTS: Record<QType, [number, number, number]> = {
  'hanzi-en-pick': [6, 2, 1],
  'en-hanzi-pick': [4, 3, 2],
  'audio-en-pick': [0, 2, 2],
  'hanzi-en': [0, 6, 6],
  'hanzi-pinyin': [0, 1, 2],
  'en-pinyin': [0, 0, 1],
  'audio-pinyin': [0, 0, 1],
};

export function pickType(word: Phrase, streak: number, quiet: boolean, avoid?: QType, pickOnly = false): QType {
  const pool = (Object.keys(WEIGHTS) as QType[])
    .filter((t) => t !== avoid && !(quiet && t.startsWith('audio')) && !(t === 'hanzi-en' && !canTypeEnglish(word.en)) && !(pickOnly && !isPick(t)))
    .map((t) => ({ t, w: WEIGHTS[t][Math.min(streak, 2)] }))
    .filter((x) => x.w > 0);
  if (!pool.length) return 'hanzi-en-pick';
  let r = Math.random() * pool.reduce((n, x) => n + x.w, 0);
  for (const x of pool) if ((r -= x.w) < 0) return x.t;
  return pool[0].t;
}

// Four options for a multiple-choice question. Wrong answers are other words of a similar length that share no
// meaning, sound or character with the right one, and are mostly words already met (a word you have never seen is
// too easy to rule out).
export function choicesFor(word: Phrase, known: Set<string>, n = 3): Phrase[] {
  const len = (p: Phrase) => [...p.hanzi].length;
  const meanings = new Set(englishAnswers(word.en));
  const chars = new Set(word.hanzi);
  const pool = WORDS.filter(
    (w) =>
      w.id !== word.id &&
      w.py !== word.py &&
      ![...w.hanzi].some((c) => chars.has(c)) &&
      !englishAnswers(w.en).some((a) => meanings.has(a)),
  );
  const picks = pool
    .map((w) => ({ w, score: Math.abs(len(w) - len(word)) * 2 + Math.random() * 4 + (known.has(w.id) ? 0 : 3) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, n)
    .map((x) => x.w);
  return shuffle([word, ...picks]);
}

export function makeTest(word: Phrase, streak: number, known: Set<string>, quiet: boolean, avoid?: QType, retry = false): VItem {
  const q = pickType(word, streak, quiet, avoid, retry);
  return { kind: 'test', word, q, retry, choices: isPick(q) ? choicesFor(word, known) : undefined };
}

// New words are shown first (so nothing is a surprise), then everything is tested in shuffled order,
// never the same word twice in a row. The order and the question type are new every time.
export function buildQueue(plan: Plan, rows: WordRow[], quiet: boolean): VItem[] {
  const streaks = new Map(rows.map((r) => [r.id, r.streak]));
  const known = new Set(rows.map((r) => r.id));
  plan.fresh.forEach((w) => known.add(w.id));
  const tests = shuffle([...plan.fresh, ...plan.due]);
  for (let i = 1; i < tests.length; i++) if (tests[i] === tests[i - 1]) [tests[i], tests[tests.length - 1]] = [tests[tests.length - 1], tests[i]];
  return [
    ...plan.fresh.map((word): VItem => ({ kind: 'learn', word })),
    ...tests.map((word) => makeTest(word, streaks.get(word.id) ?? 0, known, quiet)),
  ];
}
