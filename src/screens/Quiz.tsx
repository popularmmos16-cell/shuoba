import { useEffect, useState } from 'preact/hooks';
import type { Round } from '../practice';
import { Pinyin } from '../components/Pinyin';
import { IconClose, IconSound, IconCheck } from '../components/Icons';
import { speakZh } from '../speak';
import { Confetti, ComboChip } from '../components/Game';
import { answer, getSession, startSession } from '../game';

export function Quiz({ title, rounds, onClose, onRetry }: { title: string; rounds: Round[]; onClose: () => void; onRetry: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const done = i >= rounds.length;
  const r = rounds[Math.min(i, rounds.length - 1)];

  useEffect(startSession, []);
  useEffect(() => {
    if (!done && r.say) speakZh(r.say);
  }, [i]);

  const choose = (n: number) => {
    if (picked !== null) return;
    setPicked(n);
    if (n === r.answer) setScore((s) => s + 1);
    answer(n === r.answer, 3);
  };
  const next = () => {
    setPicked(null);
    setI((n) => n + 1);
  };

  return (
    <div class="learn">
      <header class="learn-top">
        <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        <div class="bar"><i style={{ width: `${(Math.min(i, rounds.length) / rounds.length) * 100}%` }} /></div>
        <ComboChip />
        <small>{Math.min(i, rounds.length)}/{rounds.length}</small>
      </header>

      {done ? (
        <div class="finish rise">
          {score === rounds.length && <Confetti />}
          <div class="seal big"><IconCheck /></div>
          <h1>{score} / {rounds.length}</h1>
          <p>{title} done. <b class="gain">+{getSession().xp} XP</b> earned. Extra practice never affects your streak or goal, so there’s no pressure.</p>
          <button class="cta solid" onClick={onRetry}>Practise again</button>
          <button class="ghost" onClick={onClose}>Back to Extra</button>
        </div>
      ) : (
        <>
          <div class="flash q" key={i}>
            <small class="eyebrow">{title}</small>
            {r.say ? (
              <button class="big-play" aria-label="Play audio" onClick={() => speakZh(r.say!)}><IconSound /></button>
            ) : (
              <div class={`stem ${r.stem?.size ?? 'md'}`}>{r.stem?.text}</div>
            )}
            <p class="q-prompt">{r.prompt}</p>
            {picked !== null && (
              <div class="reveal">
                {r.reveal.hanzi && <div class="hanzi">{r.reveal.hanzi}</div>}
                <Pinyin text={r.reveal.py} />
                {r.reveal.en && <p class="en">{r.reveal.en}</p>}
              </div>
            )}
          </div>

          <div class="opts">
            {r.options.map((o, n) => (
              <button
                class={`opt ${picked !== null && n === r.answer ? 'right' : ''} ${picked === n && n !== r.answer ? 'wrong' : ''}`}
                onClick={() => choose(n)}
              >
                {o.py ? <Pinyin text={o.main} /> : <b class={o.big ? 'hz' : ''}>{o.main}</b>}
                {o.sub && <small>{o.sub}</small>}
              </button>
            ))}
          </div>
          <button class={`cta solid next ${picked === null ? 'hide' : ''}`} onClick={next} disabled={picked === null}>
            {i === rounds.length - 1 ? 'Finish' : 'Next'}
          </button>
        </>
      )}
    </div>
  );
}
