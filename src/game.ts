import { dateKey, dayDone, dayKept, getState, streakOf, update, type State } from './store';
import { getWords } from './db';
import { addDays } from './vocab';

// The reward layer: XP and levels, answer combos, daily quests, badges and streak freezes. All of it lives in the
// saved state (so it is part of the backup) and nothing here changes how words or phrases are scheduled.

// ---- levels ----
// Level L starts at 50 * L * (L - 1) XP: 0, 100, 300, 600, 1000, 1500 ...
const startOf = (level: number) => 50 * level * (level - 1);
export const levelOf = (xp: number) => Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
export function levelInfo(xp: number) {
  const level = levelOf(xp);
  const from = startOf(level);
  const to = startOf(level + 1);
  return { level, into: xp - from, span: to - from, pct: (xp - from) / (to - from) };
}
const TITLES: [string, string][] = [
  ['初学者', 'Beginner'], ['学徒', 'Apprentice'], ['学生', 'Student'], ['熟手', 'Regular'],
  ['能手', 'Skilled'], ['高手', 'Adept'], ['达人', 'Expert'], ['大师', 'Master'], ['宗师', 'Grandmaster'],
];
export const titleOf = (level: number) => TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))];

// ---- toasts ----
export interface Toast { id: number; glyph: string; title: string; sub: string }
const toastListeners = new Set<(t: Toast) => void>();
let toastId = 0;
export const onToast = (fn: (t: Toast) => void) => (toastListeners.add(fn), () => void toastListeners.delete(fn));
const toast = (glyph: string, title: string, sub: string) => toastListeners.forEach((l) => l({ id: ++toastId, glyph, title, sub }));

// ---- today's counters (reset each day) ----
function day(): State['day'] {
  const s = getState();
  const k = dateKey();
  return s.day.k === k ? s.day : { k, right: 0, best: 0, learned: 0, claimed: [] };
}
export const dayStats = day;

// ---- XP ----
export function addXp(n: number) {
  if (n <= 0) return;
  const s = getState();
  const k = dateKey();
  const before = levelOf(s.xp);
  update({ xp: s.xp + n, xpByDate: { ...s.xpByDate, [k]: (s.xpByDate[k] ?? 0) + n } });
  const after = levelOf(getState().xp);
  if (after > before) {
    toast('升', `Level ${after}`, `You are now a ${titleOf(after)[1]} ${titleOf(after)[0]}`);
  }
  session.xp += n;
}

// ---- sessions and combos ----
export interface Session { xp: number; right: number; wrong: number; combo: number; best: number }
const blank = (): Session => ({ xp: 0, right: 0, wrong: 0, combo: 0, best: 0 });
let session = blank();
const comboListeners = new Set<() => void>();
export const startSession = () => { session = blank(); comboListeners.forEach((l) => l()); };
export const getSession = () => session;
export const onCombo = (fn: () => void) => (comboListeners.add(fn), () => void comboListeners.delete(fn));

export const comboBonus = (combo: number) => (combo >= 10 ? 5 : combo >= 5 ? 3 : combo >= 3 ? 1 : 0);

// Record one answer. Returns the XP it was worth (0 when wrong).
export function answer(correct: boolean, base: number): number {
  if (!correct) {
    session.wrong++;
    session.combo = 0;
    comboListeners.forEach((l) => l());
    return 0;
  }
  session.right++;
  session.combo++;
  session.best = Math.max(session.best, session.combo);
  const gain = base + comboBonus(session.combo);
  const s = getState();
  const d = day();
  update({
    totals: { ...s.totals, right: s.totals.right + 1, bestCombo: Math.max(s.totals.bestCombo, session.combo) },
    day: { ...d, right: d.right + 1, best: Math.max(d.best, session.combo) },
  });
  addXp(gain);
  navigator.vibrate?.(8);
  comboListeners.forEach((l) => l());
  checkProgress();
  return gain;
}

export function learnedOne() {
  const d = day();
  update({ day: { ...d, learned: d.learned + 1 } });
  addXp(4);
  checkProgress();
}

// Called when a session finishes: a completion bonus, bigger for a clean run.
export function finishSession(kind: 'words' | 'phrases'): number {
  const answered = session.right + session.wrong;
  const clean = answered >= 5 && session.wrong === 0;
  const bonus = (kind === 'words' ? 30 : 20) + (clean ? 20 : 0);
  if (clean) {
    const s = getState();
    update({ totals: { ...s.totals, perfect: s.totals.perfect + 1 } });
  }
  addXp(bonus);
  checkProgress();
  return bonus;
}

