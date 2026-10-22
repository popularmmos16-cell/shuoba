import type { GameId } from '../game';
import { Echo } from './Echo';
import { Match } from './Match';
import { Quizzer } from './Quizzer';
import { SPECS } from './specs';
import { Sprint } from './Sprint';
import { Typer } from './Typer';
import { WordHunt } from './WordHunt';

export interface GameProps { onClose: () => void; onAgain: () => void }

export function Game({ id, onClose, onAgain }: GameProps & { id: GameId }) {
  switch (id) {
    case 'match': return <Match onClose={onClose} onAgain={onAgain} />;
    case 'sprint': return <Sprint onClose={onClose} onAgain={onAgain} />;
    case 'echo': return <Echo onClose={onClose} onAgain={onAgain} />;
    case 'typer': return <Typer onClose={onClose} onAgain={onAgain} />;
    case 'hunt': return <WordHunt onClose={onClose} onAgain={onAgain} />;
    default: return <Quizzer spec={SPECS[id]} onClose={onClose} onAgain={onAgain} />;
  }
}
