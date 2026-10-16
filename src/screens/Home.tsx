import { Ring } from '../components/Ring';
import { Pinyin } from '../components/Pinyin';
import { IconFlame, IconMute, IconPlay, IconSound } from '../components/Icons';
import { setQuiet } from '../components/QuietToggle';
import { dateKey, dayDone, fmtMin, streakOf, useStore } from '../store';
import { Quests, XpBar } from '../components/Game';
import { DAILY_GAME_XP, gameOfToday, levelOf, xpToday, type GameId } from '../game';
import { useVocabPlan } from '../useVocab';
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

export function Home({ onStart, onWords, onExtra, onGame }: { onStart: () => void; onWords: () => void; onExtra: () => void; onGame: (id: GameId) => void }) {
  const s = useStore();
  const vocab = useVocabPlan();
  const { cards } = useCards();
  const today = s.minutesByDate[dateKey()] ?? 0;
  const streak = streakOf(s);
  const [zh, en] = greeting();
  const game = gameOfToday();
  const gamePlayed = !!s.gamesPlayed[dateKey()];
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
    return { label, mins: s.minutesByDate[dateKey(d)] ?? 0, done: dayDone(s, dateKey(d)), frozen: !!s.frozen[dateKey(d)], isToday: i === mondayOffset };
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
        <div class="chip level" title="Level">Lv {levelOf(s.xp)}</div>
        <div class="chip streak" title={`Day streak. ${s.freezes} streak freeze${s.freezes === 1 ? '' : 's'} banked`}>
          <IconFlame />
          <b>{streak}</b>
          {s.freezes > 0 && <span class="ice">❄{s.freezes}</span>}
        </div>
      </header>

      {s.quiet && (
        <p class="quiet-banner rise" style="--i:1">Quiet mode: sound is off. Tap the speaker to turn it back on.</p>
      )}
      {needsBackup && (
        <p class="quiet-banner rise" style="--i:1">Back up your progress: Settings → Backup. It takes five seconds.</p>
      )}

      {!vocab.done && streak > 0 && new Date().getHours() >= 17 && (
        <p class="quiet-banner risk rise" style="--i:1">Your {streak}-day streak ends at midnight. Finish your words to keep it.</p>
      )}

      <section class="hero rise" style="--i:1">
        <div class="hero-text">
          <h1>Today’s practice</h1>
          <p>{left <= 0 ? 'Goal reached. Nice work!' : `${left} min to your daily goal`}</p>
        </div>
        <Ring value={today} goal={s.goalMin} size={116} />
        <div class="hero-chips">
          <span class={vocab.done ? 'ok' : ''}>{vocab.done ? 'Words done ✓' : `${vocab.left} words to type`}</span>
          <span>{due} to review</span>
          <span>{fresh} new</span>
        </div>
        <button class="cta" onClick={onStart}>
          <IconPlay /> {due + fresh === 0 ? 'Learn more' : 'Start session'}
        </button>
      </section>

      <button class={`card game-card rise ${gamePlayed ? 'played' : ''}`} style="--i:2" onClick={() => onGame(game.id)}>
        <span class="glyph">{game.glyph}</span>
        <span class="mode-text">
          <b>Today’s game: {game.title} <em class="req">{gamePlayed ? 'won ✓' : `+${DAILY_GAME_XP} XP`}</em></b>
          <small>{gamePlayed ? 'Beaten today. Play again for fun, or come back tomorrow for a new one.' : game.blurb}</small>
        </span>
      </button>

      <section class="card level-card rise" style="--i:2">
        <XpBar xp={s.xp} />
        <small class="xp-today">{xpToday() > 0 ? `+${xpToday()} XP today` : 'Earn XP with every right answer'}</small>
      </section>

      <button class={`card vocab-card rise ${vocab.done ? 'done' : ''}`} style="--i:2" onClick={onWords}>
        <span class="glyph">词</span>
        <span class="mode-text">
          <b>Word practice <em class="req">required</em></b>
          <small>
            {vocab.mastered === vocab.total
              ? 'All words mastered!'
              : vocab.done
                ? `Done for today ✓ · ${vocab.mastered} of ${vocab.total} words mastered`
                : `${vocab.left} words to type · ${vocab.mastered} of ${vocab.total} mastered`}
          </small>
        </span>
      </button>

      <div class="rise" style="--i:2"><Quests /></div>

      <section class="card week rise" style="--i:2">
        <div class="week-head">
          <b>This week</b>
          <small>{fmtMin(weekMinutes)} min</small>
        </div>
        <div class="week-days">
          {week.map((d) => (
            <div class={`day ${d.done ? 'done' : ''} ${d.frozen ? 'frozen' : ''} ${d.isToday ? 'today' : ''}`}>
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
