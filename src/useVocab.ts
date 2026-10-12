import { dateKey, markVocabDone, useStore } from './store';
import { useWords } from './db';
import { planToday, remaining, WORDS } from './vocab';

// What today's compulsory word practice looks like, kept in one place for Home, the session flow and Settings.
export function useVocabPlan() {
  const s = useStore();
  const { words, loaded } = useWords();
  const today = dateKey();
  const plan = planToday(words, today, s.typingNew);
  const left = loaded ? remaining(plan) : 0;
  const done = !!s.vocabDone[today];
  const mastered = words.filter((w) => w.mastered).length;
  // nothing due and nothing new to teach (e.g. words are waiting for their next day) still counts as done
  if (loaded && !done && left === 0) markVocabDone(today);
  return { plan, left, done: done || (loaded && left === 0), loaded, mastered, total: WORDS.length, rows: words };
}
