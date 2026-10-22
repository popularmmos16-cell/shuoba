import { useEffect, useRef, useState } from 'preact/hooks';
import { Pinyin } from '../components/Pinyin';
import { answer, startSession } from '../game';
import { shuffle } from '../practice';
import { speakZh } from '../speak';
import { WORDS } from '../vocab';
import type { Phrase } from '../phrases';
import { gamePool, shortGloss } from './pool';
import { GameResult, GameTop } from './Shell';

const N = 6; // the grid is N x N
const HUNT = 4; // words hidden in it
const SECONDS = 120;

const hanzi = (s: string) => [...s].filter((c) => c >= '一' && c <= '鿿');

// Hide words across (left to right) or down (top to bottom), then fill every other cell with characters from other words.
function build(): { words: Phrase[]; cells: string[]; at: number[][] } {
  const { words: pool } = gamePool(24);
  const fit = pool.filter((w) => hanzi(w.hanzi).length >= 2 && hanzi(w.hanzi).length <= 3 && hanzi(w.hanzi).length === [...w.hanzi].length && shortGloss(w).length > 2);
  for (;;) {
    const words: Phrase[] = [];
    const used = new Set<string>();
    for (const w of shuffle(fit)) {
      if (words.length === HUNT) break;
      if ([...w.hanzi].some((c) => used.has(c))) continue; // no character in two words, so a tap path is never ambiguous
      words.push(w);
      [...w.hanzi].forEach((c) => used.add(c));
    }
    if (words.length < HUNT) return build2(words, used, fit);
    const placed = place(words);
    if (placed) return fill(words, used, placed);
  }
}
// too few usable words known yet: top up from every word
function build2(words: Phrase[], used: Set<string>, fit: Phrase[]) {
  for (const w of shuffle(WORDS)) {
    if (words.length === HUNT) break;
    const n = [...w.hanzi].length;
    if (fit.includes(w) || n < 2 || n > 3 || hanzi(w.hanzi).length !== n || [...w.hanzi].some((c) => used.has(c))) continue;
    words.push(w);
    [...w.hanzi].forEach((c) => used.add(c));
  }
  for (;;) {
    const placed = place(words);
    if (placed) return fill(words, used, placed);
  }
}
function place(words: Phrase[]): number[][] | null {
  const taken = new Set<number>();
  const at: number[][] = [];
  for (const w of words) {
    const len = [...w.hanzi].length;
    let ok: number[] | null = null;
    for (let tries = 0; tries < 60 && !ok; tries++) {
      const across = Math.random() < 0.5;
      const r = Math.floor(Math.random() * (across ? N : N - len + 1));
      const c = Math.floor(Math.random() * (across ? N - len + 1 : N));
      const cells = Array.from({ length: len }, (_, k) => (across ? r * N + c + k : (r + k) * N + c));
      if (cells.every((i) => !taken.has(i))) ok = cells;
    }
    if (!ok) return null;
    ok.forEach((i) => taken.add(i));
    at.push(ok);
  }
  return at;
}
function fill(words: Phrase[], used: Set<string>, at: number[][]) {
  const filler = shuffle([...new Set(WORDS.flatMap((w) => hanzi(w.hanzi)))].filter((c) => !used.has(c)));
  const cells = Array.from({ length: N * N }, (_, i) => filler[i % filler.length]);
  words.forEach((w, k) => [...w.hanzi].forEach((c, j) => (cells[at[k][j]] = c)));
  return { words, cells, at };
}

export function WordHunt({ onClose, onAgain }: { onClose: () => void; onAgain: () => void }) {
  const [game] = useState(build);
  const { words, cells } = game;
  const [sel, setSel] = useState<number[]>([]);
  const [found, setFound] = useState<number[]>([]); // indexes into words
  const [mistakes, setMistakes] = useState(0);
  const [hurt, setHurt] = useState(0);
  const [left, setLeft] = useState(SECONDS);
  const over = useRef(false);
  useEffect(startSession, []);

  const won = found.length === HUNT;
  const lost = left <= 0 && !won;
  over.current = won || lost;
  useEffect(() => {
    if (over.current) return;
    const id = window.setInterval(() => (over.current ? clearInterval(id) : setLeft((s) => s - 0.1)), 100);
    return () => clearInterval(id);
  }, [won]);

  const open = words.map((w, k) => ({ w, k })).filter(({ k }) => !found.includes(k));
  const hit = new Set(found.flatMap((k) => game.at[k]));
  const text = (s: number[]) => s.map((i) => cells[i]).join('');
  const live = (t: string) => open.some(({ w }) => w.hanzi.startsWith(t));

  const tap = (i: number) => {
    if (over.current || hit.has(i)) return;
    const prev = sel[sel.length - 1];
    const step = i - prev;
    const along = sel.length < 2 || step === sel[1] - sel[0];
    const adjacent = prev !== undefined && along && ((step === 1 && i % N !== 0) || step === N);
    let next = adjacent ? [...sel, i] : [i];
    const t = text(next);
    const done = open.find(({ w }) => w.hanzi === t);
    if (done) {
      setFound((f) => [...f, done.k]);
      answer(true, 5);
      speakZh(done.w.hanzi);
      return setSel([]);
    }
    if (!live(t)) {
      if (next.length > 1) {
        setMistakes((m) => m + 1);
        setHurt((x) => x + 1);
        answer(false, 5);
      }
      next = live(cells[i]) ? [i] : [];
    }
    setSel(next);
  };

  if (won || lost) {
    const stars = won ? (mistakes <= 1 ? 3 : mistakes <= 3 ? 2 : 1) : 0;
    return (
      <div class="learn">
        <GameResult
          id="hunt" stars={stars} score={found.length * 10 + (won ? Math.ceil(left) : 0) - mistakes * 3}
          line={won ? `All ${HUNT} words found with ${Math.ceil(left)}s to spare.` : `You found ${found.length} of ${HUNT} words.`}
          onAgain={onAgain} onClose={onClose}
        />
      </div>
    );
  }

  return (
    <div class={`learn gx ${hurt && sel.length === 0 ? 'gx-hurt' : ''}`} key={hurt}>
      <GameTop onClose={onClose}>
        <b class="gx-title">Word Hunt</b>
        <small class="gx-status">{found.length} / {HUNT}</small>
      </GameTop>
      <div class="gx-meter" aria-label={`${Math.ceil(left)} seconds left`}>
        <i class={left <= 20 ? 'low' : ''} style={{ width: `${Math.max(0, (left / SECONDS) * 100)}%` }} />
        <b>{Math.max(0, Math.ceil(left))}s</b>
      </div>
      <p class="coach">Find each word in the grid. Tap its characters in order, across or down.</p>
      <div class="wclues">
        {words.map((w, k) => (
          <div class={`wclue ${found.includes(k) ? 'hit' : ''}`}>
            {found.includes(k) ? <b class="hz">{w.hanzi}</b> : <b>{shortGloss(w)}</b>}
            <Pinyin text={w.py} />
          </div>
        ))}
      </div>
      <div class="wgrid" style={`--n:${N}`}>
        {cells.map((c, i) => (
          <button class={`wcell ${hit.has(i) ? 'hit' : ''} ${sel.includes(i) ? 'sel' : ''}`} onClick={() => tap(i)}>{c}</button>
        ))}
      </div>
    </div>
  );
}