// ---- daily quests ----
interface QuestDef { id: string; title: string; goal: number; xp: number; progress: (s: State, d: State['day'], today: string) => number }
const QUESTS: QuestDef[] = [
  { id: 'words', title: 'Finish word practice', goal: 1, xp: 30, progress: (s, _d, t) => (dayDone(s, t) ? 1 : 0) },
  { id: 'right', title: 'Answer 15 correctly', goal: 15, xp: 25, progress: (_s, d) => d.right },
  { id: 'combo', title: 'Reach a ×6 combo', goal: 6, xp: 30, progress: (_s, d) => d.best },
  { id: 'new', title: 'Learn 5 new items', goal: 5, xp: 25, progress: (_s, d) => d.learned },
  { id: 'play', title: 'Beat today’s game', goal: 1, xp: 30, progress: (s, _d, t) => (s.gamesPlayed[t] ? 1 : 0) },
  { id: 'time', title: 'Study for 10 minutes', goal: 10, xp: 25, progress: (s, _d, t) => Math.floor(s.minutesByDate[t] ?? 0) },
];
// whole local days since 1970, so rotations change at local midnight, not at UTC midnight
const dayNumber = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);

// Word practice every day, plus two others that rotate so the day never looks the same twice.
export function todaysQuests(s = getState()) {
  const n = dayNumber();
  const rest = QUESTS.slice(1);
  const picks = [QUESTS[0], rest[n % rest.length], rest[(n + 2) % rest.length]];
  const t = dateKey();
  const d = day();
  return picks.map((q) => {
    const value = Math.min(q.goal, q.progress(s, d, t));
    return { ...q, value, done: value >= q.goal, claimed: d.claimed.includes(q.id) };
  });
}

function claimQuests() {
  for (const q of todaysQuests()) {
    if (!q.done || q.claimed) continue;
    const d = day();
    const s = getState();
    update({ day: { ...d, claimed: [...d.claimed, q.id] }, totals: { ...s.totals, quests: s.totals.quests + 1 } });
    addXp(q.xp);
    toast('任', 'Quest complete', `${q.title}  ·  +${q.xp} XP`);
  }
}

// ---- badges ----
interface Ctx { s: State; mastered: number; streak: number; level: number }
export interface BadgeDef { id: string; glyph: string; title: string; desc: string; test: (c: Ctx) => boolean }
export const BADGES: BadgeDef[] = [
  { id: 'm1', glyph: '一', title: 'First word', desc: 'Master your first word', test: (c) => c.mastered >= 1 },
  { id: 'm10', glyph: '十', title: 'Ten words', desc: 'Master 10 words', test: (c) => c.mastered >= 10 },
  { id: 'm50', glyph: '五', title: 'Fifty words', desc: 'Master 50 words', test: (c) => c.mastered >= 50 },
  { id: 'm100', glyph: '百', title: 'Hundred words', desc: 'Master 100 words', test: (c) => c.mastered >= 100 },
  { id: 's3', glyph: '火', title: 'On a roll', desc: 'A 3-day streak', test: (c) => c.streak >= 3 },
  { id: 's7', glyph: '周', title: 'Full week', desc: 'A 7-day streak', test: (c) => c.streak >= 7 },
  { id: 's14', glyph: '双', title: 'Fortnight', desc: 'A 14-day streak', test: (c) => c.streak >= 14 },
  { id: 's30', glyph: '月', title: 'Month of Mandarin', desc: 'A 30-day streak', test: (c) => c.streak >= 30 },
  { id: 'c10', glyph: '连', title: 'Combo ×10', desc: '10 right answers in a row', test: (c) => c.s.totals.bestCombo >= 10 },
  { id: 'a100', glyph: '百', title: 'Century', desc: '100 correct answers', test: (c) => c.s.totals.right >= 100 },
  { id: 'a500', glyph: '千', title: 'Five hundred', desc: '500 correct answers', test: (c) => c.s.totals.right >= 500 },
  { id: 'p1', glyph: '满', title: 'Flawless', desc: 'Finish a session with no mistakes', test: (c) => c.s.totals.perfect >= 1 },
  { id: 'q10', glyph: '任', title: 'Questing', desc: 'Complete 10 daily quests', test: (c) => c.s.totals.quests >= 10 },
  { id: 'g1', glyph: '玩', title: 'Player one', desc: 'Win your first game', test: (c) => (c.s.totals.games ?? 0) >= 1 },
  { id: 'g10', glyph: '赢', title: 'Game on', desc: 'Win 10 games', test: (c) => (c.s.totals.games ?? 0) >= 10 },
  { id: 'l5', glyph: '五', title: 'Level 5', desc: 'Reach level 5', test: (c) => c.level >= 5 },
  { id: 'l10', glyph: '十', title: 'Level 10', desc: 'Reach level 10', test: (c) => c.level >= 10 },
];

