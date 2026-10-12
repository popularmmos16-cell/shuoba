import { PHRASES } from './phrases';

export interface Round {
  say: string; // text sent to speech
  prompt: string;
  options: { main: string; sub?: string }[];
  answer: number;
  reveal: { hanzi: string; py: string; en?: string };
}

const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

// Same syllable, four tones (tone 1 to 4 in order)
const TONE_SETS = [
  { chars: ['妈', '麻', '马', '骂'], py: ['mā', 'má', 'mǎ', 'mà'], en: ['mum', 'hemp', 'horse', 'scold'] },
  { chars: ['八', '拔', '把', '爸'], py: ['bā', 'bá', 'bǎ', 'bà'], en: ['eight', 'pull out', 'handle', 'dad'] },
  { chars: ['书', '熟', '属', '树'], py: ['shū', 'shú', 'shǔ', 'shù'], en: ['book', 'ripe', 'belong to', 'tree'] },
  { chars: ['汤', '糖', '躺', '烫'], py: ['tāng', 'táng', 'tǎng', 'tàng'], en: ['soup', 'sugar', 'lie down', 'scalding'] },
];

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

export function listenRounds(): Round[] {
  return shuffle(PHRASES).map((p) => {
    const others = shuffle(PHRASES.filter((x) => x !== p)).slice(0, 2);
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
