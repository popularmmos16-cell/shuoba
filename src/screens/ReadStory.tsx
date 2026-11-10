import { useState } from 'preact/hooks';
import { Pinyin } from '../components/Pinyin';
import { IconClose, IconSound } from '../components/Icons';
import { saveWord } from '../db';
import { finishStory } from '../game';
import { speakZh } from '../speak';
import { coverage, startedIds, tokenState, WORD_BY_ID, type Story, type Token } from '../stories';
import { dateKey, useStore } from '../store';
import { MAX_ACTIVE, MASTER_AT, newWordRow, type WordRow } from '../vocab';

const PY_KEY = 'shuoba.read.py';
const readPref = (k: string, d: boolean) => {
  try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; }
};
const writePref = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* ignore */ } };

export function ReadStory({ story, rows, onClose }: { story: Story; rows: WordRow[]; onClose: () => void }) {
  const s = useStore();
  const [py, setPy] = useState(() => readPref(PY_KEY, true));
  const [en, setEn] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<Token | null>(null);
  const started = startedIds(rows);
  const cov = coverage(story, started);
  const active = rows.filter((r) => !r.mastered).length;
  const readToday = s.storiesRead?.[story.id] === dateKey();

  const toggleEn = (n: number) => setEn((cur) => { const next = new Set(cur); next.has(n) ? next.delete(n) : next.add(n); return next; });
  const setPinyin = (v: boolean) => { setPy(v); writePref(PY_KEY, v); };

  return (
    <main class="screen rd">
      <header class="rd-top">
        <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        <div class="rd-head">
          <b>{story.title}</b>
          <small>{story.titleEn}</small>
        </div>
        <span class={`cov ${cov.pct >= 90 ? 'hi' : cov.pct >= 70 ? 'mid' : ''}`}>{cov.pct}%</span>
      </header>
      <div class="rd-opts">
        <button class={`chip ${py ? 'on' : ''}`} onClick={() => setPinyin(!py)}>Pinyin</button>
        <button class={`chip ${en.size === story.sentences.length ? 'on' : ''}`} onClick={() => setEn(en.size === story.sentences.length ? new Set() : new Set(story.sentences.map((_, i) => i)))}>English</button>
        <small>{cov.newIds.length === 0 ? 'No new words' : `${cov.newIds.length} new ${cov.newIds.length === 1 ? 'word' : 'words'} · underlined`}</small>
      </div>

      {story.sentences.map((sen, n) => (
        <section class="rd-s">
          <div class="rd-line">
            {sen.tokens.map((tok) => {
              const st = tokenState(tok, started);
              return st === 'plain' ? (
                <span class="rd-p">{tok.t}</span>
              ) : (
                <button class={`rd-t ${st}`} onClick={() => setOpen(tok)}>
                  {py && <span class="rd-py">{tok.py}</span>}
                  <span class="rd-hz">{tok.t}</span>
                </button>
              );
            })}
          </div>
          <div class="rd-tools">
            <button class="icon-btn" aria-label="Hear this line" onClick={() => speakZh(sen.zh)}><IconSound /></button>
            <button class="ghost-sm" onClick={() => toggleEn(n)}>{en.has(n) ? 'Hide English' : 'English'}</button>
          </div>
          {en.has(n) && <p class="rd-en">{sen.en}{sen.src && <a class="rd-src" href={`https://tatoeba.org/sentences/show/${sen.src.id}`} target="_blank" rel="noopener noreferrer"> Tatoeba #{sen.src.id}</a>}</p>}
        </section>
      ))}

      {story.sentences.some((s) => s.src) && (
        <p class="muted rd-credit">
          Sentences from <a href="https://tatoeba.org" target="_blank" rel="noopener noreferrer">Tatoeba</a> (CC BY 2.0 FR), written by{' '}
          {[...new Set(story.sentences.flatMap((s) => (s.src ? [s.src.by] : [])))].join(', ')}.
        </p>
      )}
      <button class="cta solid" onClick={() => { finishStory(story.id); onClose(); }}>{readToday ? 'Done' : 'Finished reading  ·  +15 XP'}</button>

      {open && (() => {
        const word = open.id ? WORD_BY_ID.get(open.id) : undefined;
        const row = word ? rows.find((r) => r.id === word.id) : undefined;
        const hanzi = word?.hanzi ?? open.t.replace(/[^一-鿿]/g, '');
        const full = !row && active >= MAX_ACTIVE;
        return (
          <div class="sheet-back" onClick={() => setOpen(null)}>
            <div class="sheet" role="dialog" aria-label={hanzi} onClick={(e) => e.stopPropagation()}>
              <div class="grab" />
              <div class="hanzi xl">{hanzi}</div>
              <Pinyin text={word?.py ?? open.py} />
              <p class="en big">{word?.en ?? (open.g || 'Meaning not available')}</p>
              {row && <div class="sheet-meta"><span class={`badge ${row.mastered ? 'mastered' : 'learning'}`}>{row.mastered ? 'Mastered' : 'Learning'}</span><span class="pips">{Array.from({ length: MASTER_AT }, (_, i) => <i class={row.mastered || i < row.streak ? 'on' : ''} />)}</span></div>}
              {open.f && <p class="muted">A common grammar word. It counts as known.</p>}
              {!word && !open.f && <p class="muted">This word is not in your lessons yet.</p>}
              <button class="cta solid" onClick={() => speakZh(hanzi)}><IconSound /> Hear it</button>
              {word && !row && (
                <button class="cta solid add" disabled={full} onClick={() => { void saveWord(newWordRow(word.id, dateKey())); setOpen(null); }}>
                  {full ? `${MAX_ACTIVE} words in progress. Master some first` : 'Add to my words'}
                </button>
              )}
              <button class="ghost" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
