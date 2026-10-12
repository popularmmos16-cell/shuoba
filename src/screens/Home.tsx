import { Ring } from '../components/Ring';
import { Pinyin } from '../components/Pinyin';
import { IconFlame, IconMute, IconPlay, IconSound } from '../components/Icons';
import { setQuiet } from '../components/QuietToggle';
import { dateKey, fmtMin, streakOf, useStore } from '../store';
import { phraseOfTheDay, PHRASES } from '../phrases';
import { speakZh } from '../speak';
import { useCards } from '../db';
import { dueCards, learnedPhraseIds, newAllowanceToday, unseenPhrases } from '../srs';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const BACKUP_NUDGE_MS = 14 * 86_400_000;

function greeting(): [string, string] {
  const h = new Date().getHours();
  if (h < 12) return ['早上好', 'Good morning'];
  if (h < 18) return ['下午好', 'Good afternoon'];
  return ['晚上好', 'Good evening'];
}

export function Home({ onStart, onExtra }: { onStart: () => void; onExtra: () => void }) {
  const s = useStore();
  const { cards } = useCards();
  const today = s.minutesByDate[dateKey()] ?? 0;
  const streak = streakOf(s);
  const [zh, en] = greeting();
  const phrase = phraseOfTheDay();

  const due = dueCards(cards, s.quiet).length;
  const fresh = Math.min(newAllowanceToday(cards, s.newPerDay), unseenPhrases(cards).length);
  const learned = learnedPhraseIds(cards).size;
  const reviewsDone = cards.reduce((n, c) => n + c.reps, 0);
  const needsBackup = reviewsDone >= 20 && (!s.lastBackup || Date.now() - s.lastBackup > BACKUP_NUDGE_MS);

  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const week = DAYS.map((label, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - mondayOffset + i);
    return { label, mins: s.minutesByDate[dateKey(d)] ?? 0, isToday: i === mondayOffset };
  });
  const weekMinutes = week.reduce((n, d) => n + d.mins, 0);
  const left = Math.ceil(s.goalMin - today); // minutes still to go

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
      {needsBackup && (
        <p class="quiet-banner rise" style="--i:1">Back up your progress: Settings → Backup. It takes five seconds.</p>
      )}

      <section class="hero rise" style="--i:1">
        <div class="hero-text">
          <h1>Today’s practice</h1>
          <p>{left <= 0 ? 'Goal reached. Nice work!' : `${left} min to your daily goal`}</p>
          <p class="hero-sub">{due} to review · {fresh} new</p>
        </div>
        <Ring value={today} goal={s.goalMin} />
        <button class="cta" onClick={onStart}>
          <IconPlay /> {due + fresh === 0 ? 'Learn more' : 'Start session'}
        </button>
      </section>

      <section class="card week rise" style="--i:2">
        <div class="week-head">
          <b>This week</b>
          <small>{fmtMin(weekMinutes)} min</small>
        </div>
        <div class="week-days">
          {week.map((d) => (
            <div class={`day ${d.mins > 0 ? 'done' : ''} ${d.isToday ? 'today' : ''}`}>
              <span class="dot" />
              <small>{d.label}</small>
            </div>
          ))}
        </div>
      </section>

      <section class="tiles rise" style="--i:3">
        <div class="card tile"><b>{learned}</b><small>of {PHRASES.length} learned</small></div>
        <div class="card tile"><b>{streak}</b><small>day streak</small></div>
        <div class="card tile"><b>{due}</b><small>due now</small></div>
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
