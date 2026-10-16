import { useEffect, useState } from 'preact/hooks';
import { BADGES, getSession, levelInfo, onCombo, onToast, titleOf, todaysQuests, type Toast } from '../game';
import { useStore } from '../store';
import { IconCheck, IconFlame } from './Icons';

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(
    () =>
      onToast((t) => {
        setList((l) => [...l, t].slice(-2));
        setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 3200);
      }),
    [],
  );
  return (
    <div class="toasts" aria-live="polite">
      {list.map((t) => (
        <div class="toast" key={t.id} onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}>
          <span class="glyph">{t.glyph}</span>
          <span><b>{t.title}</b><small>{t.sub}</small></span>
        </div>
      ))}
    </div>
  );
}

const COLORS = ['#ffd45e', '#ff8fb8', '#8f5cf0', '#4cd68a', '#6fa2ff'];
export function Confetti() {
  const bits = Array.from({ length: 28 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i % 7) * 90, dur: 1400 + ((i * 53) % 900), color: COLORS[i % COLORS.length], rot: (i * 47) % 360,
  }));
  return (
    <div class="confetti" aria-hidden="true">
      {bits.map((b) => (
        <i style={`left:${b.left}%;background:${b.color};animation-delay:${b.delay}ms;animation-duration:${b.dur}ms;--r:${b.rot}deg`} />
      ))}
    </div>
  );
}

// ×N flame shown in a session header while a run of right answers is alive
export function ComboChip() {
  const [, bump] = useState(0);
  useEffect(() => onCombo(() => bump((n) => n + 1)), []);
  const { combo } = getSession();
  if (combo < 2) return null;
  return (
    <div class={`combo ${combo >= 10 ? 'hot' : combo >= 5 ? 'warm' : ''}`} key={combo}>
      <IconFlame /><b>×{combo}</b>
    </div>
  );
}

export function XpBar({ xp }: { xp: number }) {
  const { level, into, span, pct } = levelInfo(xp);
  const [zh, en] = titleOf(level);
  return (
    <div class="xpbar">
      <div class="lvl">{level}</div>
      <div class="xp-main">
        <div class="xp-top"><b>{zh} <span>{en}</span></b><small>{into} / {span} XP</small></div>
        <div class="bar"><i style={{ width: `${Math.max(2, pct * 100)}%` }} /></div>
      </div>
    </div>
  );
}

export function Quests() {
  const s = useStore();
  const quests = todaysQuests(s);
  const left = quests.filter((q) => !q.done).length;
  return (
    <section class="card quests">
      <div class="week-head"><b>Daily quests</b><small>{left === 0 ? 'All done ✓' : `${left} to go`}</small></div>
      {quests.map((q) => (
        <div class={`quest ${q.done ? 'done' : ''}`}>
          <span class="qmark">{q.done ? <IconCheck /> : null}</span>
          <div class="qbody">
            <div class="qtop"><span>{q.title}</span><small>+{q.xp} XP</small></div>
            <div class="bar thin"><i style={{ width: `${(q.value / q.goal) * 100}%` }} /></div>
          </div>
        </div>
      ))}
    </section>
  );
}

export function BadgeGrid() {
  const { badges } = useStore();
  const got = BADGES.filter((b) => badges[b.id]).length;
  return (
    <section class="card">
      <div class="week-head"><b>Badges</b><small>{got} of {BADGES.length}</small></div>
      <div class="badges">
        {BADGES.map((b) => (
          <div class={`bdg ${badges[b.id] ? 'on' : ''}`} title={b.desc}>
            <span class="glyph">{b.glyph}</span>
            <b>{b.title}</b>
            <small>{badges[b.id] ? 'Earned' : b.desc}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

// Shown on a session's finish screen
export function Reward({ bonus }: { bonus: number }) {
  const s = useStore();
  const ses = getSession();
  return (
    <div class="reward">
      <div class="xp-big">+{ses.xp} <span>XP</span></div>
      <small>{bonus > 0 ? `includes a ${bonus} XP finishing bonus` : 'nice work'}</small>
      <XpBar xp={s.xp} />
      {ses.best >= 2 && <div class="best"><IconFlame /> Best combo ×{ses.best}</div>}
    </div>
  );
}
