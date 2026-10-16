import { useEffect, useRef, useState } from 'preact/hooks';
import { Pinyin } from '../components/Pinyin';
import { answer, startSession } from '../game';
import { shuffle } from '../practice';
import { speakZh } from '../speak';
import { choicesFor } from '../vocab';
import type { Phrase } from '../phrases';
import { gamePool } from './pool';
import { GameResult, GameTop, Hearts } from './Shell';

const TOTAL = 15;
const LIVES = 3;
const fallSeconds = (n: number) => Math.max(3.6, 8 - n * 0.3); // each word falls a little faster

interface Round { word: Phrase; options: Phrase[] }

export function Rain({ onClose, onAgain }: { onClose: () => void; onAgain: () => void }) {
  const [rounds] = useState<Round[]>(() => {
    const { words, known } = gamePool();
    return shuffle(words).slice(0, TOTAL).map((word) => ({ word, options: choicesFor(word, known, 2) }));
  });
  const [n, setN] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null); // word id tapped, or '' when it hit the ground
  const [over, setOver] = useState(false);
  const timer = useRef(0);
  useEffect(startSession, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const r = rounds[Math.min(n, rounds.length - 1)];
  useEffect(() => {
    if (!over) speakZh(r.word.hanzi);
  }, [n]);

  const settle = (id: string) => {
    if (picked !== null) return;
    const correct = id === r.word.id;
    setPicked(id);
    answer(correct, 4);
    const left = correct ? lives : lives - 1;
    if (correct) setScore((s) => s + 1);
    else setLives(left);
    speakZh(r.word.hanzi);
    timer.current = window.setTimeout(
      () => {
        if (left === 0 || n + 1 >= rounds.length) setOver(true);
        else {
          setN(n + 1);
          setPicked(null);
        }
      },
      correct ? 450 : 1500,
    );
  };

  if (over) {
    const won = lives > 0;
    return (
      <div class="learn">
        <GameResult
          id="rain" stars={won ? lives : 0} score={score}
          line={won ? `All ${rounds.length} words caught with ${lives} ${lives === 1 ? 'life' : 'lives'} left.` : `You caught ${score} of ${rounds.length} words.`}
          onAgain={onAgain} onClose={onClose}
        />
      </div>
    );
  }

  const wrong = picked !== null && picked !== r.word.id;
  return (
    <div class="learn rain">
      <GameTop onClose={onClose}>
        <Hearts n={lives} />
        <small>{n + 1} / {rounds.length}</small>
      </GameTop>
      <div class="arena">
        <div class="cloud c1" /><div class="cloud c2" />
        <div
          key={n}
          class={`faller ${picked === r.word.id ? 'caught' : wrong ? 'splat' : ''}`}
          style={`animation-duration:${fallSeconds(n)}s;animation-play-state:${picked === null ? 'running' : 'paused'}`}
          onAnimationEnd={(e) => (e.target as HTMLElement).classList.contains('faller') && e.animationName === 'rain' && settle('')}
        >
          <div class="hz">{r.word.hanzi}</div>
          {picked !== null && <Pinyin text={r.word.py} />}
        </div>
        <div class="ground" />
      </div>
      <div class="opts">
        {r.options.map((o) => (
          <button
            class={`opt ${picked !== null && o.id === r.word.id ? 'right' : ''} ${picked === o.id && o.id !== r.word.id ? 'wrong' : ''}`}
            disabled={picked !== null && o.id !== r.word.id && picked !== o.id}
            onClick={() => settle(o.id)}
          >
            <b>{o.en}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
