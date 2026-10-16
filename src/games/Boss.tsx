import { useEffect, useRef, useState } from 'preact/hooks';
import { Pinyin } from '../components/Pinyin';
import { IconSound } from '../components/Icons';
import { answer, comboBonus, getSession, startSession } from '../game';
import { pickDistractors, shuffle } from '../practice';
import { speakZh } from '../speak';
import { useStore } from '../store';
import { choicesFor } from '../vocab';
import { PHRASES, type Phrase } from '../phrases';
import { gamePool, sentencePool } from './pool';
import { GameResult, GameTop, Hearts } from './Shell';

const BOSSES: [string, string][] = [['龙', 'Dragon'], ['虎', 'Tiger'], ['熊', 'Bear'], ['狐', 'Fox'], ['狼', 'Wolf']];
const BOSS_HP = 100;
const HEARTS = 3;
const DAMAGE = 14;

type Kind = 'read' | 'recall' | 'listen';
interface Q { kind: Kind; item: Phrase; options: Phrase[] }

function makeQuestion(quiet: boolean, i: number): Q {
  const { words, known } = gamePool();
  const sentences = sentencePool();
  // a sentence every third question once there are some to ask about
  const item = sentences.length >= 4 && i % 3 === 2 ? shuffle(sentences)[0] : shuffle(words)[0];
  const options = item.kind === 'word' ? choicesFor(item, known) : shuffle([item, ...pickDistractors(PHRASES, item, 3)]);
  const kinds: Kind[] = quiet ? ['read', 'recall'] : ['read', 'recall', 'listen'];
  return { kind: kinds[Math.floor(Math.random() * kinds.length)], item, options };
}

export function Boss({ onClose, onAgain }: { onClose: () => void; onAgain: () => void }) {
  const { quiet } = useStore();
  const [boss] = useState(() => BOSSES[Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000) % BOSSES.length]);
  const [i, setI] = useState(0);
  const [q, setQ] = useState(() => makeQuestion(quiet, 0));
  const [hp, setHp] = useState(BOSS_HP);
  const [hearts, setHearts] = useState(HEARTS);
  const [picked, setPicked] = useState<number | null>(null);
  const [hit, setHit] = useState<{ n: number; dmg: number } | null>(null); // last blow, for the hit animation
  const [hurt, setHurt] = useState(0);
  const [finished, setFinished] = useState(false);
  const timer = useRef(0);
  useEffect(startSession, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (q.kind === 'listen') speakZh(q.item.hanzi);
  }, [i]);

  const over = hp <= 0 || hearts <= 0;
  const won = hp <= 0;

  const next = () => {
    setPicked(null);
    setQ(makeQuestion(quiet, i + 1));
    setI(i + 1);
  };

  const pick = (n: number) => {
    if (picked !== null) return;
    const correct = q.options[n].id === q.item.id;
    setPicked(n);
    answer(correct, 5);
    speakZh(q.item.hanzi);
    if (correct) {
      const dmg = DAMAGE + comboBonus(getSession().combo) * 2;
      setHp((h) => Math.max(0, h - dmg));
      setHit({ n: i, dmg });
      timer.current = window.setTimeout(hp - dmg > 0 ? next : () => setFinished(true), hp - dmg > 0 ? 900 : 1100);
    } else {
      setHearts((h) => h - 1);
      setHurt((x) => x + 1);
      if (hearts - 1 <= 0) timer.current = window.setTimeout(() => setFinished(true), 1500);
    }
  };

  if (finished)
    return (
      <div class="learn">
        <GameResult
          id="boss" stars={won ? hearts : 0} score={BOSS_HP - Math.max(0, hp)}
          line={won ? `The ${boss[1]} is beaten with ${hearts} ${hearts === 1 ? 'heart' : 'hearts'} to spare.` : `The ${boss[1]} got away with ${hp} HP left.`}
          onAgain={onAgain} onClose={onClose}
        />
      </div>
    );

  const wrongPick = picked !== null && q.options[picked].id !== q.item.id;
  return (
    <div class={`learn boss ${hurt ? 'hurt' : ''}`}>
      <GameTop onClose={onClose}>
        <Hearts n={hearts} />
      </GameTop>
      <div class="foe">
        <div class={`foe-body ${hit?.n === i && picked !== null ? 'struck' : ''}`}>
          <span>{boss[0]}</span>
          {hit?.n === i && picked !== null && !wrongPick && <i class="dmg">-{hit.dmg}</i>}
        </div>
        <div class="hpbar" aria-label={`Boss health ${hp} of ${BOSS_HP}`}><i style={{ width: `${(hp / BOSS_HP) * 100}%` }} /></div>
        <small>{boss[1]} · {hp} HP</small>
      </div>

      <div class="flash q bq">
        <small class="eyebrow">{q.kind === 'listen' ? 'Listen' : q.kind === 'read' ? 'Read' : 'Recall'}</small>
        {q.kind === 'listen' ? (
          <button class="big-play small" aria-label="Play audio" onClick={() => speakZh(q.item.hanzi)}><IconSound /></button>
        ) : (
          <div class={`stem ${q.kind === 'read' && q.item.hanzi.length > 4 ? 'sm' : 'md'}`}>{q.kind === 'read' ? q.item.hanzi : q.item.en}</div>
        )}
        <p class="q-prompt sm">{q.kind === 'recall' ? 'Which one says this?' : 'What does it mean?'}</p>
        {picked !== null && (
          <div class={`reveal-line ${wrongPick ? 'bad' : 'good'}`}>
            <b>{q.item.hanzi}</b> <Pinyin text={q.item.py} /> <span>{q.item.en}</span>
          </div>
        )}
      </div>

      <div class={`opts ${q.kind === 'recall' && q.item.kind === 'word' ? 'two' : ''}`}>
        {q.options.map((o, n) => (
          <button
            class={`opt ${picked !== null && o.id === q.item.id ? 'right' : ''} ${picked === n && o.id !== q.item.id ? 'wrong' : ''}`}
            disabled={picked !== null && o.id !== q.item.id && picked !== n}
            onClick={() => pick(n)}
          >
            {q.kind === 'recall' ? <b class="hz">{o.hanzi}</b> : <b>{o.en}</b>}
          </button>
        ))}
      </div>
      {wrongPick && !over && <button class="cta solid" onClick={next}>Continue</button>}
    </div>
  );
}
