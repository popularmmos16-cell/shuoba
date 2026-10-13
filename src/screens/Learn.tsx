import { useEffect, useRef, useState } from 'preact/hooks';
import { PHRASE_BY_ID, pieces } from '../phrases';
import { Pinyin } from '../components/Pinyin';
import { AnswerBar, Bank, useAssemble } from '../components/Assemble';
import { IconClose, IconSound, IconCheck } from '../components/Icons';
import { speakZh } from '../speak';
import { addStudy, dateKey, update, useStore } from '../store';
import { saveCards, useCards, type CardRow } from '../db';
import { buildQueue, gradeFor, makeCard, newAllowanceToday, newRows, nextLabel, rate, unseenPhrases, type Item } from '../srs';

const REQUEUE_WITHIN_MIN = 20; // a card due again soon comes back later in this same session
const TEACH_BATCH = 3; // teach this many new phrases, then test them straight away

interface Result { correct: boolean; label: string }

const TOUR = [
  ['Learn', 'See a new phrase in pieces, with pinyin and meaning. Tap the speaker to hear it.'],
  ['Practise', 'Answer a quick question about it. You’ll be told straight away if you’re right.'],
  ['Come back', 'Phrases you find hard return sooner. Easy ones return days later, just before you’d forget.'],
];

function Tour({ onGo }: { onGo: () => void }) {
  return (
    <div class="finish rise tour">
      <h1>How a session works</h1>
      <ol>
        {TOUR.map(([title, text], n) => (
          <li>
            <span class="num">{n + 1}</span>
            <span><b>{title}</b><br /><small>{text}</small></span>
          </li>
        ))}
      </ol>
      <button class="cta solid" onClick={onGo}>Let’s go</button>
    </div>
  );
}

