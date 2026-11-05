import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Pinyin } from '../components/Pinyin';
import { ComboChip, Confetti, Reward } from '../components/Game';
import { IconClose, IconSound } from '../components/Icons';
import { answer, drilledOne, startSession } from '../game';
import { speakZh } from '../speak';
import { addStudy, getState, update, useStore } from '../store';
import { choicesFor, MASTER_AT, type WordRow } from '../vocab';
import type { Phrase } from '../phrases';
import { entriesOf, type Entry } from './Words';

// Practice on your own word sheet, any time. It never touches the word schedule (that stays "first answer of the
// day decides"), it just earns XP and study time. Weak words come up more often.
export type DrillMode = 'calm' | 'blitz';
const ROUND = 10;
const BLITZ_SECONDS = 60;
const BLITZ_PENALTY = 3;

type Kind = 'hz-en' | 'en-hz' | 'audio-hz';
interface Q { word: Phrase; kind: Kind; choices: Phrase[] }

const weight = (e: Entry) => 1 + e.row.misses * 1.5 + (MASTER_AT - Math.min(e.row.streak, MASTER_AT)) + (e.status === 'due' ? 2 : 0);

function pick(entries: Entry[], last?: string): Entry {
  const pool = entries.length > 1 ? entries.filter((e) => e.word.id !== last) : entries;
  let r = Math.random() * pool.reduce((n, e) => n + weight(e), 0);
  for (const e of pool) if ((r -= weight(e)) < 0) return e;
  return pool[0];
}

