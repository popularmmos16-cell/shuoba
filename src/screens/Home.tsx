import { Ring } from '../components/Ring';
import { Pinyin } from '../components/Pinyin';
import { IconFlame, IconMute, IconPlay, IconSound } from '../components/Icons';
import { setQuiet } from '../components/QuietToggle';
import { dateKey, streakOf, useStore } from '../store';
import { phraseOfTheDay } from '../phrases';
import { speakZh } from '../speak';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function greeting(): [string, string] {
  const h = new Date().getHours();
  if (h < 12) return ['早上好', 'Good morning'];
  if (h < 18) return ['下午好', 'Good afternoon'];
  return ['晚上好', 'Good evening'];
}

export function Home({ onStart, onExtra }: { onStart: () => void; onExtra: () => void }) {
  const s = useStore();
  const today = s.minutesByDate[dateKey()] ?? 0;
  const streak = streakOf(s);
  const [zh, en] = greeting();
  const phrase = phraseOfTheDay();

  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const week = DAYS.map((label, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - mondayOffset + i);
    return { label, done: !!s.minutesByDate[dateKey(d)], isToday: i === mondayOffset };
  });
  const weekMinutes = week.reduce((n, _, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - mondayOffset + i);
    return n + (s.minutesByDate[dateKey(d)] ?? 0);
  }, 0);

  return (
    <main class="screen">
      <header class="top rise" style="--i:0">
        <div class="seal">说</div>
        <div>
          <div class="hello">{zh}</div>
          <small>{en}</small>
        </div>
        <button class={`chip mute ${s.quiet ? 'on' : ''}`} aria-label={s.quiet ? 'Turn sound on' : 'Turn sound off (quiet mode)'} onClick={() => setQuiet(!s.quiet)}>
          {s.quiet ? <IconMute /> : <IconSound />}
        </button>
        <div class="chip streak" title="Day streak">
          <IconFlame />
          <b>{streak}</b>
        </div>
      </header>

      {s.quiet && (
        <p class="quiet-banner rise" style="--i:1">Quiet mode: sound is off. Tap the speaker to turn it back on.</p>
      )}

      <section class="hero rise" style="--i:1">
        <div class="hero-text">
          <h1>Today’s practice</h1>
          <p>{today >= s.goalMin ? 'Goal reached. Nice work!' : `${Math.max(0, s.goalMin - today)} minutes to your daily goal`}</p>
        </div>
        <Ring value={today} goal={s.goalMin} />
        <button class="cta" onClick={onStart}>
          <IconPlay /> Start session
        </button>
      </section>

      <section class="card week rise" style="--i:2">
        <div class="week-head">
          <b>This week</b>
          <small>{weekMinutes} min</small>
        </div>
        <div class="week-days">
          {week.map((d) => (
            <div class={`day ${d.done ? 'done' : ''} ${d.isToday ? 'today' : ''}`}>
              <span class="dot" />
              <small>{d.label}</small>
            </div>
          ))}
        </div>
      </section>

      <section class="tiles rise" style="--i:3">
        <div class="card tile"><b>0</b><small>words known</small></div>
        <div class="card tile"><b>{streak}</b><small>day streak</small></div>
        <div class="card tile"><b>0%</b><small>everyday talk</small></div>
      </section>

      <button class="card extra-teaser rise" style="--i:4" onClick={onExtra}>
        <span class="glyph">练</span>
        <span class="mode-text"><b>Got extra time?</b><small>Optional bonus practice, including silent options</small></span>
      </button>

      <section class="card phrase rise" style="--i:5">
        <small class="eyebrow">Phrase of the day</small>
        <div class="hanzi">{phrase.hanzi}</div>
        <Pinyin text={phrase.py} />
        <p class="en">{phrase.en}</p>
        {!s.quiet && (
          <button class="round" aria-label="Play audio" onClick={() => speakZh(phrase.hanzi)}>
            <IconPlay />
          </button>
        )}
      </section>
    </main>
  );
}
