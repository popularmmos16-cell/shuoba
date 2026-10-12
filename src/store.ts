import { useEffect, useState } from 'preact/hooks';

export interface State {
  goalMin: number;
  minutesByDate: Record<string, number>;
}

const KEY = 'shuoba.state.v1';
const DEFAULT: State = { goalMin: 20, minutesByDate: {} };

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
    return () => void listeners.delete(l);
  }, []);
  return state;
}

export function streakOf(s: State): number {
  const d = new Date();
  if (!s.minutesByDate[dateKey(d)]) d.setDate(d.getDate() - 1); // today not done yet: streak is still alive
  let n = 0;
  while (s.minutesByDate[dateKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
