import { coverage, startedIds, STORIES, type Story } from '../stories';
import { useStore } from '../store';
import type { WordRow } from '../vocab';

// The story library, easiest first: stories are sorted by how much of each one you already know.
export function Read({ rows, onOpen }: { rows: WordRow[]; onOpen: (s: Story) => void }) {
  const s = useStore();
  const started = startedIds(rows);
  const list = STORIES.map((st) => ({ st, cov: coverage(st, started), read: !!s.storiesRead?.[st.id] })).sort(
    (a, b) => Number(a.read) - Number(b.read) || b.cov.pct - a.cov.pct,
  );
  const card = ({ st, cov, read }: (typeof list)[number], n: number) => (
    <button class="card mode rise" style={`--i:${Math.min(n + 2, 8)}`} onClick={() => onOpen(st)}>
      <span class={`cov ${cov.pct >= 90 ? 'hi' : cov.pct >= 70 ? 'mid' : ''}`}>{cov.pct}%</span>
      <span class="mode-text">
        <b>{st.title}</b>
        <small>{st.titleEn} · {cov.newIds.length === 0 ? 'no new words' : `${cov.newIds.length} new ${cov.newIds.length === 1 ? 'word' : 'words'}`}</small>
      </span>
      <span class="time">{read ? 'Read ✓' : `${st.sentences.length} lines`}</span>
    </button>
  );
  const stories = list.filter((x) => x.st.kind === 'story');
  const sets = list.filter((x) => x.st.kind === 'set');
  return (
    <main class="screen">
      <h1 class="page-title rise" style="--i:0">Read</h1>
      <p class="intro rise" style="--i:1">
        Short stories built from the words in this app. Each shows how much of it you already know. Tap any word for its meaning, and add
        new ones to your words as you meet them.
      </p>
      {rows.length === 0 && <p class="intro rise" style="--i:1">Finish your first words on Today, then stories will start to make sense.</p>}
      {stories.length > 0 && <h2 class="rise" style="--i:2">Stories</h2>}
      {stories.map(card)}
      {sets.length > 0 && <h2 class="rise" style="--i:3">Reading sets</h2>}
      {sets.length > 0 && <p class="intro rise" style="--i:3">Short everyday sentences from Tatoeba. Each set sticks to words you have been taught.</p>}
      {sets.map(card)}
      <p class="muted rise" style="--i:8">The percentage is how many of the story’s words you have already started learning.</p>
    </main>
  );
}
