import type { Phrase } from './phrases';
import TONES from './data/tones.json';

const ROUND_LEN = 10;
export const MIN_POOL = 4; // enough to offer three answer choices
const distractors = (pool: Phrase[], p: Phrase) => shuffle(pool.filter((x) => x !== p)).slice(0, 2);

export interface Round {
  say?: string; // text sent to speech; rounds without it are silent
  stem?: { text: string; size: 'xl' | 'md' }; // what is shown instead of the play button
  prompt: string;
  options: { main: string; sub?: string; py?: boolean; big?: boolean }[];
  answer: number;
  reveal: { hanzi?: string; py: string; en?: string };
}

export const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

// Same syllable, four tones (tone 1 to 4 in order)
const TONE_SETS = TONES;

export const TONE_OPTIONS = [
  { main: '1st', sub: 'high, flat' },
  { main: '2nd', sub: 'rising' },
  { main: '3rd', sub: 'dip' },
  { main: '4th', sub: 'falling' },
];

export function toneRounds(n = 10): Round[] {
  const pool = TONE_SETS.flatMap((s) => [0, 1, 2, 3].map((t) => ({ s, t })));
  return shuffle(pool)
    .slice(0, n)
    .map(({ s, t }) => ({
      say: s.chars[t],
      prompt: 'Which tone did you hear?',
      options: TONE_OPTIONS,
      answer: t,
      reveal: { hanzi: s.chars[t], py: s.py[t], en: s.en[t] },
    }));
}

export function listenRounds(pool: Phrase[]): Round[] {
  return shuffle(pool).slice(0, ROUND_LEN).map((p) => {
    const others = distractors(pool, p);
    const options = shuffle([p, ...others]);
    return {
      say: p.hanzi,
      prompt: 'What does it mean?',
      options: options.map((o) => ({ main: o.en })),
      answer: options.indexOf(p),
      reveal: { hanzi: p.hanzi, py: p.py },
    };
  });
}


// Silent: see the characters, pick the meaning
export function readRounds(pool: Phrase[]): Round[] {
  return shuffle(pool).slice(0, ROUND_LEN).map((p) => {
    const options = shuffle([p, ...distractors(pool, p)]);
    return {
      stem: { text: p.hanzi, size: 'md' as const },
      prompt: 'What does it mean?',
      options: options.map((o) => ({ main: o.en })),
      answer: options.indexOf(p),
      reveal: { py: p.py },
    };
  });
}

// Silent: see the meaning, pick the Chinese
export function recallRounds(pool: Phrase[]): Round[] {
  return shuffle(pool).slice(0, ROUND_LEN).map((p) => {
    const options = shuffle([p, ...distractors(pool, p)]);
    return {
      stem: { text: p.en, size: 'md' as const },
      prompt: 'Which one says this?',
      options: options.map((o) => ({ main: o.hanzi, big: true })),
      answer: options.indexOf(p),
      reveal: { py: p.py },
    };
  });
}

// Silent: see a character, pick its pinyin (the tone marks are the point)
export function pinyinRounds(n = 10): Round[] {
  const pool = TONE_SETS.flatMap((s) => [0, 1, 2, 3].map((t) => ({ s, t })));
  return shuffle(pool)
    .slice(0, n)
    .map(({ s, t }) => ({
      stem: { text: s.chars[t], size: 'xl' as const },
      prompt: 'Which pinyin is it?',
      options: s.py.map((py) => ({ main: py, py: true })),
      answer: t,
      reveal: { py: s.py[t], en: s.en[t] },
    }));
}

// Silent: put the pieces of a sentence in order
export interface BuildRound {
  phrase: Phrase;
  tiles: string[];
}
export function buildRounds(pool: Phrase[]): BuildRound[] {
  return shuffle(pool.filter((p) => p.words.length >= 2)).slice(0, 8).map((phrase) => {
    let tiles = shuffle(phrase.words);
    for (let k = 0; k < 10 && tiles.join('') === phrase.hanzi; k++) tiles = shuffle(phrase.words);
    return { phrase, tiles };
  });
}
