import { useEffect, useRef, useState } from 'preact/hooks';
import { AnswerBar, Bank, useAssemble } from '../components/Assemble';
import { Pinyin } from '../components/Pinyin';
import { answer, startSession } from '../game';
import { PHRASES, type Phrase } from '../phrases';
import { scramble, shuffle } from '../practice';
import { speakZh } from '../speak';
import { sentencePool } from './pool';
import { GameResult, GameTop, Hearts } from './Shell';

const ROUNDS = 6;
const LIVES = 3;
const budget = (p: Phrase) => 10 + p.words.length * 4; // seconds for a sentence

interface Round { phrase: Phrase; tiles: string[] }

function makeRounds(): Round[] {
  const mine = sentencePool().filter((p) => p.words.length >= 2 && p.words.length <= 7);
  const all = PHRASES.filter((p) => p.kind === 'phrase' && p.words.length >= 2 && p.words.length <= 6);
  const pool = mine.length >= ROUNDS ? mine : all;
  return shuffle(pool).slice(0, ROUNDS).map((phrase) => ({ phrase, tiles: scramble(phrase.words) }));
}

export function Sprint({ onClose, onAgain }: { onClose: () => void; onAgain: () => void }) {
  const [rounds] = useState(makeRounds);
  const [i, setI] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [right, setRight] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const [left, setLeft] = useState(() => budget(rounds[0].phrase));
  const [over, setOver] = useState(false);
  const r = rounds[i];
  const a = useAssemble(r.tiles, r.phrase.hanzi);
  const timedOut = useRef(false);
  useEffect(startSession, []);

  const settle = (ok: boolean) => {
    a.lock();
    setResult(ok);
    if (ok) setRight((n) => n + 1);
    else setLives((l) => l - 1);
    answer(ok, 6);
    speakZh(r.phrase.hanzi);
  };
  const check = () => a.complete && result === null && settle(a.isCorrect());

  // the clock runs while the sentence is open
  useEffect(() => {
    if (result !== null) return;
    const id = window.setInterval(() => setLeft((s) => s - 0.1), 100);
    return () => clearInterval(id);
  }, [i, result]);
  useEffect(() => {
    if (left <= 0 && result === null && !timedOut.current) {
      timedOut.current = true;
      settle(false);
    }
  }, [left]);

  const next = () => {
    if (lives <= 0 || i + 1 >= rounds.length) return setOver(true);
    timedOut.current = false;
    a.reset();
    setResult(null);
    setLeft(budget(rounds[i + 1].phrase));
    setI(i + 1);
  };

  if (over)
    return (
      <div class="learn">
        <GameResult
          id="sprint" stars={lives > 0 ? lives : 0} score={right}
          line={lives > 0 ? `All ${rounds.length} sentences rebuilt.` : `You rebuilt ${right} of ${rounds.length} sentences.`}
          onAgain={onAgain} onClose={onClose}
        />
      </div>
    );

  const total = budget(r.phrase);
  return (
    <div class={`learn gx ${result === false ? 'gx-hurt' : ''}`}>
      <GameTop onClose={onClose}>
        <Hearts n={lives} max={LIVES} />
        <small class="gx-status">{i + 1} / {rounds.length}</small>
      </GameTop>
      <div class="gx-meter">
        <i class={left <= 6 ? 'low' : ''} style={{ width: `${Math.max(0, (left / total) * 100)}%` }} />
        <b>{Math.max(0, Math.ceil(left))}s</b>
      </div>
      <div class="flash q gx-q" key={i}>
        <small class="eyebrow">Build the sentence</small>
        <p class="q-prompt">{r.phrase.en}</p>
        <AnswerBar a={a} tiles={r.tiles} result={result} />
        {result !== null && (
          <div class={`reveal-line ${result ? 'good' : 'bad'}`}>
            <b>{r.phrase.hanzi}</b> <Pinyin text={r.phrase.py} />
          </div>
        )}
      </div>
      <Bank a={a} tiles={r.tiles} />
      {result === null ? (
        <button class="cta solid" disabled={!a.complete} onClick={check}>Check</button>
      ) : (
        <button class="cta solid" onClick={next}>{lives <= 0 || i + 1 >= rounds.length ? 'Finish' : 'Next'}</button>
      )}
    </div>
  );
}
