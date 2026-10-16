import { useEffect, useState } from 'preact/hooks';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Vocab } from './screens/Vocab';
import { useVocabPlan } from './useVocab';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { Practice, type Mode } from './screens/Practice';
import { Quiz } from './screens/Quiz';
import { Build } from './screens/Build';
import type { Round } from './practice';
import type { Phrase } from './phrases';
import { PHRASE_BY_ID } from './phrases';
import { useCards } from './db';
import { listenRounds, pinyinRounds, readRounds, recallRounds, toneRounds } from './practice';
import { Toaster } from './components/Game';
import { applyFreezes, checkProgress, type GameId } from './game';
import { Match } from './games/Match';
import { Rain } from './games/Rain';
import { Boss } from './games/Boss';
import { IconChart, IconGear, IconHome, IconSpark } from './components/Icons';

const ROUNDS: Partial<Record<Mode, (pool: Phrase[]) => Round[]>> = {
  tones: () => toneRounds(),
  listen: listenRounds,
  read: readRounds,
  recall: recallRounds,
  pinyin: () => pinyinRounds(),
};
const TITLES: Record<Mode, string> = {
  tones: 'Tone ears',
  listen: 'Listen & choose',
  read: 'Read & choose',
  recall: 'Say it in Chinese',
  pinyin: 'Tones by sight',
  build: 'Build the sentence',
};

type Tab = 'home' | 'practice' | 'progress' | 'settings';

const TABS: { id: Tab; label: string; icon: () => preact.JSX.Element }[] = [
  { id: 'home', label: 'Today', icon: IconHome },
  { id: 'practice', label: 'Extra', icon: IconSpark },
  { id: 'progress', label: 'Progress', icon: IconChart },
  { id: 'settings', label: 'Settings', icon: IconGear },
];

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  // words are compulsory and come first; 'vocab+' continues into the phrase session when finished
  const [screen, setScreen] = useState<null | 'vocab' | 'vocab+' | 'learn'>(null);
  const vocab = useVocabPlan();
  const { cards, loaded } = useCards();
  useEffect(() => {
    if (!loaded) return;
    applyFreezes(); // a missed day is covered by a streak freeze if one is banked
    checkProgress();
  }, [loaded, vocab.done]);
  // Extra practice only draws on items you have already started learning.
  const pool = [...new Set(cards.map((c) => c.phraseId))].map((id) => PHRASE_BY_ID.get(id)!).filter(Boolean);
  const [game, setGame] = useState<{ id: GameId; run: number } | null>(null);
  const playGame = (id: GameId) => setGame((g) => ({ id, run: (g?.run ?? 0) + 1 }));
  const [quiz, setQuiz] = useState<{ mode: Mode; rounds: Round[]; run: number } | null>(null);

  const startQuiz = (mode: Mode) =>
    setQuiz((q) => ({ mode, rounds: ROUNDS[mode]?.(pool) ?? [], run: (q?.run ?? 0) + 1 }));

  if (game) {
    const close = () => setGame(null);
    const again = () => playGame(game.id);
    return (
      <>
        <Toaster />
        {game.id === 'match' ? <Match key={game.run} onClose={close} onAgain={again} />
          : game.id === 'rain' ? <Rain key={game.run} onClose={close} onAgain={again} />
          : <Boss key={game.run} onClose={close} onAgain={again} />}
      </>
    );
  }
  if (screen === 'vocab' || screen === 'vocab+')
    return <><Toaster /><Vocab onClose={() => setScreen(null)} onContinue={screen === 'vocab+' ? () => setScreen('learn') : undefined} /></>;
  if (screen === 'learn') return <><Toaster /><Learn onClose={() => setScreen(null)} /></>;
  if (quiz?.mode === 'build') return <><Toaster /><Build key={quiz.run} pool={pool} onClose={() => setQuiz(null)} onRetry={() => startQuiz('build')} /></>;
  if (quiz)
    return (
      <><Toaster /><Quiz
        key={quiz.run}
        title={TITLES[quiz.mode]}
        rounds={quiz.rounds}
        onClose={() => setQuiz(null)}
        onRetry={() => startQuiz(quiz.mode)}
      /></>
    );

  return (
    <>
      <Toaster />
      <div key={tab}>
        {tab === 'home' && <Home
            onStart={() => setScreen(vocab.done ? 'learn' : 'vocab+')}
            onWords={() => setScreen('vocab')}
            onExtra={() => setTab('practice')}
            onGame={playGame}
          />}
        {tab === 'practice' && <Practice onPick={startQuiz} onGame={playGame} poolSize={pool.length} />}
        {tab === 'progress' && <Progress />}
        {tab === 'settings' && <Settings />}
      </div>
      <nav class="tabbar">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button class={tab === id ? 'on' : ''} onClick={() => { setTab(id); scrollTo(0, 0); }}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
