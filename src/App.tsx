import { useState } from 'preact/hooks';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { IconChart, IconGear, IconHome } from './components/Icons';

type Tab = 'home' | 'progress' | 'settings';

const TABS: { id: Tab; label: string; icon: () => preact.JSX.Element }[] = [
  { id: 'home', label: 'Today', icon: IconHome },
  { id: 'progress', label: 'Progress', icon: IconChart },
  { id: 'settings', label: 'Settings', icon: IconGear },
];

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [learning, setLearning] = useState(false);

  if (learning) return <Learn onClose={() => setLearning(false)} />;

  return (
    <>
      <div key={tab}>
        {tab === 'home' && <Home onStart={() => setLearning(true)} />}
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
