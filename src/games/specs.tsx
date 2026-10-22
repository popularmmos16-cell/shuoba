import { Pinyin } from '../components/Pinyin';
import { shuffle, TONE_OPTIONS } from '../practice';
import { PHRASES, type Phrase } from '../phrases';
import { choicesFor, WORDS } from '../vocab';
import TONES from '../data/tones.json';
import type { Ctx, Q, Spec, Tally } from './Quizzer';
import { deal, shortGloss } from './pool';

const HAN = /[一-鿿]/;
const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const revealOf = (p: Phrase) => (
  <>
    <b>{p.hanzi}</b> <Pinyin text={p.py} /> <span>{p.en}</span>
  </>
);

// ---- question makers ----

// hear it, pick the characters (the pinyin stands in when sound is off)
function hearQ(ctx: Ctx): Q {
  const w = ctx.word();
  return {
    eyebrow: ctx.quiet ? 'Read the pinyin' : 'Listen',
    say: ctx.quiet ? undefined : w.hanzi,
    replay: !ctx.quiet,
    stem: ctx.quiet ? <Pinyin text={w.py} /> : undefined,
    stemClass: 'md',
    hint: 'Which characters are these?',
    options: choicesFor(w, ctx.known, 2).map((o) => ({ label: <b class="hz">{o.hanzi}</b>, ok: o.id === w.id })),
    reveal: revealOf(w),
  };
}

// three words from one theme and one from another: spot the odd one out
const THEMES: Record<number, string> = {
  1: 'People', 2: 'Numbers and money', 3: 'Food and drink', 4: 'Getting around',
  5: 'Time and daily life', 6: 'Family', 7: 'Shopping', 8: 'Feelings and health',
};
const THEMED = WORDS.filter((w) => w.unit in THEMES);
const knownFirst = (ws: Phrase[], known: Set<string>) => shuffle(ws).sort((a, b) => +known.has(b.id) - +known.has(a.id));
function oddQ(ctx: Ctx): Q {
  const unit = pickOne(Object.keys(THEMES).map(Number).filter((u) => THEMED.filter((w) => w.unit === u).length >= 3));
  const trio = knownFirst(THEMED.filter((w) => w.unit === unit), ctx.known).slice(0, 3);
  const odd = knownFirst(THEMED.filter((w) => w.unit !== unit && shortGloss(w).length > 2), ctx.known)[0];
  return {
    eyebrow: 'Which one doesn’t belong?',
    options: shuffle([odd, ...trio]).map((o) => ({ label: <><b class="hz">{o.hanzi}</b><Pinyin text={o.py} /></>, ok: o === odd })),
    cols: 2,
    reveal: <><b>{THEMES[unit]}</b> <span>{trio.map(shortGloss).join(', ')}. {odd.hanzi} is “{shortGloss(odd)}”.</span></>,
    sayAfter: odd.hanzi,
  };
}

// words that share one character: name it. The character is the clue to what the words have in common.
const HANZI = (s: string) => [...s].filter((c) => HAN.test(c));
const BY_CHAR = new Map<string, Phrase[]>();
for (const w of WORDS) for (const c of new Set(HANZI(w.hanzi))) BY_CHAR.set(c, [...(BY_CHAR.get(c) ?? []), w]);
const ALL_CHARS = [...BY_CHAR.keys()];
function threadQ(ctx: Ctx): Q {
  const groups = [...BY_CHAR].filter(([, ws]) => ws.length >= 2);
  const mine = groups.filter(([, ws]) => ws.filter((w) => ctx.known.has(w.id)).length >= 2);
  for (;;) {
    const [, ws] = pickOne(mine.length >= 5 ? mine : groups);
    const set = shuffle(ws).slice(0, 3);
    const shared = HANZI(set[0].hanzi).filter((c) => set.every((w) => w.hanzi.includes(c)));
    if (shared.length !== 1) continue;
    const right = shared[0];
    // the other characters of those same words are the best wrong answers
    const near = shuffle([...new Set(set.flatMap((w) => HANZI(w.hanzi)))].filter((c) => c !== right));
    const wrong = [...near, ...shuffle(ALL_CHARS.filter((c) => c !== right && !near.includes(c)))].slice(0, 3);
    return {
      eyebrow: 'Which character do they share?',
      stem: set.map((w) => w.hanzi).join(' · '),
      stemClass: 'md',
      hint: set.map(shortGloss).join(' · '),
      options: shuffle([right, ...wrong]).map((c) => ({ label: <b class="hz">{c}</b>, ok: c === right })),
      cols: 2,
      reveal: <><b>{right}</b> <span>{set.map((w) => `${w.hanzi} ${w.py}`).join(' · ')}</span></>,
      sayAfter: set[0].hanzi,
    };
  }
}

