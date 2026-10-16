import { useEffect, useState } from 'preact/hooks';
import { IconSound } from '../components/Icons';
import { answer, startSession, type GameId } from '../game';
import { speakZh } from '../speak';
import { useStore } from '../store';
import type { Phrase } from '../phrases';
import { deal, gamePool, sentencePool } from './pool';
import { GameResult, GameTop, Hearts } from './Shell';

// One engine for the multiple-choice games. A game is a Spec: how to make a question and what the rules are
// (lives, a goal, a clock, a fuse, a rival). The engine keeps one mutable record and redraws once per change,
// so a new question and its cleared state always arrive in the same frame.

export interface Q {
  eyebrow: string;
  stem?: preact.ComponentChildren;
  stemClass?: string;
  hint?: preact.ComponentChildren;
  say?: string; // spoken when the question appears
  replay?: boolean; // show a big play button instead of a stem
  options: { label: preact.ComponentChildren; ok: boolean }[];
  cols?: 1 | 2;
  reveal?: preact.ComponentChildren;
  sayAfter?: string;
}

export interface Ctx { words: Phrase[]; known: Set<string>; sentences: Phrase[]; quiet: boolean; word: () => Phrase }

export interface Tally { right: number; wrong: number; asked: number; lives: number; pos: number; rival: number; best: number; left: number }

export interface Spec {
  id: GameId;
  title: string;
  coach: string;
  make: (n: number, ctx: Ctx) => Q;
  lives?: number;
  goal?: number; // correct answers (or rungs) needed to win
  maxQ?: number;
  clock?: number; // seconds for the whole game
  clockBonus?: number;
  clockPenalty?: number;
  fuse?: (n: number) => number; // seconds per question
  rival?: number; // seconds between the rival's steps
  slide?: boolean; // a wrong answer moves you back a step
  base?: number; // XP per right answer
  settle?: [number, number]; // ms the answer stays on screen after a right / wrong one
  status: (t: Tally) => string;
  stars: (t: Tally) => number;
  score: (t: Tally) => number;
  line: (t: Tally, won: boolean) => string;
}

