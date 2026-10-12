import data from './data/phrases.json';

export interface Phrase {
  id: string;
  hanzi: string;
  py: string; // space-separated syllables
  en: string;
  words: string[]; // chunks that join back into hanzi, for sentence building
}

// Original, hand-written phrases in learning order. Audio lives in public/audio/p/<id>.m4a.
export const PHRASES: Phrase[] = data;
export const PHRASE_BY_ID = new Map(PHRASES.map((p) => [p.id, p]));

export const phraseOfTheDay = (d = new Date()) =>
  PHRASES[Math.floor(d.getTime() / 86_400_000) % PHRASES.length];
