import { useEffect, useRef, useState } from 'preact/hooks';
import { answer, startSession } from '../game';
import { shuffle } from '../practice';
import { speakZh } from '../speak';
import type { Phrase } from '../phrases';
import { gamePool, shortGloss } from './pool';
import { GameResult, GameTop, Hearts } from './Shell';

const TILES = 6;
const FIRST = 2; // length of the first sequence
const LAST = 6;
const LIVES = 3;

function board(): Phrase[] {
  const seen = new Set<string>();
  const all = shuffle(gamePool().words);
  const picks = all.filter((w) => {
    const g = shortGloss(w).toLowerCase();
    if (g.length < 3 || seen.has(g) || [...w.hanzi].length > 3) return false;
    seen.add(g);
    return true;
  });
  // too few tidy words: top up so the board is always full
  for (const w of all) if (picks.length < TILES && !picks.includes(w)) picks.push(w);
  return picks.slice(0, TILES);
}

function sequence(n: number): number[] {
  const s: number[] = [];
  while (s.length < n) {
    const k = Math.floor(Math.random() * TILES);
    if (k !== s[s.length - 1]) s.push(k);
  }
  return s;
}

type Phase = 'show' | 'input' | 'ok' | 'bad';
const SAY: Record<Phase, string> = {
  show: 'Watch and listen…',
  input: 'Your turn. Tap them in the same order.',
  ok: 'Nice! A little longer next time.',
  bad: 'Not that one. Watch again.',
};

export function Echo({ onClose, onAgain }: { onClose: () => void; onAgain: () => void }) {
  const [words] = useState(board);
  const [level, setLevel] = useState(FIRST);
  const [seq, setSeq] = useState(() => sequence(FIRST));
  const [phase, setPhase] = useState<Phase>('show');
  const [lit, setLit] = useState<number | null>(null);
  const [got, setGot] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [over, setOver] = useState(false);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => void timers.current.push(window.setTimeout(fn, ms));

  const play = (s: number[]) => {
    setPhase('show');
    setGot(0);
    let t = 600;
    s.forEach((k) => {
      later(() => { setLit(k); speakZh(words[k].hanzi); }, t);
      later(() => setLit(null), t + 650);
      t += 950;
    });
    later(() => setPhase('input'), t);
  };

  useEffect(() => {
    startSession();
    play(seq);
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const tap = (k: number) => {
    if (phase !== 'input') return;
    setLit(k);
    speakZh(words[k].hanzi);
    later(() => setLit(null), 300);
    if (k !== seq[got]) {
      answer(false, 4);
      const l = lives - 1;
      setLives(l);
      setPhase('bad');
      later(() => (l <= 0 ? setOver(true) : play(seq)), 1400);
      return;
    }
    answer(true, 4);
    const n = got + 1;
    setGot(n);
    if (n < seq.length) return;
    setPhase('ok');
    if (level >= LAST) return later(() => setOver(true), 800);
    later(() => {
      const s = sequence(level + 1);
      setLevel(level + 1);
      setSeq(s);
      play(s);
    }, 900);
  };

  if (over) {
    const won = lives > 0;
    return (
      <div class="learn">
        <GameResult
          id="echo" stars={won ? lives : 0} score={level * 10 + got}
          line={won ? `You held a chain of ${LAST} in your head.` : `You remembered chains up to ${level - 1 < FIRST ? 0 : level - 1}.`}
          onAgain={onAgain} onClose={onClose}
        />
      </div>
    );
  }

  return (
    <div class={`learn gx ${phase === 'bad' ? 'gx-hurt' : ''}`}>
      <GameTop onClose={onClose}>
        <Hearts n={lives} max={LIVES} />
        <small class="gx-status">Chain of {level} · {Math.min(got, level)} / {level}</small>
      </GameTop>
      <p class={`gx-say ${phase}`} aria-live="polite">{SAY[phase]}</p>
      <div class="egrid">
        {words.map((w, k) => (
          <button
            class={`etile ${lit === k ? 'lit' : ''} ${phase === 'bad' && lit === null ? 'dim' : ''}`}
            disabled={phase !== 'input'}
            onClick={() => tap(k)}
          >
            <b>{w.hanzi}</b>
            <small>{shortGloss(w)}</small>
          </button>
        ))}
      </div>
      <div class="edots" aria-hidden="true">
        {seq.map((_, n) => <i class={n < got ? 'on' : ''} />)}
      </div>
    </div>
  );
}
