import { Pinyin } from '../components/Pinyin';
import { shuffle, TONE_OPTIONS } from '../practice';
import { PHRASES, type Phrase } from '../phrases';
import { choicesFor } from '../vocab';
import TONES from '../data/tones.json';
import type { Ctx, Q, Spec, Tally } from './Quizzer';
import { deal, shortGloss } from './pool';

const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const revealOf = (p: Phrase) => (
  <>
    <b>{p.hanzi}</b> <Pinyin text={p.py} /> <span>{p.en}</span>
  </>
);

// ---- question makers ----

// see the characters, pick the meaning
function readQ(ctx: Ctx): Q {
  const w = ctx.word();
  return {
    eyebrow: 'What does it mean?',
    stem: w.hanzi,
    stemClass: [...w.hanzi].length > 4 ? 'sm' : 'lg',
    options: choicesFor(w, ctx.known, 2).map((o) => ({ label: <b>{o.en}</b>, ok: o.id === w.id })),
    reveal: revealOf(w),
    sayAfter: w.hanzi,
  };
}

// see the meaning, pick the characters
function recallQ(ctx: Ctx): Q {
  const w = ctx.word();
  const opts = choicesFor(w, ctx.known, 2);
  return {
    eyebrow: 'Which one says this?',
    stem: shortGloss(w),
    stemClass: 'md',
    options: opts.map((o) => ({ label: <b class="hz">{o.hanzi}</b>, ok: o.id === w.id })),
    reveal: revealOf(w),
    sayAfter: w.hanzi,
  };
}

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

function trueFalseQ(ctx: Ctx): Q {
  const w = ctx.word();
  const other = choicesFor(w, ctx.known, 1).find((o) => o.id !== w.id);
  const truth = !other || Math.random() < 0.5;
  const shown = truth ? w : other!;
  return {
    eyebrow: 'True or false?',
    stem: w.hanzi,
    stemClass: [...w.hanzi].length > 4 ? 'sm' : 'lg',
    hint: <>means <b>“{shown.en}”</b></>,
    options: [
      { label: <b>✓ True</b>, ok: truth },
      { label: <b>✗ False</b>, ok: !truth },
    ],
    cols: 2,
    reveal: revealOf(w),
    sayAfter: w.hanzi,
  };
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

const HAN = /[一-鿿]/;
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
const triple = (a: number, b: number, c: number) => (n: number) => (n >= c ? 3 : n >= b ? 2 : n >= a ? 1 : 0);

const survive = (goal: number, noun: string): Pick<Spec, 'lives' | 'goal' | 'stars' | 'score' | 'status' | 'line'> => ({
  lives: 3,
  goal,
  stars: byLives(goal),
  score: (t) => t.right * 2 + t.lives * 5,
  status: (t) => `${t.pos} / ${goal}`,
  line: (t, won) => (won ? `${goal} ${noun} with ${t.lives} ${t.lives === 1 ? 'life' : 'lives'} to spare.` : `You got ${t.pos} of ${goal} ${noun}.`),
});

const mixed = (...fns: ((c: Ctx) => Q)[]) => (_n: number, ctx: Ctx) => pickOne(fns)(ctx);

export const SPECS: Record<string, Spec> = {
  blitz: {
    id: 'blitz', title: 'Speed Blitz', coach: '',
    make: (_n, ctx) => readQ(ctx),
    clock: 40, clockBonus: 1, clockPenalty: 2, base: 3, settle: [250, 800],
    status: (t) => `${t.right} right`,
    stars: (t) => triple(8, 13, 18)(t.right),
    score: (t) => t.right,
    line: (t, won) => (won ? `${t.right} right before time ran out.` : `${t.right} right. Get to 8 for a star.`),
  },
  sudden: {
    id: 'sudden', title: 'Sudden Death', coach: '',
    make: mixed(readQ, recallQ, hearQ),
    lives: 1, base: 5,
    status: (t) => `Streak ${t.right}`,
    stars: (t) => triple(6, 12, 20)(t.right),
    score: (t) => t.right,
    line: (t, won) => (won ? `A streak of ${t.right}. Nicely done.` : `A streak of ${t.right}. Get to 6 for a star.`),
  },
  ladder: {
    id: 'ladder', title: 'Ladder Climb', coach: '',
    make: mixed(recallQ, readQ),
    goal: 8, slide: true, maxQ: 22, base: 4,
    status: (t) => `Rung ${t.pos} / 8`,
    stars: (t) => (t.pos >= 8 ? (t.asked <= 10 ? 3 : t.asked <= 14 ? 2 : 1) : 0),
    score: (t) => (t.pos >= 8 ? 40 - t.asked : t.pos),
    line: (t, won) => (won ? `At the top in ${t.asked} questions.` : `You reached rung ${t.pos} of 8.`),
  },
  duel: {
    id: 'duel', title: 'Robot Race', coach: '',
    make: mixed(readQ, recallQ),
    goal: 10, rival: 4.5, base: 4, settle: [450, 1400],
    status: (t) => `You ${t.pos} · Robot ${t.rival}`,
    stars: (t) => (t.pos >= 10 ? (t.rival <= 5 ? 3 : t.rival <= 7 ? 2 : 1) : 0),
    score: (t) => (t.pos >= 10 ? 20 - t.rival : t.pos),
    line: (t, won) => (won ? `You beat the robot by ${10 - t.rival} steps.` : `The robot got there first. You were ${10 - t.pos} steps away.`),
  },
  bomb: {
    id: 'bomb', title: 'Bomb Defuse', coach: '',
    make: mixed(readQ, recallQ),
    fuse: (n) => Math.max(4, 8 - n * 0.3), base: 5, settle: [500, 1500],
    ...survive(12, 'defused'),
  },
  tf: {
    id: 'tf', title: 'True or False', coach: '',
    make: (_n, ctx) => trueFalseQ(ctx),
    base: 3, settle: [450, 1500],
    ...survive(15, 'right'),
  },
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
};
