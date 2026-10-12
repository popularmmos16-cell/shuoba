import { useState } from 'preact/hooks';
import { buildRounds } from '../practice';
import type { Phrase } from '../phrases';
import { Pinyin } from '../components/Pinyin';
import { IconClose, IconCheck } from '../components/Icons';

export function Build({ pool, onClose, onRetry }: { pool: Phrase[]; onClose: () => void; onRetry: () => void }) {
  const [rounds] = useState(() => buildRounds(pool));
  const [i, setI] = useState(0);
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const done = i >= rounds.length;
  const r = rounds[Math.min(i, rounds.length - 1)];

  const add = (n: number) => result === null && setPlaced((p) => [...p, n]);
  const remove = (n: number) => result === null && setPlaced((p) => p.filter((x) => x !== n));
  const check = () => {
    const ok = placed.map((n) => r.tiles[n]).join('') === r.phrase.hanzi;
    setResult(ok);
    if (ok) setScore((s) => s + 1);
  };
  const next = () => {
    setPlaced([]);
    setResult(null);
    setI((n) => n + 1);
  };

  return (
    <div class="learn">
      <header class="learn-top">
        <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        <div class="bar"><i style={{ width: `${(Math.min(i, rounds.length) / rounds.length) * 100}%` }} /></div>
        <small>{Math.min(i, rounds.length)}/{rounds.length}</small>
      </header>

      {done ? (
        <div class="finish rise">
          <div class="seal big"><IconCheck /></div>
          <h1>{score} / {rounds.length}</h1>
          <p>Build the sentence done. Extra practice never affects your streak or goal.</p>
          <button class="cta solid" onClick={onRetry}>Practise again</button>
          <button class="ghost" onClick={onClose}>Back to Extra</button>
        </div>
      ) : (
        <>
          <div class="flash q" key={i}>
            <small class="eyebrow">Build the sentence</small>
            <p class="q-prompt">{r.phrase.en}</p>
            <div class={`answerbar ${result === true ? 'right' : result === false ? 'wrong' : ''}`}>
              {placed.length === 0 && <small>Tap the pieces in order</small>}
              {placed.map((n) => (
                <button class="piece" onClick={() => remove(n)}>{r.tiles[n]}</button>
              ))}
            </div>
            {result !== null && (
              <div class="reveal">
                {!result && <div class="hanzi">{r.phrase.hanzi}</div>}
                <Pinyin text={r.phrase.py} />
              </div>
            )}
          </div>

          <div class="bank">
            {r.tiles.map((t, n) => (
              <button class="piece" disabled={placed.includes(n)} onClick={() => add(n)}>{t}</button>
            ))}
          </div>

          {result === null ? (
            <button class="cta solid" disabled={placed.length !== r.tiles.length} onClick={check}>Check</button>
          ) : (
            <button class="cta solid" onClick={next}>{i === rounds.length - 1 ? 'Finish' : 'Next'}</button>
          )}
        </>
      )}
    </div>
  );
}
