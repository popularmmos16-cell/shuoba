import { useState } from 'preact/hooks';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { Practice, type Mode } from './screens/Practice';
import { Quiz } from './screens/Quiz';
import { Build } from './screens/Build';
import type { Round } from './practice';
import { listenRounds, pinyinRounds, readRounds, recallRounds, toneRounds } from './practice';
import { IconChart, IconGear, IconHome, IconSpark } from './components/Icons';

const ROUNDS: Partial<Record<Mode, () => Round[]>> = {
  tones: toneRounds,
  listen: listenRounds,
  read: readRounds,
  recall: recallRounds,
  pinyin: pinyinRounds,
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
  const [learning, setLearning] = useState(false);
  const [quiz, setQuiz] = useState<{ mode: Mode; rounds: Round[]; run: number } | null>(null);

  const startQuiz = (mode: Mode) =>
    setQuiz((q) => ({ mode, rounds: ROUNDS[mode]?.() ?? [], run: (q?.run ?? 0) + 1 }));

  if (learning) return <Learn onClose={() => setLearning(false)} />;
  if (quiz?.mode === 'build') return <Build key={quiz.run} onClose={() => setQuiz(null)} onRetry={() => startQuiz('build')} />;
  if (quiz)
    return (
      <Quiz
        key={quiz.run}
        title={TITLES[quiz.mode]}
        rounds={quiz.rounds}
        onClose={() => setQuiz(null)}
        onRetry={() => startQuiz(quiz.mode)}
      />
    );

  return (
    <>
      <div key={tab}>
        {tab === 'home' && <Home onStart={() => setLearning(true)} onExtra={() => setTab('practice')} />}
        {tab === 'practice' && <Practice onPick={startQuiz} />}
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
