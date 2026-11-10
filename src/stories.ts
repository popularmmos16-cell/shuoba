import data from './data/stories.json';
import { WORDS, type WordRow } from './vocab';
import type { Phrase } from './phrases';

// Graded stories, built by tools/build-stories.py. Segmentation and pinyin are done at build time.
export interface Token {
  t: string; // as written, punctuation included
  py: string; // space-separated syllables ('' for bare punctuation)
  id?: string; // id of the taught word this is
  f?: 1; // a grammar word that is not taught as vocabulary: always counts as known
  g?: string; // meaning, for grammar words and words outside the curriculum
}
export interface Sentence { zh: string; en: string; py: string; tokens: Token[]; src?: { id: number; by: string } } // src: a Tatoeba sentence
export interface Story { id: string; kind: 'story' | 'set'; title: string; titleEn: string; sentences: Sentence[] }

export const STORIES = data as Story[];
export const WORD_BY_ID = new Map<string, Phrase>(WORDS.map((w) => [w.id, w]));

// known: you have started the word (or it is a grammar word); new: taught later, can be added now; outside: not taught at all
export type TokenState = 'known' | 'new' | 'outside' | 'plain';
export const tokenState = (tok: Token, started: Set<string>): TokenState =>
  !tok.py ? 'plain' : tok.f || (tok.id && started.has(tok.id)) ? 'known' : tok.id ? 'new' : 'outside';

export const startedIds = (rows: WordRow[]) => new Set(rows.map((r) => r.id));

export interface Coverage { pct: number; words: number; known: number; newIds: string[]; outside: number }

// How much of a story you already know, counted per word occurrence (so a repeated known word helps).
export function coverage(story: Story, started: Set<string>): Coverage {
  let words = 0, known = 0, outside = 0;
  const newIds = new Set<string>();
  for (const s of story.sentences)
    for (const tok of s.tokens) {
      const st = tokenState(tok, started);
      if (st === 'plain') continue;
      words++;
      if (st === 'known') known++;
      else if (st === 'new') newIds.add(tok.id!);
      else outside++;
    }
  return { pct: words ? Math.round((known / words) * 100) : 0, words, known, newIds: [...newIds], outside };
}

export const sentenceClip = (story: Story, n: number) => `./audio/s/${story.id}-${n + 1}.m4a`;
