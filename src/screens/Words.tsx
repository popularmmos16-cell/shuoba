import { useState } from 'preact/hooks';
import { Pinyin } from '../components/Pinyin';
import { IconClose, IconPlay, IconSound } from '../components/Icons';
import { speakZh } from '../speak';
import { dateKey } from '../store';
import { MASTER_AT, WORDS, type WordRow } from '../vocab';
import type { Phrase } from '../phrases';

export type Status = 'mastered' | 'due' | 'learning';
export interface Entry { row: WordRow; word: Phrase; status: Status }

const RANK: Record<Status, number> = { due: 0, learning: 1, mastered: 2 };
const BY_ID = new Map(WORDS.map((w) => [w.id, w]));

// Every word you have started, with where it stands today: due (waiting for you), learning, or mastered.
export function entriesOf(rows: WordRow[], today = dateKey()): Entry[] {
  return rows
    .map((row): Entry | null => {
      const word = BY_ID.get(row.id);
      if (!word) return null;
      const status: Status = row.mastered ? 'mastered' : row.due <= today && row.introduced !== today ? 'due' : 'learning';
      return { row, word, status };
    })
    .filter((e): e is Entry => !!e)
    .sort((a, b) => RANK[a.status] - RANK[b.status] || (a.row.introduced < b.row.introduced ? -1 : a.row.introduced > b.row.introduced ? 1 : 0));
}

const sizeOf = (h: string) => ([...h].length > 3 ? 'xs' : [...h].length > 2 ? 'sm' : '');

function Pips({ streak, mastered }: { streak: number; mastered: boolean }) {
  return (
    <span class="pips" aria-hidden="true">
      {Array.from({ length: MASTER_AT }, (_, i) => <i class={mastered || i < streak ? 'on' : ''} />)}
    </span>
  );
}

export function WordTile({ e, onOpen }: { e: Entry; onOpen: (e: Entry) => void }) {
  return (
    <button class={`wt ${e.status}`} onClick={() => onOpen(e)} aria-label={`${e.word.hanzi}, ${e.word.en}, ${e.status}`}>
      <span class={`wt-hz ${sizeOf(e.word.hanzi)}`}>{e.word.hanzi}</span>
      <Pips streak={e.row.streak} mastered={e.row.mastered} />
    </button>
  );
}

const STATUS_TEXT: Record<Status, string> = { mastered: 'Mastered', due: 'Due today', learning: 'Learning' };