let checking = false;
// Look for anything newly earned: quests, badges, a streak freeze. Safe to call often.
export function checkProgress() {
  if (checking) return; // addXp below can level up and call back in
  checking = true;
  try {
    for (let guard = 0; guard < 5; guard++) {
      const before = JSON.stringify([getState().badges, getState().day.claimed, getState().freezes]);
      claimQuests();
      const s = getState();
      const streak = streakOf(s);
      const ctx: Ctx = { s, mastered: getWords().filter((w) => w.mastered).length, streak, level: levelOf(s.xp) };
      for (const b of BADGES) {
        if (getState().badges[b.id] || !b.test(ctx)) continue;
        update({ badges: { ...getState().badges, [b.id]: dateKey() } });
        toast(b.glyph, `Badge: ${b.title}`, b.desc + '  ·  +20 XP');
        addXp(20);
      }
      const t = dateKey();
      if (streak > 0 && streak % 7 === 0 && dayDone(getState(), t) && getState().freezeGiven !== t && getState().freezes < MAX_FREEZES) {
        update({ freezes: getState().freezes + 1, freezeGiven: t });
        toast('冰', 'Streak freeze earned', `${streak} days in a row. A freeze saves your streak if you miss a day.`);
      }
      if (JSON.stringify([getState().badges, getState().day.claimed, getState().freezes]) === before) break;
    }
  } finally {
    checking = false;
  }
}

// ---- streak freezes ----
export const MAX_FREEZES = 2;

// On opening the app: if the last few days were missed after a streak, spend freezes to cover them.
export function applyFreezes() {
  const s = getState();
  if (s.freezes <= 0) return;
  const missed: string[] = [];
  let k = addDays(dateKey(), -1);
  for (let i = 0; i < MAX_FREEZES + 1; i++, k = addDays(k, -1)) {
    if (dayKept(s, k)) {
      if (missed.length && missed.length <= s.freezes && Object.keys(s.vocabDone).length) {
        const frozen = { ...s.frozen };
        missed.forEach((m) => (frozen[m] = true));
        update({ frozen, freezes: s.freezes - missed.length });
        toast('冰', 'Streak freeze used', `${missed.length === 1 ? 'A missed day was' : `${missed.length} missed days were`} covered. Your streak is safe.`);
      }
      return;
    }
    missed.push(k);
  }
}

export const xpToday = () => getState().xpByDate[dateKey()] ?? 0;

// ---- daily games ----
export const GAMES = [
  { id: 'match', glyph: '配', title: 'Memory Match', blurb: 'Flip cards to pair each Chinese word with its meaning.' },
  { id: 'listen', glyph: '听', title: 'Sound Match', blurb: 'Hear a word, then tap the right characters.' },
  { id: 'tones', glyph: '调', title: 'Tone Sprint', blurb: 'See a character, name its tone. Twelve in a row to win.' },
  { id: 'gap', glyph: '缺', title: 'Missing Piece', blurb: 'A sentence with a hole in it. Pick the piece that fits.' },
  { id: 'sprint', glyph: '句', title: 'Sentence Sprint', blurb: 'Rebuild sentences against the clock.' },
  { id: 'echo', glyph: '回', title: 'Echo Chain', blurb: 'Watch the words light up, then repeat the order from memory.' },
  { id: 'typer', glyph: '打', title: 'Pinyin Typer', blurb: 'See the character and type its pinyin. Tone numbers work.' },
  { id: 'odd', glyph: '异', title: 'Odd One Out', blurb: 'Three words share a theme. Spot the one that does not belong.' },
  { id: 'thread', glyph: '同', title: 'Common Thread', blurb: 'Words that share a character. Name the one they have in common.' },
  { id: 'hunt', glyph: '找', title: 'Word Hunt', blurb: 'Find hidden words in a grid of characters before time runs out.' },
] as const;
export type GameId = (typeof GAMES)[number]['id'];
// A different game each day, in a fixed cycle
export const gameOfToday = () => GAMES[dayNumber() % GAMES.length];
export const DAILY_GAME_XP = 40;

// A game ends with 0 to 3 stars (0 = lost). Winning gives XP by stars; beating today's game for the first time adds a bonus.
export function finishGame(id: GameId, stars: number, score: number) {
  const s = getState();
  const t = dateKey();
  const won = stars > 0;
  const daily = won && id === gameOfToday().id && !s.gamesPlayed[t];
  const best = score > (s.gameBest[id] ?? 0);
  const xp = (won ? 10 + stars * 10 : 5) + (daily ? DAILY_GAME_XP : 0);
  update({
    gamesPlayed: daily ? { ...s.gamesPlayed, [t]: true } : s.gamesPlayed,
    gameBest: best ? { ...s.gameBest, [id]: score } : s.gameBest,
    totals: { ...s.totals, games: (s.totals.games ?? 0) + (won ? 1 : 0) },
  });
  addXp(xp);
  checkProgress();
  return { xp, daily, best };
}
