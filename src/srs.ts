import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Grade } from 'ts-fsrs';
import { pickDistractors, scramble, shuffle } from './practice';
import type { CardRow, LogRow } from './db';
import { dateKey } from './store';
import { PHRASE_BY_ID, PHRASES, type Phrase } from './phrases';

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

export type Exercise = 'choose' | 'build';
export type Item =
  | { kind: 'intro'; phrase: Phrase }
  | { kind: 'card'; row: CardRow; ex: Exercise; choices?: Phrase[]; tiles?: string[] };

// Questions mark themselves: no self-rating. A miss is "Again", a very slow right answer is "Hard", else "Good".
export const SLOW_SECONDS = 20;
export const gradeFor = (correct: boolean, seconds: number): Grade =>
  !correct ? Rating.Again : seconds > SLOW_SECONDS ? Rating.Hard : Rating.Good;

// Recognition first (pick the meaning). Once a card has graduated out of the short learning steps into
// long-term review, switch to producing it (build the sentence). A card that was just missed goes back to the
// easy kind (a lapse also drops it out of Review, and a retry is always multiple choice).

export function makeCard(row: CardRow, retry = false): Item {
  const phrase = PHRASE_BY_ID.get(row.phraseId)!;
  if (!retry && row.state === State.Review && phrase.words.length >= 2) {
    return { kind: 'card', row, ex: 'build', tiles: scramble(phrase.words) };
  }
  return { kind: 'card', row, ex: 'choose', choices: shuffle([phrase, ...pickDistractors(PHRASES, phrase, 2)]) };
}

export function newRows(phrase: Phrase, now = new Date()): CardRow[] {
  return (['read', 'listen'] as const).map((kind) => ({
    ...createEmptyCard(now),
    id: `${phrase.id}:${kind}`,
    phraseId: phrase.id,
    kind,
    introduced: now.getTime(),
  }));
}

export function intervalLabel(due: Date, now = new Date()): string {
  const min = (due.getTime() - now.getTime()) / 60_000;
  if (min < 1) return '<1m';
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  const d = min / 1440;
  return d < 30 ? `${Math.round(d)}d` : `${Math.round(d / 30)}mo`;
}

// "Back in 3 days": what the schedule will be if answered this way, for showing after the answer.
export function nextLabel(row: CardRow, grade: Grade, now = new Date()): string {
  return intervalLabel(scheduler.next(row, now, grade).card.due, now);
}

export function rate(row: CardRow, grade: Grade, now = new Date()): { next: CardRow; log: LogRow } {
  const { card } = scheduler.next(row, now, grade);
  return { next: { ...row, ...card }, log: { cardId: row.id, rating: grade, ts: now.getTime() } };
}

// "Learned": the reading card has graduated out of the learning steps.
export function learnedPhraseIds(cards: CardRow[]): Set<string> {
  return new Set(cards.filter((c) => c.kind === 'read' && c.state === State.Review).map((c) => c.phraseId));
}

// "Strong": the memory is predicted to last 3+ weeks (FSRS stability, in days).
export const STRONG_DAYS = 21;
export const isStrong = (c: CardRow) => c.state === State.Review && c.stability >= STRONG_DAYS;

export function dueCards(cards: CardRow[], quiet: boolean, now = new Date()): CardRow[] {
  return cards
    .filter((c) => c.due <= now && !(quiet && c.kind === 'listen')) // listening cards wait until sound is back
    .sort((a, b) => a.due.getTime() - b.due.getTime());
}

export function unseenPhrases(cards: CardRow[]): Phrase[] {
  const seen = new Set(cards.map((c) => c.phraseId));
  return PHRASES.filter((p) => !seen.has(p.id));
}

const hanziOf = (s: string) => [...s].filter((c) => c >= '\u4e00' && c <= '\u9fff');

// Pick the next items to teach: stay in the earliest unfinished unit, mix words with sentences, and only
// bring in a sentence once its characters have been taught (or the unit has no words left to teach first).
export function nextNew(cards: CardRow[], count: number): Phrase[] {
  const unseen = unseenPhrases(cards);
  if (!unseen.length || count <= 0) return [];
  const pool = unseen.filter((p) => p.unit === unseen[0].unit);
  const seen = new Set(cards.map((c) => c.phraseId));
  const covered = new Set(PHRASES.filter((p) => seen.has(p.id)).flatMap((p) => hanziOf(p.hanzi)));
  const out: Phrase[] = [];
  const take = (p: Phrase) => {
    out.push(p);
    hanziOf(p.hanzi).forEach((c) => covered.add(c));
  };
  const wordsLeft = () => pool.some((p) => p.kind === 'word' && !out.includes(p));
  const ready = (p: Phrase) => hanziOf(p.hanzi).every((c) => covered.has(c)) || !wordsLeft();

  let quota = Math.ceil(count / 2);
  for (const p of pool) if (p.kind === 'word' && quota > 0 && out.length < count) { take(p); quota--; }
  for (const p of pool) if (p.kind === 'phrase' && out.length < count && ready(p)) take(p);
  for (const p of pool) if (!out.includes(p) && out.length < count && (p.kind === 'word' || ready(p))) take(p);
  return out;
}

export function newAllowanceToday(cards: CardRow[], perDay: number): number {
  const today = dateKey();
  const done = cards.filter((c) => c.kind === 'read' && dateKey(new Date(c.introduced)) === today).length;
  return Math.max(0, perDay - done);
}

export function buildQueue(cards: CardRow[], quiet: boolean, newCount: number): Item[] {
  const reviews: Item[] = dueCards(cards, quiet).slice(0, 40).map((row) => makeCard(row));
  const intros: Item[] = nextNew(cards, newCount).map((phrase) => ({ kind: 'intro', phrase }));
  return [...reviews, ...intros];
}
