import { useEffect, useRef, useState } from 'preact/hooks';
import type { Grade } from 'ts-fsrs';
import { PHRASE_BY_ID } from '../phrases';
import { Pinyin } from '../components/Pinyin';
import { IconClose, IconSound, IconCheck } from '../components/Icons';
import { speakZh } from '../speak';
import { addStudy, dateKey, useStore } from '../store';
import { saveCards, useCards } from '../db';
import { buildQueue, newAllowanceToday, newRows, previews, rate, unseenPhrases, type Item } from '../srs';

const REQUEUE_WITHIN_MIN = 20; // a card due again soon comes back later in this same session

export function Learn({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const { cards, loaded } = useCards();
  const [queue, setQueue] = useState<Item[] | null>(null);
  const [shown, setShown] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ reviews: 0, intros: 0 });
  const last = useRef(Date.now());

  useEffect(() => {
    if (loaded && queue === null) {
      const q = buildQueue(cards, s.quiet, newAllowanceToday(cards, s.newPerDay));
      setQueue(q);
      setTotal(q.length);
    }
  }, [loaded]);

  // credit study time on every tap, capped so leaving the phone idle doesn't count
  const tick = () => {
    const now = Date.now();
    addStudy(Math.min(30_000, now - last.current) / 1000);
    last.current = now;
  };

  const cur = queue?.[0];
  const phrase = cur ? (cur.kind === 'intro' ? cur.phrase : PHRASE_BY_ID.get(cur.row.phraseId)!) : undefined;
  const isListen = cur?.kind === 'card' && cur.row.kind === 'listen';

  useEffect(() => {
    if (cur && phrase && (cur.kind === 'intro' || isListen)) speakZh(phrase.hanzi);
  }, [cur?.kind === 'intro' ? cur.phrase.id : cur?.row.id, queue?.length]);

  const advance = (rest: Item[]) => {
    setShown(false);
    setQueue(rest);
  };

  const reveal = () => {
    if (cur?.kind !== 'card' || shown) return;
    tick();
    setShown(true);
    if (!isListen) speakZh(phrase!.hanzi);
  };

  const learnIt = () => {
    if (cur?.kind !== 'intro') return;
    tick();
    const rows = newRows(cur.phrase);
    saveCards(rows);
    const tests: Item[] = rows.filter((r) => !(s.quiet && r.kind === 'listen')).map((row) => ({ kind: 'card', row }));
    setStats((x) => ({ ...x, intros: x.intros + 1 }));
    setTotal((t) => t + tests.length);
    advance([...queue!.slice(1), ...tests]);
  };

  const answer = (grade: Grade) => {
    if (cur?.kind !== 'card') return;
    tick();
    const { next, log } = rate(cur.row, grade);
    saveCards([next], [log]);
    setStats((x) => ({ ...x, reviews: x.reviews + 1 }));
    const rest = queue!.slice(1);
    const soon = (next.due.getTime() - Date.now()) / 60_000 <= REQUEUE_WITHIN_MIN;
    if (soon) rest.splice(Math.min(3, rest.length), 0, { kind: 'card', row: next });
    else setTotal((t) => t - 1); // finished for this session: keeps the bar honest
    advance(rest);
  };

  const keepGoing = () => {
    const q = buildQueue(cards, s.quiet, 5);
    setQueue(q);
    setTotal(stats.reviews + stats.intros + q.length);
    setShown(false);
  };

  const left = queue?.length ?? 0;
  const progress = total === 0 ? 0 : Math.max(0, Math.min(1, 1 - left / Math.max(total, 1)));
  const minutes = Math.round(s.minutesByDate[dateKey()] ?? 0);
  const more = unseenPhrases(cards).length;

  return (
    <div class="learn">
      <header class="learn-top">
        <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        <div class="bar"><i style={{ width: `${(cur ? progress : 1) * 100}%` }} /></div>
        <small>{left}</small>
      </header>

      {queue === null ? null : !cur ? (
        <div class="finish rise">
          <div class="seal big"><IconCheck /></div>
          <h1>{stats.reviews + stats.intros === 0 ? 'All caught up' : 'Session complete'}</h1>
          <p>
            {stats.reviews + stats.intros === 0
              ? 'Nothing is due right now. Come back later, or learn a few more phrases.'
              : `${stats.intros} new · ${stats.reviews} reviews · ${minutes} min today.`}
          </p>
          {more > 0 && <button class="cta solid" onClick={keepGoing}>Learn 5 more phrases</button>}
          <button class={more > 0 ? 'ghost' : 'cta solid'} onClick={onClose}>Back to Today</button>
        </div>
      ) : (
        <>
          <div class={`flash ${shown ? 'open' : ''}`} key={`${cur.kind}-${phrase!.id}-${left}`} onClick={reveal}>
            <small class="eyebrow">{cur.kind === 'intro' ? 'New phrase' : isListen ? 'Listen' : 'Read it'}</small>

            {cur.kind === 'intro' && (
              <div class="reveal">
                <div class="hanzi xl">{phrase!.hanzi}</div>
                <Pinyin text={phrase!.py} />
                <p class="en">{phrase!.en}</p>
                {!s.quiet && (
                  <button class="round" aria-label="Play audio" onClick={() => speakZh(phrase!.hanzi)}><IconSound /></button>
                )}
              </div>
            )}

            {cur.kind === 'card' && !shown && (
              <>
                {isListen ? (
                  <button class="big-play" aria-label="Play audio" onClick={(e) => { e.stopPropagation(); speakZh(phrase!.hanzi); }}><IconSound /></button>
                ) : (
                  <div class="hanzi xl">{phrase!.hanzi}</div>
                )}
                <p class="tap-hint">{isListen ? 'What does it mean? Tap to reveal' : 'Tap to reveal'}</p>
              </>
            )}

            {cur.kind === 'card' && shown && (
              <div class="reveal">
                <div class="hanzi xl">{phrase!.hanzi}</div>
                <Pinyin text={phrase!.py} />
                <p class="en">{phrase!.en}</p>
                {!s.quiet && (
                  <button class="round" aria-label="Play audio" onClick={(e) => { e.stopPropagation(); speakZh(phrase!.hanzi); }}><IconSound /></button>
                )}
              </div>
            )}
          </div>

          {cur.kind === 'intro' ? (
            <button class="cta solid" onClick={learnIt}>Got it</button>
          ) : !shown ? (
            <button class="cta solid" onClick={reveal}>Show answer</button>
          ) : (
            <div class="grades">
              {previews(cur.row).map((g) => (
                <button class={`g g${g.grade}`} onClick={() => answer(g.grade)}>
                  <b>{g.label}</b>
                  <small>{g.hint}</small>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
