import { dateKey, streakOf, useStore } from '../store';

export function Progress() {
  const s = useStore();
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return { k: dateKey(d), label: d.getDate(), m: s.minutesByDate[dateKey(d)] ?? 0 };
  });
  const max = Math.max(s.goalMin, ...days.map((d) => d.m));
  const total = Object.values(s.minutesByDate).reduce((a, b) => a + b, 0);

  return (
    <main class="screen">
      <h1 class="page-title rise" style="--i:0">Progress</h1>
      <section class="card rise" style="--i:1">
        <div class="week-head"><b>Last 14 days</b><small>goal {s.goalMin} min</small></div>
        <div class="bars">
          {days.map((d) => (
            <div class="bar-col">
              <div class="bar-track"><i style={{ height: `${(d.m / max) * 100}%` }} /></div>
              <small>{d.label}</small>
            </div>
          ))}
        </div>
      </section>
      <section class="tiles rise" style="--i:2">
        <div class="card tile"><b>{total}</b><small>total minutes</small></div>
        <div class="card tile"><b>{streakOf(s)}</b><small>day streak</small></div>
        <div class="card tile"><b>0</b><small>words known</small></div>
      </section>
      <section class="card empty rise" style="--i:3">
        <b>Your words will show up here</b>
        <p>Once reviews are live, you’ll see every word and phrase you’ve learned, and how well each one is sticking.</p>
      </section>
    </main>
  );
}
