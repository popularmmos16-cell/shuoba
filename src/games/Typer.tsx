import { useEffect, useRef, useState } from 'preact/hooks';
import { Pinyin } from '../components/Pinyin';
import { answer, startSession } from '../game';
import { shuffle } from '../practice';
import { speakZh } from '../speak';
import { checkPinyin, parseTarget } from '../typing';
import { gamePool, shortGloss } from './pool';
import { GameResult, GameTop, Hearts } from './Shell';

const ROUNDS = 8;
const LIVES = 3;

type Verdict = { ok: boolean; reason?: 'letters' | 'tones' };

export function Typer({ onClose, onAgain }: { onClose: () => void; onAgain: () => void }) {
  const [words] = useState(() => {
    const { words } = gamePool();
    const short = words.filter((w) => [...w.hanzi].length <= 3);
    return shuffle(short.length >= ROUNDS ? short : words).slice(0, ROUNDS);
  });
  const [i, setI] = useState(0);
  const [text, setText] = useState('');
  const [v, setV] = useState<Verdict | null>(null);
  const [lives, setLives] = useState(LIVES);
  const [right, setRight] = useState(0);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const w = words[i];
  useEffect(startSession, []);
  useEffect(() => { input.current?.focus(); }, [i]);

  const check = () => {
    if (v || !text.trim()) return;
    const r = checkPinyin(text, parseTarget(w.py));
    setV({ ok: r.ok, reason: r.ok ? undefined : r.reason });
    if (r.ok) setRight((n) => n + 1);
    else setLives((l) => l - 1);
    answer(r.ok, 8);
    speakZh(w.hanzi);
  };
  const next = () => {
    if (lives <= 0 || i + 1 >= words.length) return setOver(true);
    setText('');
    setV(null);
    setI(i + 1);
  };

  if (over)
    return (
      <div class="learn">
        <GameResult
          id="typer" stars={lives > 0 ? lives : 0} score={right * 10}
          line={lives > 0 ? `All ${words.length} typed with ${lives} ${lives === 1 ? 'life' : 'lives'} left.` : `You typed ${right} of ${words.length} correctly.`}
          onAgain={onAgain} onClose={onClose}
        />
      </div>
    );

  const last = lives <= 0 || i + 1 >= words.length;
  return (
    <div class={`learn gx ${v && !v.ok ? 'gx-hurt' : ''}`}>
      <GameTop onClose={onClose}>
        <Hearts n={lives} max={LIVES} />
        <small class="gx-status">{i + 1} / {words.length}</small>
      </GameTop>
      <div class="flash q gx-q" key={i}>
        <small class="eyebrow">Type the pinyin</small>
        <div class="stem lg">{w.hanzi}</div>
        <p class="gx-hint">{shortGloss(w)}</p>
        {v && (
          <div class={`reveal-line ${v.ok ? 'good' : 'bad'}`}>
            <Pinyin text={w.py} />
            <span>{v.ok ? 'Correct!' : v.reason === 'tones' ? 'Right letters, wrong tone' : 'Not quite'}</span>
          </div>
        )}
      </div>
      <form
        class="typebox"
        onSubmit={(e) => { e.preventDefault(); v ? next() : check(); }}
      >
        <input
          ref={(el) => {
            input.current = el;
            el?.setAttribute('autocorrect', 'off');
            el?.setAttribute('autocapitalize', 'off');
          }}
          value={text}
          readOnly={!!v}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          placeholder="e.g. ni3 hao3"
          autocomplete="off"
          spellcheck={false}
          enterkeyhint="go"
        />
        {v ? (
          <button type="submit" class="cta solid">{last ? 'Finish' : 'Next'}</button>
        ) : (
          <button type="submit" class="cta solid" disabled={!text.trim()}>Check</button>
        )}
      </form>
    </div>
  );
}