export function WordDetail({ e, onClose }: { e: Entry; onClose: () => void }) {
  const { word, row, status } = e;
  return (
    <div class="sheet-back" onClick={onClose}>
      <div class="sheet" role="dialog" aria-label={word.hanzi} onClick={(ev) => ev.stopPropagation()}>
        <div class="grab" />
        <div class={`hanzi xl ${status === 'mastered' ? 'stamp' : ''}`}>{word.hanzi}</div>
        <Pinyin text={word.py} />
        <p class="en big">{word.en}</p>
        <div class="sheet-meta">
          <span class={`badge ${status}`}>{STATUS_TEXT[status]}</span>
          <Pips streak={row.streak} mastered={row.mastered} />
          {row.misses > 0 && <small>{row.misses} {row.misses === 1 ? 'miss' : 'misses'}</small>}
        </div>
        <button class="cta solid" onClick={() => speakZh(word.hanzi)}><IconSound /> Hear it</button>
        <button class="ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

type Filter = 'all' | Status;
const FILTERS: [Filter, string][] = [['all', 'All'], ['due', 'Due'], ['learning', 'Learning'], ['mastered', 'Mastered']];

// The whole sheet: every word you have met, as tiles or as a list you can cover and test yourself on.
export function Words({ rows, onClose, onDrill }: { rows: WordRow[]; onClose: () => void; onDrill: (mode: 'calm' | 'blitz') => void }) {
  const all = entriesOf(rows);
  const [filter, setFilter] = useState<Filter>('all');
  const [list, setList] = useState(true);
  const [cover, setCover] = useState(false);
  const [open, setOpen] = useState<Entry | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const shown = all.filter((e) => filter === 'all' || e.status === filter);
  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((e) => e.status === f).length);
  const reveal = (id: string) => setSeen((s) => new Set(s).add(id));

  return (
    <div class="learn words-screen">
      <header class="learn-top">
        <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        <h1 class="screen-title">My words</h1>
        <div class="viewtoggle" role="group" aria-label="View">
          <button class={list ? 'on' : ''} onClick={() => setList(true)}>List</button>
          <button class={!list ? 'on' : ''} onClick={() => setList(false)}>Wall</button>
        </div>
      </header>

      <div class="filters">
        {FILTERS.map(([f, label]) => (
          <button class={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{label} <small>{count(f)}</small></button>
        ))}
      </div>

      {list && all.length > 0 && (
        <button class={`cover-toggle ${cover ? 'on' : ''}`} role="switch" aria-checked={cover} onClick={() => { setCover(!cover); setSeen(new Set()); }}>
          <span>Cover the answers <small>Test yourself. Tap a row to reveal it.</small></span>
          <span class="switch"><i /></span>
        </button>
      )}

      <div class="words-body">
        {all.length === 0 ? (
          <div class="card empty"><b>Nothing here yet</b><p>Finish today’s word practice and your first words land here.</p></div>
        ) : shown.length === 0 ? (
          <div class="card empty"><b>No words in this group</b><p>Nice and clear.</p></div>
        ) : list ? (
          <div class="card plist wlist">
            {shown.map((e) => {
              const hidden = cover && !seen.has(e.word.id);
              return (
                <div class="wrow" role="button" tabIndex={0} onClick={() => (hidden ? reveal(e.word.id) : setOpen(e))} onKeyDown={(k) => k.key === 'Enter' && (hidden ? reveal(e.word.id) : setOpen(e))}>
                  <span class={`wr-hz ${e.status}`}>{e.word.hanzi}</span>
                  <span class={`wr-text ${hidden ? 'covered' : ''}`}>
                    <Pinyin text={e.word.py} />
                    <small>{e.word.en}</small>
                  </span>
                  <Pips streak={e.row.streak} mastered={e.row.mastered} />
                  <button class="wr-play" aria-label={`Play ${e.word.hanzi}`} onClick={(ev) => { ev.stopPropagation(); speakZh(e.word.hanzi); }}><IconSound /></button>
                </div>
              );
            })}
          </div>
        ) : (
          <div class="wall">{shown.map((e) => <WordTile e={e} onOpen={setOpen} />)}</div>
        )}
      </div>

      {all.length > 0 && (
        <div class="dock">
          <button class="cta solid" onClick={() => onDrill('calm')}><IconPlay /> Drill these words</button>
          <button class="dock-blitz" onClick={() => onDrill('blitz')} aria-label="Blitz, 60 seconds">⚡ 60s</button>
        </div>
      )}
      {open && <WordDetail e={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// The front-and-centre card on Home: the words still in play as a wall of tiles, plus the drill buttons.
export function WordSheetCard({ rows, total, best, onAll, onDrill }: { rows: WordRow[]; total: number; best?: number; onAll: () => void; onDrill: (mode: 'calm' | 'blitz') => void }) {
  const all = entriesOf(rows);
  const [open, setOpen] = useState<Entry | null>(null);
  const active = all.filter((e) => e.status !== 'mastered');
  const mastered = all.length - active.length;
  const due = all.filter((e) => e.status === 'due').length;
  return (
    <section class="card sheetcard">
      <div class="sc-head">
        <div>
          <b class="sc-title">Your words</b>
          <small>{all.length === 0 ? 'They appear here as you learn them' : `${active.length} learning · ${mastered} mastered`}</small>
        </div>
        {due > 0 && <span class="due-chip">{due} due</span>}
        <button class="sc-all" onClick={onAll}>See all</button>
      </div>
      <div class="bar thin"><i style={{ width: `${Math.max(all.length ? 2 : 0, (mastered / Math.max(total, 1)) * 100)}%` }} /></div>

      {active.length > 0 ? (
        <div class="wall">{active.map((e) => <WordTile e={e} onOpen={setOpen} />)}</div>
      ) : (
        <p class="sc-empty">{all.length === 0 ? 'Finish today’s word practice and your first tiles show up here.' : 'Every word so far is mastered. New ones arrive tomorrow.'}</p>
      )}
      {mastered > 0 && active.length > 0 && <button class="sc-more" onClick={onAll}>+ {mastered} mastered</button>}

      <div class="sc-actions">
        <button class="cta solid" disabled={all.length === 0} onClick={() => onDrill('calm')}><IconPlay /> Drill my words</button>
        <button class="blitz" disabled={all.length === 0} onClick={() => onDrill('blitz')}>
          <span>⚡ Blitz</span>
          <small>{best ? `best ${best}` : '60 seconds'}</small>
        </button>
      </div>
      {open && <WordDetail e={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
