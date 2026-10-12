import { update, useStore } from '../store';
import { VoiceTest } from '../VoiceTest';

const GOALS = [10, 15, 20, 30];

export function Settings() {
  const s = useStore();
  return (
    <main class="screen">
      <h1 class="page-title rise" style="--i:0">Settings</h1>

      <section class="card rise" style="--i:1">
        <b>Daily goal</b>
        <div class="seg">
          {GOALS.map((g) => (
            <button class={s.goalMin === g ? 'on' : ''} onClick={() => update({ goalMin: g })}>{g} min</button>
          ))}
        </div>
      </section>

      <section class="card rise" style="--i:2">
        <b>Reminders</b>
        <p class="muted">Daily reminder at 12:00 (Singapore time). Coming in a later stage.</p>
      </section>

      <h2 class="rise" style="--i:3">Audio check</h2>
      <VoiceTest />
    </main>
  );
}