export function Drill({ rows, mode, onClose, onAgain }: { rows: WordRow[]; mode: DrillMode; onClose: () => void; onAgain: () => void }) {
  const { quiet } = useStore();
  const entries = useMemo(() => entriesOf(rows), []);
  const known = useMemo(() => new Set(rows.map((r) => r.id)), []);
  const lastId = useRef<string | undefined>(undefined);
  const lastTick = useRef(Date.now());
  const timer = useRef(0);

  const make = (): Q => {
    const word = pick(entries, lastId.current).word;
    lastId.current = word.id;
    const kinds: Kind[] = quiet ? ['hz-en', 'en-hz'] : ['hz-en', 'hz-en', 'en-hz', 'en-hz', 'audio-hz'];
    return { word, kind: kinds[Math.floor(Math.random() * kinds.length)], choices: choicesFor(word, known) };
  };
  const [q, setQ] = useState<Q | null>(() => (entries.length ? make() : null));
  const [picked, setPicked] = useState<number | null>(null);
  const [n, setN] = useState(0); // questions finished
  const [right, setRight] = useState(0);
  const [missed, setMissed] = useState<Phrase[]>([]);
  const [left, setLeft] = useState(BLITZ_SECONDS);
  const [over, setOver] = useState(false);
  const [best, setBest] = useState<{ prev: number; isNew: boolean } | null>(null);
  const blitz = mode === 'blitz';

  useEffect(startSession, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (q?.kind === 'audio-hz') speakZh(q.word.hanzi);
  }, [q]);

  // the Blitz clock
  useEffect(() => {
    if (!blitz || over || !q) return;
    const id = window.setInterval(() => setLeft((s) => s - 0.1), 100);
    return () => clearInterval(id);
  }, [blitz, over, !q]);
  useEffect(() => {
    if (blitz && left <= 0 && !over) {
      clearTimeout(timer.current);
      setOver(true);
    }
  }, [left]);

  // save a new Blitz best once, when the round ends
  useEffect(() => {
    if (!over || !blitz) return;
    const prev = getState().gameBest.blitz ?? 0;
    const isNew = right > prev;
    if (isNew) update({ gameBest: { ...getState().gameBest, blitz: right } });
    setBest({ prev, isNew });
  }, [over]);

  const advance = (finishedN: number) => {
    if (!blitz && finishedN >= ROUND) return setOver(true);
    setPicked(null);
    setQ(make());
  };

  const choose = (i: number) => {
    if (!q || picked !== null || over) return;
    const ok = q.choices[i].id === q.word.id;
    const now = Date.now();
    addStudy(Math.min(30_000, now - lastTick.current) / 1000);
    lastTick.current = now;
    setPicked(i);
    answer(ok, 3);
    drilledOne();
    const finished = n + 1;
    setN(finished);
    if (ok) setRight((r) => r + 1);
    else {
      setMissed((m) => (m.some((w) => w.id === q.word.id) ? m : [...m, q.word]));
      if (blitz) setLeft((s) => s - BLITZ_PENALTY);
    }
    if (q.kind !== 'audio-hz') speakZh(q.word.hanzi);
    if (blitz) timer.current = window.setTimeout(() => advance(finished), ok ? 550 : 1300);
  };

  const next = () => advance(n);

  // keyboard: 1-4 to answer, Enter to continue
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (picked !== null && e.key === 'Enter' && !blitz) next();
      else if (picked === null && /^[1-4]$/.test(e.key)) choose(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!q) {
    return (
      <div class="learn">
        <header class="learn-top"><button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button></header>
        <div class="finish rise">
          <div class="seal big">练</div>
          <h1>No words yet</h1>
          <p>Finish today’s word practice first. Then every word you meet becomes something you can drill here.</p>
          <button class="cta solid" onClick={onClose}>Back</button>
        </div>
      </div>
    );
  }

  if (over) {
    const sparkle = blitz ? !!best?.isNew && right > 0 : missed.length === 0 && right >= ROUND;
    return (
      <div class="learn">
        <div class="finish rise">
          {sparkle && <Confetti />}
          <div class="eyebrow-line">{blitz ? 'Blitz' : 'Drill'}</div>
          <h1>{blitz ? `${right} in 60s` : `${right} / ${n}`}</h1>
          <p>
            {blitz
              ? best?.isNew && right > 0 ? 'A new personal best!' : `Your best is ${Math.max(best?.prev ?? 0, right)}.`
              : missed.length === 0 ? 'Every one right. Spotless.' : `${missed.length} to look at again:`}
          </p>
          {missed.length > 0 && (
            <div class="card plist missed">
              {missed.map((w) => (
                <div class="prow">
                  <div><div class="hanzi sm">{w.hanzi}</div><small>{w.en}</small></div>
                  <span class="miss-right"><Pinyin text={w.py} /><button class="wr-play" aria-label={`Play ${w.hanzi}`} onClick={() => speakZh(w.hanzi)}><IconSound /></button></span>
                </div>
              ))}
            </div>
          )}
          <Reward bonus={0} />
          <button class="cta solid" onClick={onAgain}>{blitz ? 'Beat it' : 'Another round'}</button>
          <button class="ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  const wrong = picked !== null && q.choices[picked].id !== q.word.id;
  const hz = q.kind !== 'hz-en';
  return (
    <div class={`learn gx ${wrong ? 'gx-hurt' : ''}`}>
      <header class="learn-top">
        <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        {blitz ? (
          <div class="gx-meter" aria-label={`${Math.ceil(left)} seconds left`} style="flex:1;margin:0">
            <i class={left <= 10 ? 'low' : ''} style={{ width: `${Math.max(0, (left / BLITZ_SECONDS) * 100)}%` }} />
            <b>{Math.max(0, Math.ceil(left))}s</b>
          </div>
        ) : (
          <div class="bar"><i style={{ width: `${(n / ROUND) * 100}%` }} /></div>
        )}
        <ComboChip />
        <small>{blitz ? right : `${n}/${ROUND}`}</small>
      </header>

      <div class="flash q gx-q" key={n}>
        <small class="eyebrow">{q.kind === 'hz-en' ? 'What does it mean?' : q.kind === 'en-hz' ? 'Which hanzi is this?' : 'Which hanzi did you hear?'}</small>
        {q.kind === 'audio-hz' ? (
          <button class="big-play" aria-label="Play audio" onClick={() => speakZh(q.word.hanzi)}><IconSound /></button>
        ) : q.kind === 'hz-en' ? (
          <div class={`stem ${[...q.word.hanzi].length > 3 ? 'sm' : [...q.word.hanzi].length > 2 ? 'lg' : 'xl'}`}>{q.word.hanzi}</div>
        ) : (
          <div class="stem md">{q.word.en}</div>
        )}
        {picked !== null && (
          <div class={`reveal-line ${wrong ? 'bad' : 'good'}`}>
            <b>{q.word.hanzi}</b> <Pinyin text={q.word.py} /> <span>{q.word.en}</span>
          </div>
        )}
      </div>

      <div class={`opts ${hz ? 'two' : ''}`} key={`o${n}`}>
        {q.choices.map((c, i) => (
          <button
            class={`opt ${picked !== null && c.id === q.word.id ? 'right' : ''} ${picked === i && c.id !== q.word.id ? 'wrong' : ''}`}
            disabled={picked !== null && c.id !== q.word.id && picked !== i}
            onClick={() => choose(i)}
          >
            {hz ? <b class="hz">{c.hanzi}</b> : <b>{c.en}</b>}
          </button>
        ))}
      </div>
      {!blitz && <button class={`cta solid next ${picked === null ? 'hide' : ''}`} disabled={picked === null} onClick={next}>{n >= ROUND ? 'Finish' : 'Next'}</button>}
    </div>
  );
}
