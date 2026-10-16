import { useEffect, useState } from 'preact/hooks';
import { IconClose, IconHeart } from '../components/Icons';
import { ComboChip, Confetti } from '../components/Game';
import { finishGame, GAMES, type GameId } from '../game';

export function Hearts({ n, max = 3 }: { n: number; max?: number }) {
  return (
    <div class="hearts" aria-label={`${n} lives left`}>
      {Array.from({ length: max }, (_, i) => <span class={i < n ? 'on' : ''}><IconHeart /></span>)}
    </div>
  );
}

export function GameTop({ onClose, children }: { onClose: () => void; children?: preact.ComponentChildren }) {
  return (
    <header class="learn-top">
      <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
      <div class="gtop">{children}</div>
      <ComboChip />
    </header>
  );
}

export function GameResult({ id, stars, score, line, onAgain, onClose }: {
  id: GameId; stars: number; score: number; line: string; onAgain: () => void; onClose: () => void;
}) {
  const [res, setRes] = useState<ReturnType<typeof finishGame> | null>(null);
  useEffect(() => setRes(finishGame(id, stars, score)), []);
  const game = GAMES.find((g) => g.id === id)!;
  return (
    <div class="finish rise">
      {stars > 0 && <Confetti />}
      <div class="stars" aria-label={`${stars} of 3 stars`}>
        {[1, 2, 3].map((n) => <span class={n <= stars ? 'on' : ''} style={`--i:${n}`}>★</span>)}
      </div>
      <h1>{stars > 0 ? 'You won!' : 'So close!'}</h1>
      <p>{line}</p>
      {res && (
        <div class="reward">
          <div class="xp-big">+{res.xp} <span>XP</span></div>
          <small>{res.daily ? 'includes the daily game bonus' : stars > 0 ? `${game.title} cleared` : 'try again to win the bonus'}</small>
          {res.best && stars > 0 && <div class="best">New best: {score}</div>}
        </div>
      )}
      <button class="cta solid" onClick={onAgain}>Play again</button>
      <button class="ghost" onClick={onClose}>Back</button>
    </div>
  );
}
