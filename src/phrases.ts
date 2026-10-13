import data from './data/phrases.json';

export interface Phrase {
  id: string;
  hanzi: string;
  py: string; // space-separated syllables
  en: string;
  words: string[]; // chunks that join back into hanzi, for sentence building
  kind: 'word' | 'phrase';
  unit: number; // 0 = the original survival phrases, then one unit per theme
  hsk?: number; // HSK 3.0 level, for words that are on the list
  freq?: number; // frequency rank among HSK words (lower = more common)
}

// Original, hand-written phrases in learning order. Audio lives in public/audio/p/<id>.m4a.
export const PHRASES = data as Phrase[];
export const PHRASE_BY_ID = new Map(PHRASES.map((p) => [p.id, p]));

const SENTENCES = PHRASES.filter((p) => p.kind === 'phrase');
export const phraseOfTheDay = (d = new Date()) =>
  SENTENCES[Math.floor(d.getTime() / 86_400_000) % SENTENCES.length];

const isHan = (c: string) => c >= '\u4e00' && c <= '\u9fff';
const WORD_GLOSS = new Map(PHRASES.filter((p) => p.kind === 'word').map((p) => [p.hanzi, p.en.split(';')[0].trim()]));

export interface Piece {
  text: string; // as written, punctuation included
  py: string;
  gloss?: string; // meaning, when the piece is a word taught in the app
}

// Split a phrase into its word chunks, each with its own pinyin and (if known) meaning.
export function pieces(p: Phrase): Piece[] {
  const syl = p.py.split(' ');
  let at = 0;
  return p.words.map((text) => {
    const han = [...text].filter(isHan);
    const py = syl.slice(at, at + han.length).join(' ');
    at += han.length;
    return { text, py, gloss: p.words.length > 1 ? WORD_GLOSS.get(han.join('')) : undefined };
  });
}
