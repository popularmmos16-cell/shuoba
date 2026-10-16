import { useEffect, useRef, useState } from 'preact/hooks';
import { Pinyin } from '../components/Pinyin';
import { answer, startSession } from '../game';
import { shuffle } from '../practice';
import { speakZh } from '../speak';
import type { Phrase } from '../phrases';
import { gamePool, shortGloss } from './pool';
import { GameResult, GameTop } from './Shell';

const PAIRS = 6;
interface Card { word: Phrase; side: 'hz' | 'en' }

function deck(): Card[] {
  const seen = new Set<string>();
  const ok = shuffle(gamePool().words).filter((w) => {
    const g = shortGloss(w).toLowerCase();
    if (g.length < 3 || !/^[a-z]/.test(g) || seen.has(g)) return false; // skip labels like "I" or "'s" that make poor cards
    seen.add(g);
    return true;
  });
  return shuffle(ok.slice(0, PAIRS).flatMap((word): Card[] => [{ word, side: 'hz' }, { word, side: 'en' }]));
}

export function Match({ onClose, onAgain }: { onClose: () => void; onAgain: () => void }) {
  const [cards] = useState(deck);
  const [open, setOpen] = useState<number[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [bad, setBad] = useState(false);
  const [moves, setMoves] = useState(0);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(startSession, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pairs = cards.length / 2;
  const stars = moves <= pairs + 3 ? 3 : moves <= pairs * 2 ? 2 : 1;
  const won = done.size === pairs;

  const flip = (i: number) => {
    if (busy.current || open.includes(i) || done.has(cards[i].word.id)) return;
    const now = [...open, i];
    setOpen(now);
    if (cards[i].side === 'hz') speakZh(cards[i].word.hanzi);
    if (now.length < 2) return;
    setMoves((m) => m + 1);
    busy.current = true;
    const [a, b] = now.map((n) => cards[n]);
    const match = a.word.id === b.word.id && a.side !== b.side;
    answer(match, 4);
    timers.current.push(
      window.setTimeout(() => {
        if (match) {
          setDone((d) => new Set(d).add(a.word.id));
          speakZh(a.word.hanzi);
        }
        setBad(false);
        setOpen([]);
        busy.current = false;
      }, match ? 500 : 900),
    );
    if (!match) setBad(true);
  };

  if (won)
    return (
      <div class="learn">
        <GameResult id="match" stars={stars} score={Math.max(1, 40 - moves * 2)} line={`Cleared in ${moves} moves.`} onAgain={onAgain} onClose={onClose} />
      </div>
    );

  return (
    <div class="learn">
      <GameTop onClose={onClose}>
        <div class="gmeta"><b>Memory Match</b><small>{done.size} / {pairs} pairs · {moves} moves</small></div>
      </GameTop>
      <p class="coach">Match each Chinese word with its meaning. Fewer moves, more stars.</p>
      <div class="mgrid">
        {cards.map((c, i) => {
          const up = open.includes(i) || done.has(c.word.id);
          return (
            <button
              class={`mcard ${up ? 'up' : ''} ${done.has(c.word.id) ? 'done' : ''} ${bad && open.includes(i) ? 'miss' : ''}`}
              aria-label={up ? (c.side === 'hz' ? c.word.hanzi : shortGloss(c.word)) : 'Hidden card'}
              onClick={() => flip(i)}
            >
              <span class="mface mback">问</span>
              <span class={`mface mfront ${c.side}`}>
                {c.side === 'hz' ? (
                  <>
                    <b>{c.word.hanzi}</b>
                    <Pinyin text={c.word.py} />
                  </>
                ) : (
                  <b>{shortGloss(c.word)}</b>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
