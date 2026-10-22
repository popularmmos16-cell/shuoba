import { useEffect, useState } from 'preact/hooks';

export interface State {
  goalMin: number;
  quiet: boolean;
  newPerDay: number;
  typingNew: number; // new words per day in the typing exercise
  tourSeen?: boolean; // phrase-session walkthrough dismissed
  vocabDone: Record<string, boolean>; // days the compulsory word practice was completed
  lastBackup?: number;
  minutesByDate: Record<string, number>;
  // game layer (see game.ts)
  xp: number;
  xpByDate: Record<string, number>;
  freezes: number; // streak freezes in the bank
  frozen: Record<string, boolean>; // missed days a freeze has covered
  freezeGiven?: string; // day a freeze was last earned
  badges: Record<string, string>; // badge id -> day earned
  totals: { right: number; quests: number; bestCombo: number; perfect: number; games?: number };
  gamesPlayed: Record<string, boolean>; // days today's game was beaten
  gameBest: Record<string, number>; // best score per game
  day: { k: string; right: number; best: number; learned: number; claimed: string[] };
}

const KEY = 'shuoba.state.v1';
const DEFAULT: State = {
  goalMin: 20, quiet: false, newPerDay: 15, typingNew: 7, vocabDone: {}, minutesByDate: {},
  xp: 0, xpByDate: {}, freezes: 0, frozen: {}, badges: {},
  totals: { right: 0, quests: 0, bestCombo: 0, perfect: 0, games: 0 },
  gamesPlayed: {}, gameBest: {},
  day: { k: '', right: 0, best: 0, learned: 0, claimed: [] },
};

export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function load(): State {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT;
  }
}

let state = load();
const listeners = new Set<() => void>();

export function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useStore(): State {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    l(); // pick up any change made between render and subscription
    return () => void listeners.delete(l);
  }, []);
  return state;
}

// A day counts toward the streak once the compulsory word practice is done.
export const dayDone = (s: State, k: string) => !!s.vocabDone[k];
// A day keeps the streak if the words were done, or a streak freeze covered it.
export const dayKept = (s: State, k: string) => dayDone(s, k) || !!s.frozen[k];

let doneHook: ((date: string) => void) | null = null;
export const setDoneHook = (fn: (date: string) => void) => (doneHook = fn);

export function markVocabDone(k = dateKey()) {
  if (!state.vocabDone[k]) {
    update({ vocabDone: { ...state.vocabDone, [k]: true } });
    doneHook?.(k);
  }
}

export function streakOf(s: State): number {
  const d = new Date();
  if (!dayKept(s, dateKey(d))) d.setDate(d.getDate() - 1); // today not done yet: streak is still alive
  let n = 0;
  while (dayKept(s, dateKey(d))) {
    if (dayDone(s, dateKey(d))) n++; // a frozen day holds the streak but does not add to it
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export const isQuiet = () => state.quiet;

export const getState = () => state;

export function replaceState(s: State) {
  state = { ...DEFAULT, ...s };
  update({});
}

// Study time is kept as fractional minutes per day; any studying keeps the streak alive.
export function addStudy(seconds: number) {
  const k = dateKey();
  update({ minutesByDate: { ...state.minutesByDate, [k]: (state.minutesByDate[k] ?? 0) + seconds / 60 } });
}

// Whole minutes for display; anything under a minute reads "<1" instead of a misleading 0.
export const fmtMin = (m: number) => (m > 0 && m < 1 ? '<1' : String(Math.floor(m)));
