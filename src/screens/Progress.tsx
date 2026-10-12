import { dateKey, fmtMin, streakOf, useStore } from '../store';
import { useCards } from '../db';
import { PHRASES } from '../phrases';
import { isStrong, learnedPhraseIds } from '../srs';
import { State } from 'ts-fsrs';

export function Progress() {
  const s = useStore();
  const { cards } = useCards();
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return { k: dateKey(d), label: d.getDate(), m: s.minutesByDate[dateKey(d)] ?? 0 };
  });
  const max = Math.max(s.goalMin, ...days.map((d) => d.m));
  const total = Object.values(s.minutesByDate).reduce((a, b) => a + b, 0);
  const learned = learnedPhraseIds(cards);
  const started = new Map(cards.filter((c) => c.kind === 'read').map((c) => [c.phraseId, c]));
  const rows = PHRASES.filter((p) => started.has(p.id)).reverse();

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
        <div class="card tile"><b>{fmtMin(total)}</b><small>total minutes</small></div>
        <div class="card tile"><b>{streakOf(s)}</b><small>day streak</small></div>
        <div class="card tile"><b>{learned.size}</b><small>phrases learned</small></div>
      </section>

      <h2 class="rise" style="--i:3">Your phrases</h2>
      {rows.length === 0 ? (
        <section class="card empty rise" style="--i:4">
          <b>Nothing here yet</b>
          <p>Start a session on the Today tab. Every phrase you learn shows up here, with how well it’s sticking.</p>
        </section>
      ) : (
        <section class="card plist rise" style="--i:4">
          {rows.map((p) => {
            const c = started.get(p.id)!;
            const label = isStrong(c) ? 'Strong' : learned.has(p.id) ? 'Learned' : c.state === State.Relearning ? 'Relearning' : 'Learning';
            return (
              <div class="prow">
                <div>
                  <div class="hanzi sm">{p.hanzi}</div>
                  <small>{p.en}</small>
                </div>
                <span class={`badge ${label.toLowerCase()}`}>{label}</span>
              </div>
            );
          })}
        </section>
      )}
      <p class="muted" style="margin:10px 4px">{PHRASES.length - rows.length} more phrases to come.</p>
    </main>
  );
}