export function Quizzer({ spec, onClose, onAgain }: { spec: Spec; onClose: () => void; onAgain: () => void }) {
  const { quiet } = useStore();
  const [, setTick] = useState(0);
  const redraw = () => setTick((n) => n + 1);
  const [ctx] = useState<Ctx>(() => {
    const { words, known } = gamePool();
    return { words, known, sentences: sentencePool(), quiet, word: deal(words) };
  });
  const [g] = useState(() => {
    const fuse = spec.fuse?.(0) ?? 0;
    return {
      n: 0, q: spec.make(0, ctx), picked: null as number | null, over: false,
      lives: spec.lives ?? 0, right: 0, wrong: 0, pos: 0, rival: 0, rivalT: 0, best: 0, streak: 0,
      left: spec.clock ?? 0, fuse, fuseMax: fuse, timer: 0,
    };
  });

  const tally = (): Tally => ({
    right: g.right, wrong: g.wrong, asked: g.right + g.wrong, lives: g.lives, pos: g.pos, rival: g.rival, best: g.best, left: Math.ceil(g.left),
  });
  const ended = () =>
    (spec.lives !== undefined && g.lives <= 0) ||
    (spec.goal !== undefined && g.pos >= spec.goal) ||
    (spec.maxQ !== undefined && g.right + g.wrong >= spec.maxQ) ||
    (spec.rival !== undefined && g.rival >= spec.goal!) ||
    (spec.clock !== undefined && g.left <= 0);

  const advance = () => {
    if (ended()) g.over = true;
    else {
      g.n++;
      g.q = spec.make(g.n, ctx);
      g.picked = null;
      g.fuseMax = g.fuse = spec.fuse?.(g.n) ?? 0;
    }
    redraw();
  };

  const resolve = (i: number, ok: boolean) => {
    g.picked = i;
    answer(ok, spec.base ?? 4);
    if (ok) {
      g.right++; g.pos++; g.streak++;
      g.best = Math.max(g.best, g.streak);
      if (spec.clock) g.left += spec.clockBonus ?? 0;
    } else {
      g.wrong++; g.streak = 0;
      if (spec.lives !== undefined) g.lives--;
      if (spec.slide) g.pos = Math.max(0, g.pos - 1);
      if (spec.clock) g.left -= spec.clockPenalty ?? 0;
    }
    if (g.q.sayAfter) speakZh(g.q.sayAfter);
    redraw();
    const [a, b] = spec.settle ?? [650, 1600];
    g.timer = window.setTimeout(advance, ok ? a : b);
  };

  const pick = (i: number) => {
    if (g.picked !== null || g.over) return;
    resolve(i, g.q.options[i].ok);
  };

  useEffect(startSession, []);
  useEffect(() => () => clearTimeout(g.timer), []);
  useEffect(() => {
    if (!g.over && g.q.say) speakZh(g.q.say);
  }, [g.n]);

  const timed = spec.clock !== undefined || spec.fuse !== undefined || spec.rival !== undefined;
  useEffect(() => {
    if (!timed) return;
    const id = window.setInterval(() => {
      if (g.over) return;
      if (spec.clock !== undefined) {
        g.left -= 0.1;
        if (g.left <= 0) { g.left = 0; g.over = true; clearTimeout(g.timer); }
      }
      if (spec.fuse && g.picked === null && !g.over) {
        g.fuse -= 0.1;
        if (g.fuse <= 0) resolve(-1, false);
      }
      if (spec.rival && !g.over) {
        g.rivalT += 0.1;
        if (g.rivalT >= spec.rival) {
          g.rivalT = 0;
          g.rival++;
          if (g.rival >= spec.goal!) { g.over = true; clearTimeout(g.timer); }
        }
      }
      redraw();
    }, 100);
    return () => clearInterval(id);
  }, []);

  if (g.over) {
    const t = tally();
    const stars = spec.stars(t);
    return (
      <div class="learn">
        <GameResult id={spec.id} stars={stars} score={spec.score(t)} line={spec.line(t, stars > 0)} onAgain={onAgain} onClose={onClose} />
      </div>
    );
  }

  const t = tally();
  const q = g.q;
  const race = spec.goal !== undefined && (spec.slide || spec.rival !== undefined);
  const answered = g.picked !== null;
  const wrong = answered && !q.options[g.picked!]?.ok;
  return (
    <div class={`learn gx ${wrong ? 'gx-hurt' : ''}`}>
      <GameTop onClose={onClose}>
        {spec.lives !== undefined && spec.lives > 1 ? <Hearts n={g.lives} max={spec.lives} /> : <b class="gx-title">{spec.title}</b>}
        <small class="gx-status">{spec.status(t)}</small>
      </GameTop>

      {spec.clock !== undefined && (
        <div class="gx-meter" aria-label={`${t.left} seconds left`}>
          <i class={g.left <= 8 ? 'low' : ''} style={{ width: `${Math.min(100, (g.left / spec.clock) * 100)}%` }} />
          <b>{t.left}s</b>
        </div>
      )}
      {spec.fuse && (
        <div class="gx-meter fuse" aria-label="Fuse">
          <i class={g.fuse <= 2 ? 'low' : ''} style={{ width: `${(Math.max(0, g.fuse) / g.fuseMax) * 100}%` }} />
          <b>弹</b>
        </div>
      )}
      {race && (
        <div class="gx-track" aria-label={`You are on step ${g.pos} of ${spec.goal}`}>
          <span class="gx-flag">终</span>
          {spec.rival !== undefined && <i class="bot" style={{ left: `${(g.rival / spec.goal!) * 88}%` }}>机</i>}
          <i class="me" style={{ left: `${(g.pos / spec.goal!) * 88}%` }}>我</i>
        </div>
      )}

      <div class="flash q gx-q" key={g.n}>
        <small class="eyebrow">{q.eyebrow}</small>
        {q.replay ? (
          <button class="big-play small" aria-label="Play audio" onClick={() => q.say && speakZh(q.say)}><IconSound /></button>
        ) : (
          <div class={`stem ${q.stemClass ?? 'lg'}`}>{q.stem}</div>
        )}
        {q.hint && <p class="gx-hint">{q.hint}</p>}
        {answered && q.reveal && <div class={`reveal-line ${wrong ? 'bad' : 'good'}`}>{q.reveal}</div>}
      </div>

      <div class={`opts ${q.cols === 2 ? 'two' : ''}`} key={`o${g.n}`}>
        {q.options.map((o, i) => (
          <button
            class={`opt ${answered && o.ok ? 'right' : ''} ${g.picked === i && !o.ok ? 'wrong' : ''}`}
            disabled={answered && !o.ok && g.picked !== i}
            onClick={() => pick(i)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