export function Learn({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const { cards, loaded } = useCards();
  const [queue, setQueue] = useState<Item[] | null>(null);
  const [introTotal, setIntroTotal] = useState(0);
  const [introDone, setIntroDone] = useState(0);
  const [done, setDone] = useState(0);
  const [stats, setStats] = useState({ reviews: 0, intros: 0 });
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const requeue = useRef<{ next: CardRow; correct: boolean } | null>(null); // what to schedule once Continue is tapped
  const pending = useRef<Item[]>([]); // tests for phrases taught in this batch, queued once the batch is done
  const last = useRef(Date.now());
  const shownAt = useRef(Date.now());

  useEffect(() => {
    if (loaded && queue === null) {
      const q = buildQueue(cards, s.quiet, newAllowanceToday(cards, s.newPerDay));
      setQueue(q);
      setIntroTotal(q.filter((x) => x.kind === 'intro').length);
    }
  }, [loaded]);

  const cur = queue?.[0];
  const phrase = cur ? (cur.kind === 'intro' ? cur.phrase : PHRASE_BY_ID.get(cur.row.phraseId)!) : undefined;
  const isListen = cur?.kind === 'card' && cur.row.kind === 'listen';
  const tiles = cur?.kind === 'card' && cur.ex === 'build' ? cur.tiles! : [];
  const asm = useAssemble(tiles, phrase?.hanzi ?? '');
  const key = cur ? `${cur.kind}-${phrase!.id}-${cur.kind === 'card' ? cur.row.kind + cur.ex : ''}-${queue!.length}-${done}` : '';

  // each new screen: reset, start the timer, and play the audio where the question is a listening one
  useEffect(() => {
    setPicked(null);
    setResult(null);
    asm.reset();
    shownAt.current = Date.now();
    if (cur && phrase && (cur.kind === 'intro' || isListen)) speakZh(phrase.hanzi);
  }, [key]);

  // credit study time on every tap, capped so leaving the phone idle doesn't count
  const tick = () => {
    const now = Date.now();
    addStudy(Math.min(30_000, now - last.current) / 1000);
    last.current = now;
  };

  const advance = (rest: Item[]) => setQueue(rest);

  const learnIt = () => {
    if (cur?.kind !== 'intro') return;
    tick();
    const rows = newRows(cur.phrase);
    saveCards(rows);
    rows.filter((r) => !(s.quiet && r.kind === 'listen')).forEach((row) => pending.current.push(makeCard(row)));
    const n = introDone + 1;
    setIntroDone(n);
    setStats((x) => ({ ...x, intros: x.intros + 1 }));
    setDone((d) => d + 1);
    let rest = queue!.slice(1);
    const lastOfBatch = n % TEACH_BATCH === 0 || !rest.some((x) => x.kind === 'intro');
    if (lastOfBatch) {
      rest = [...pending.current, ...rest]; // test what was just taught before teaching anything else
      pending.current = [];
    }
    advance(rest);
  };

  const finish = (correct: boolean) => {
    if (cur?.kind !== 'card' || result) return;
    tick();
    const seconds = (Date.now() - shownAt.current) / 1000;
    const grade = gradeFor(correct, seconds);
    const { next, log } = rate(cur.row, grade);
    saveCards([next], [log]);
    setResult({ correct, label: nextLabel(cur.row, grade) });
    setStats((x) => ({ ...x, reviews: x.reviews + 1 }));
    // the answer is heard again right after answering, which helps it stick (a listening card was just heard)
    if (!isListen) speakZh(phrase!.hanzi);
    requeue.current = { next, correct };
  };

  const choose = (n: number) => {
    if (cur?.kind !== 'card' || picked !== null) return;
    setPicked(n);
    finish(cur.choices![n].id === phrase!.id);
  };

  const check = () => {
    if (cur?.kind !== 'card' || result || !asm.complete) return;
    const ok = asm.isCorrect();
    asm.lock();
    finish(ok);
  };

  const proceed = () => {
    if (!result || !requeue.current) return;
    tick();
    const { next, correct } = requeue.current;
    requeue.current = null;
    const rest = queue!.slice(1);
    const soon = (next.due.getTime() - Date.now()) / 60_000 <= REQUEUE_WITHIN_MIN;
    if (soon || !correct) rest.splice(Math.min(3, rest.length), 0, makeCard(next, !correct));
    setDone((d) => d + 1);
    advance(rest);
  };

  const keepGoing = () => {
    const q = buildQueue(cards, s.quiet, 5);
    setQueue(q);
    setIntroTotal(q.filter((x) => x.kind === 'intro').length);
    setIntroDone(0);
    pending.current = [];
  };

  const left = (queue?.length ?? 0) + pending.current.length;
  const progress = done + left === 0 ? 1 : done / (done + left);
  const minutes = Math.round(s.minutesByDate[dateKey()] ?? 0);
  const more = unseenPhrases(cards).length;
  const showTour = loaded && queue !== null && queue.length > 0 && !s.tourSeen;

  return (
    <div class="learn">
      <header class="learn-top">
        <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        <div class="bar"><i style={{ width: `${(cur ? progress : 1) * 100}%` }} /></div>
        <small>{left}</small>
      </header>

      {queue === null ? null : showTour ? (
        <Tour onGo={() => update({ tourSeen: true })} />
      ) : !cur ? (
        <div class="finish rise">
          <div class="seal big"><IconCheck /></div>
          <h1>{stats.reviews + stats.intros === 0 ? 'All caught up' : 'Session complete'}</h1>
          <p>
            {stats.reviews + stats.intros === 0
              ? 'Nothing is due right now. Come back later, or learn a few more phrases.'
              : `${stats.intros} new · ${stats.reviews} answered · ${minutes} min today.`}
          </p>
          {more > 0 && <button class="cta solid" onClick={keepGoing}>Learn 5 more phrases</button>}
          <button class={more > 0 ? 'ghost' : 'cta solid'} onClick={onClose}>Back to Today</button>
        </div>
      ) : cur.kind === 'intro' ? (
        <>
          <div class="flash learn-card" key={key}>
            <small class="eyebrow">Learn · {introDone + 1} of {introTotal}</small>
            <div class="pieces">
              {pieces(cur.phrase).map((p) => (
                <div class="piece-card">
                  <div class="hz">{p.text}</div>
                  <Pinyin text={p.py} />
                  {p.gloss && <small>{p.gloss}</small>}
                </div>
              ))}
            </div>
            <p class="en big">{cur.phrase.en}</p>
            {!s.quiet && (
              <button class="round" aria-label="Play audio" onClick={() => speakZh(cur.phrase.hanzi)}><IconSound /></button>
            )}
          </div>
          <p class="coach">Take a look, then tap Got it. You’ll be asked about it in a moment.</p>
          <button class="cta solid" onClick={learnIt}>Got it</button>
        </>
      ) : (
        <>
          <div class="flash q" key={key}>
            <small class="eyebrow">
              {cur.ex === 'build' ? (isListen ? 'Hear it, then build it' : 'Build it in Chinese') : isListen ? 'Listen and choose' : 'What does this mean?'}
            </small>
            {cur.ex === 'build' ? (
              <>
                {isListen ? (
                  <button class="big-play" aria-label="Play audio" onClick={() => speakZh(phrase!.hanzi)}><IconSound /></button>
                ) : (
                  <div class="stem md">{phrase!.en}</div>
                )}
                {!result && <p class="q-prompt sm">{isListen ? 'Tap the pieces in the order you hear them' : 'Tap the Chinese pieces in the right order'}</p>}
                <AnswerBar a={asm} tiles={tiles} result={result ? result.correct : null} />
              </>
            ) : (
              <>
                {isListen ? (
                  <button class="big-play" aria-label="Play audio" onClick={() => speakZh(phrase!.hanzi)}><IconSound /></button>
                ) : (
                  !result && <div class="stem md">{phrase!.hanzi}</div> // the answer box below shows it once answered
                )}
                {!result && <p class="q-prompt sm">{isListen ? 'Tap the meaning of what you hear' : 'Tap the English that matches'}</p>}
              </>
            )}

            {result && (
              <div class={`feedback ${result.correct ? 'good' : 'bad'}`}>
                <b>{result.correct ? 'Correct!' : 'Not quite. Here’s the answer:'}</b>
                <div class="hanzi">{phrase!.hanzi}</div>
                <Pinyin text={phrase!.py} />
                <p class="en">{phrase!.en}</p>
                <small>{result.correct ? `You’ll see this again in ${result.label}.` : 'We’ll ask again in a moment.'}</small>
              </div>
            )}
          </div>

          {cur.ex === 'build' ? (
            <>
              <Bank a={asm} tiles={tiles} />
              {!result ? (
                <button class="cta solid" disabled={!asm.complete} onClick={check}>Check</button>
              ) : (
                <button class="cta solid" onClick={proceed}>Continue</button>
              )}
            </>
          ) : (
            <>
              <div class="opts">
                {cur.choices!.map((c, n) => (
                  <button
                    class={`opt ${picked !== null && c.id === phrase!.id ? 'right' : ''} ${picked === n && c.id !== phrase!.id ? 'wrong' : ''}`}
                    onClick={() => choose(n)}
                  >
                    <b>{c.en}</b>
                  </button>
                ))}
              </div>
              <button class={`cta solid next ${result ? '' : 'hide'}`} disabled={!result} onClick={proceed}>Continue</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