const TONE_POOL = TONES.flatMap((s) => [0, 1, 2, 3].map((t) => ({ s, t })));
const nextTone = deal(TONE_POOL);
function toneQ(ctx: Ctx): Q {
  const { s, t } = nextTone();
  return {
    eyebrow: 'Which tone?',
    stem: s.chars[t],
    stemClass: 'xl',
    say: ctx.quiet ? undefined : s.chars[t],
    options: TONE_OPTIONS.map((o, i) => ({ label: <><b>{o.main}</b><small>{o.sub}</small></>, ok: i === t })),
    cols: 2,
    reveal: <><b>{s.chars[t]}</b> <Pinyin text={s.py[t]} /> <span>{s.en[t]}</span></>,
  };
}

const SENTENCES = PHRASES.filter((p) => p.kind === 'phrase' && p.words.length >= 3 && p.words.some((w) => HAN.test(w)));
const CHUNKS = [...new Set(SENTENCES.flatMap((p) => p.words.filter((w) => HAN.test(w) && !/[，。？！]/.test(w))))];
let nextSentence: (() => Phrase) | null = null;
let sentenceSource: Phrase[] = [];
function gapQ(ctx: Ctx): Q {
  // sentences you have met first, any sentence when there are too few of them
  const mine = ctx.sentences.filter((p) => SENTENCES.includes(p));
  const source = mine.length >= 6 ? mine : SENTENCES;
  if (!nextSentence || sentenceSource !== source) {
    sentenceSource = source;
    nextSentence = deal(source);
  }
  const p = nextSentence();
  const idx = pickOne(p.words.map((w, i) => (HAN.test(w) ? i : -1)).filter((i) => i >= 0));
  const right = p.words[idx];
  const len = [...right].length;
  const wrong = shuffle(CHUNKS.filter((c) => c !== right && !p.words.includes(c) && Math.abs([...c].length - len) <= 1)).slice(0, 3);
  return {
    eyebrow: 'Which piece is missing?',
    stem: p.words.map((w, i) => (i === idx ? '＿＿' : w)).join(''),
    stemClass: 'md',
    hint: p.en,
    options: shuffle([right, ...wrong]).map((c) => ({ label: <b class="hz">{c}</b>, ok: c === right })),
    cols: 2,
    reveal: revealOf(p),
    sayAfter: p.hanzi,
  };
}

// ---- how many stars ----
const byLives = (goal: number) => (t: Tally) => (t.pos >= goal && t.lives > 0 ? t.lives : 0);

const survive = (goal: number, noun: string): Pick<Spec, 'lives' | 'goal' | 'stars' | 'score' | 'status' | 'line'> => ({
  lives: 3,
  goal,
  stars: byLives(goal),
  score: (t) => t.right * 2 + t.lives * 5,
  status: (t) => `${t.pos} / ${goal}`,
  line: (t, won) => (won ? `${goal} ${noun} with ${t.lives} ${t.lives === 1 ? 'life' : 'lives'} to spare.` : `You got ${t.pos} of ${goal} ${noun}.`),
});

export const SPECS: Record<string, Spec> = {
  listen: {
    id: 'listen', title: 'Sound Match', coach: '',
    make: (_n, ctx) => hearQ(ctx),
    base: 4,
    ...survive(12, 'words heard'),
  },
  tones: {
    id: 'tones', title: 'Tone Sprint', coach: '',
    make: (_n, ctx) => toneQ(ctx),
    base: 4, settle: [500, 1500],
    ...survive(12, 'tones named'),
  },
  gap: {
    id: 'gap', title: 'Missing Piece', coach: '',
    make: (_n, ctx) => gapQ(ctx),
    base: 5,
    ...survive(10, 'gaps filled'),
  },
  odd: {
    id: 'odd', title: 'Odd One Out', coach: '',
    make: (_n, ctx) => oddQ(ctx),
    base: 4, settle: [800, 2000],
    ...survive(10, 'odd ones found'),
  },
  thread: {
    id: 'thread', title: 'Common Thread', coach: '',
    make: (_n, ctx) => threadQ(ctx),
    base: 5, settle: [900, 2200],
    ...survive(10, 'threads found'),
  },
};
