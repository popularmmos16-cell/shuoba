import { useState } from 'preact/hooks';
import { buildRounds } from '../practice';
import type { Phrase } from '../phrases';
import { Pinyin } from '../components/Pinyin';
import { IconClose, IconCheck } from '../components/Icons';
import { AnswerBar, Bank, useAssemble } from '../components/Assemble';

export function Build({ pool, onClose, onRetry }: { pool: Phrase[]; onClose: () => void; onRetry: () => void }) {
  const [rounds] = useState(() => buildRounds(pool));
  const [i, setI] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const done = i >= rounds.length;
  const r = rounds[Math.min(i, rounds.length - 1)];
  const a = useAssemble(r.tiles, r.phrase.hanzi);

  const check = () => {
    const ok = a.isCorrect();
    a.lock();
    setResult(ok);
    if (ok) setScore((s) => s + 1);
  };
  const next = () => {
    a.reset();
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
            <AnswerBar a={a} tiles={r.tiles} result={result} />
            {result !== null && (
              <div class="reveal">
                {!result && <div class="hanzi">{r.phrase.hanzi}</div>}
                <Pinyin text={r.phrase.py} />
              </div>
            )}
          </div>

          <Bank a={a} tiles={r.tiles} />

          {result === null ? (
            <button class="cta solid" disabled={!a.complete} onClick={check}>Check</button>
          ) : (
            <button class="cta solid" onClick={next}>{i === rounds.length - 1 ? 'Finish' : 'Next'}</button>
          )}
        </>
      )}
    </div>
  );
}
