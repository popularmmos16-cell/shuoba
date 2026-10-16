import { WORDS } from '../vocab';
import { PHRASE_BY_ID, type Phrase } from '../phrases';
import { getCards, getWords } from '../db';

// What the games draw from: words you have started, topped up with the most common words when you have few,
// plus any sentences you have met.
export function gamePool(min = 12) {
  const started = new Set(getWords().map((w) => w.id));
  const words = WORDS.filter((w) => started.has(w.id));
  for (const w of WORDS) {
    if (words.length >= min) break;
    if (!started.has(w.id)) words.push(w);
  }
  return { words, known: new Set(words.map((w) => w.id)) };
}

export function sentencePool(): Phrase[] {
  return [...new Set(getCards().map((c) => c.phraseId))]
    .map((id) => PHRASE_BY_ID.get(id)!)
    .filter((p) => p && p.kind === 'phrase');
}

// "I; me" -> "I", "(general counting word)" -> the whole thing. A short label for a card.
export const shortGloss = (p: Phrase) => p.en.split(';')[0].replace(/\s*\([^)]*\)\s*/g, ' ').trim() || p.en;
