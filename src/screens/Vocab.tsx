import { useEffect, useRef, useState } from 'preact/hooks';
import { Pinyin } from '../components/Pinyin';
import { IconClose, IconSound, IconCheck } from '../components/Icons';
import { speakZh } from '../speak';
import { addStudy, dateKey, markVocabDone, useStore } from '../store';
import { saveWord } from '../db';
import { useVocabPlan } from '../useVocab';
import { applyFirstAnswer, buildQueue, isPick, makeTest, newWordRow, type QType, type VItem } from '../vocab';
import { Confetti, ComboChip, Reward } from '../components/Game';
import { answer, finishSession, learnedOne, startSession } from '../game';
import { checkEnglish, checkPinyin, parseTarget } from '../typing';

interface Feedback { correct: boolean; reason?: 'letters' | 'tones'; english: boolean; overridden: boolean }

const QUESTION: Record<QType, { eyebrow: string; prompt: string }> = {
  'hanzi-en-pick': { eyebrow: 'What does this mean?', prompt: 'Tap the English that matches' },
  'en-hanzi-pick': { eyebrow: 'Which one is it?', prompt: 'Tap the Chinese that matches' },
  'audio-en-pick': { eyebrow: 'Listen and choose', prompt: 'Tap the meaning of what you hear' },
  'hanzi-en': { eyebrow: 'Type the meaning', prompt: 'Type the English meaning' },
  'hanzi-pinyin': { eyebrow: 'Type the pinyin', prompt: 'Add the tone number after each syllable, like ni3 hao3' },
  'en-pinyin': { eyebrow: 'How do you say it?', prompt: 'Type the pinyin with tone numbers, like ni3 hao3' },
  'audio-pinyin': { eyebrow: 'What did you hear?', prompt: 'Type the pinyin with tone numbers, like ni3 hao3' },
};

const isAudio = (q: QType) => q.startsWith('audio');
const showsHanzi = (q: QType) => q === 'hanzi-en-pick' || q === 'hanzi-en' || q === 'hanzi-pinyin';
const sizeOf = (hanzi: string) => (hanzi.length > 3 ? 'sm' : hanzi.length > 2 ? 'lg' : 'xl');

export function Vocab({ onClose, onContinue }: { onClose: () => void; onContinue?: () => void }) {
  const s = useStore();
  const { plan, loaded, rows } = useVocabPlan();
  const [queue, setQueue] = useState<VItem[] | null>(null);
  const [text, setText] = useState('');
  const [fb, setFb] = useState<Feedback | null>(null);
  const [stats, setStats] = useState({ right: 0, wrong: 0 });
  const [picked, setPicked] = useState<number | null>(null);
  const [steps, setSteps] = useState(0); // questions finished, retries included
  const [gain, setGain] = useState(0); // XP the last answer earned
  const [bonus, setBonus] = useState(0); // finishing bonus
  useEffect(startSession, []);
  const answered = useRef(new Set<string>()); // words whose first answer today has been recorded
  const last = useRef(Date.now());
  const input = useRef<HTMLInputElement>(null);
  const today = dateKey();

  useEffect(() => {
    if (loaded && queue === null) {
      const q = buildQueue(plan, rows, s.quiet);
      setQueue(q);
    }
  }, [loaded]);

  const tick = () => {
    const now = Date.now();
    addStudy(Math.min(30_000, now - last.current) / 1000); // idle time doesn't count
    last.current = now;
  };

  const cur = queue?.[0];
  const key = cur ? `${cur.kind}-${cur.word.id}-${cur.kind === 'test' ? cur.q + cur.retry : ''}-${queue!.length}` : '';

  useEffect(() => {
    if (!cur) return;
    if (cur.kind === 'learn' || (cur.kind === 'test' && isAudio(cur.q))) speakZh(cur.word.hanzi);
    if (cur.kind === 'test' && !isPick(cur.q)) setTimeout(() => input.current?.focus(), 50);
  }, [key]);

  const next = (rest: VItem[]) => {
    setText('');
    setFb(null);
    setPicked(null);
    setQueue(rest);
    if (rest.length === 0) {
      markVocabDone(today);
      setBonus(finishSession('words'));
    }
  };

  const check = () => {
    if (cur?.kind !== 'test' || fb || !text.trim()) return;
    tick();
    const english = cur.q === 'hanzi-en';
    let correct: boolean;
    let reason: Feedback['reason'];
    if (english) correct = checkEnglish(text, cur.word.en);
    else {
      const r = checkPinyin(text, parseTarget(cur.word.py));
      correct = r.ok;
      reason = r.ok ? undefined : r.reason;
    }
    setFb({ correct, reason, english, overridden: false });
    setGain(answer(correct, cur.retry ? 3 : isPick(cur.q) ? 8 : 12));
    speakZh(cur.word.hanzi); // hearing it right after answering helps it stick
  };

  const pick = (n: number) => {
    if (cur?.kind !== 'test' || !cur.choices || fb) return;
    tick();
    setPicked(n);
    const correct = cur.choices[n].id === cur.word.id;
    setFb({ correct, english: false, overridden: false });
    setGain(answer(correct, cur.retry ? 3 : 8));
    speakZh(cur.word.hanzi);
  };

  const proceed = () => {
    if (cur?.kind !== 'test' || !fb) return;
    tick();
    const correct = fb.correct || fb.overridden;
    const rest = queue!.slice(1);
    if (!answered.current.has(cur.word.id)) {
      answered.current.add(cur.word.id); // only the first answer of the day decides the schedule
      const row = rows.find((r) => r.id === cur.word.id) ?? newWordRow(cur.word.id, today);
      saveWord(applyFirstAnswer(row, correct, today));
      setStats((x) => ({ right: x.right + (correct ? 1 : 0), wrong: x.wrong + (correct ? 0 : 1) }));
    }
    // A miss gets exactly one more go later in the session, as an easier multiple-choice question of a different
    // kind. That second answer never changes the schedule and is never asked again, so a session always ends.
    if (!correct && !cur.retry) {
      const known = new Set(rows.map((r) => r.id));
      rest.splice(Math.min(4, rest.length), 0, makeTest(cur.word, 0, known, s.quiet, cur.q, true));
    }
    setSteps((n) => n + 1);
    next(rest);
  };

  // keyboard: 1-4 pick an option, Enter moves on
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (cur?.kind !== 'test') return;
      if (fb && e.key === 'Enter') proceed();
      else if (!fb && cur.choices && /^[1-4]$/.test(e.key)) pick(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addDigit = (d: string) => {
    if (fb) return;
    setText((t) => t + d);
    input.current?.focus();
  };

  const learnTotal = useRef(0);
  if (queue && learnTotal.current === 0) learnTotal.current = queue.filter((x) => x.kind === 'learn').length;
  const learnPos = learnTotal.current - (queue?.filter((x) => x.kind === 'learn').length ?? 0) + 1;
  const left = queue?.filter((x) => x.kind === 'test').length ?? 0;
  const progress = steps + left === 0 ? 1 : steps / (steps + left);

  return (
    <div class="learn">
      <header class="learn-top">
        <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        <div class="bar"><i style={{ width: `${(cur ? progress : 1) * 100}%` }} /></div>
        <ComboChip />
        <small>{left}</small>
      </header>

      {queue === null ? null : !cur ? (
        <div class="finish rise">
          {stats.right + stats.wrong > 0 && <Confetti />}
          <div class="seal big"><IconCheck /></div>
          <h1>{stats.right + stats.wrong === 0 ? 'No words due' : 'Words done'}</h1>
          <p>
            {stats.right + stats.wrong === 0
              ? 'Nothing to type right now. Today’s word practice is complete.'
              : `${stats.right} right first time${stats.wrong ? `, ${stats.wrong} to try again tomorrow` : ''}. Word practice for today is complete.`}
          </p>
          {stats.right + stats.wrong > 0 && <Reward bonus={bonus} />}
          {onContinue && <button class="cta solid" onClick={onContinue}>Continue to phrases</button>}
          <button class={onContinue ? 'ghost' : 'cta solid'} onClick={onClose}>Back to Today</button>
        </div>
      ) : cur.kind === 'learn' ? (
        <>
          <div class="flash" key={key}>
            <small class="eyebrow">New word · {learnPos} of {learnTotal.current}</small>
            <div class="reveal">
              <div class="hanzi xl">{cur.word.hanzi}</div>
              <Pinyin text={cur.word.py} />
              <p class="en">{cur.word.en}</p>
              {!s.quiet && (
                <button class="round" aria-label="Play audio" onClick={() => speakZh(cur.word.hanzi)}><IconSound /></button>
              )}
            </div>
          </div>
          <button class="cta solid" onClick={() => { tick(); learnedOne(); next(queue.slice(1)); }}>Got it, test me</button>
        </>
      ) : (
        <>
          <div class="flash q" key={key}>
            <small class="eyebrow">{QUESTION[cur.q].eyebrow}{cur.retry ? ' · again' : ''}</small>
            {isAudio(cur.q) ? (
              <button class="big-play" aria-label="Play audio" onClick={() => speakZh(cur.word.hanzi)}><IconSound /></button>
            ) : showsHanzi(cur.q) ? (
              <div class={`stem ${sizeOf(cur.word.hanzi)}`}>{cur.word.hanzi}</div>
            ) : (
              <div class="stem md">{cur.word.en}</div>
            )}
            {!fb && <p class="q-prompt sm">{QUESTION[cur.q].prompt}</p>}

            {fb && (
              <div class={`feedback ${fb.correct || fb.overridden ? 'good' : 'bad'}`}>
                <b>
                  {fb.correct || fb.overridden
                    ? 'Correct!'
                    : fb.reason === 'tones'
                      ? 'Right sounds, wrong tone'
                      : 'Not quite'}
                  {(fb.correct || fb.overridden) && gain > 0 && <span class="gain"> +{gain} XP</span>}
                </b>
                {!(showsHanzi(cur.q) && !isAudio(cur.q)) && <div class="hanzi">{cur.word.hanzi}</div>}
                <Pinyin text={cur.word.py} />
                {cur.q !== 'en-hanzi-pick' && cur.q !== 'en-pinyin' && <p class="en">{cur.word.en}</p>}
                {!fb.correct && !fb.overridden && !isPick(cur.q) && <small>You typed: {text}</small>}
              </div>
            )}
          </div>

          {isPick(cur.q) ? (
            <>
              <div class={`opts ${cur.q === 'en-hanzi-pick' ? 'two' : ''}`}>
                {cur.choices!.map((c, n) => (
                  <button
                    class={`opt ${fb && c.id === cur.word.id ? 'right' : ''} ${picked === n && c.id !== cur.word.id ? 'wrong' : ''}`}
                    disabled={!!fb && picked !== n && c.id !== cur.word.id}
                    onClick={() => pick(n)}
                  >
                    {cur.q === 'en-hanzi-pick' ? <b class="hz">{c.hanzi}</b> : <b>{c.en}</b>}
                    {fb && cur.q === 'en-hanzi-pick' && <Pinyin text={c.py} />}
                  </button>
                ))}
              </div>
              <button class={`cta solid next ${fb ? '' : 'hide'}`} disabled={!fb} onClick={proceed}>Continue</button>
            </>
          ) : !fb ? (
            <div class="typebox">
              <input
                ref={(el) => {
                  input.current = el;
                  // set as attributes: Preact treats autocorrect as a boolean property, which turns "off" into on
                  el?.setAttribute('autocorrect', 'off');
                  el?.setAttribute('autocapitalize', 'off');
                }}
                value={text}
                onInput={(e) => setText((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === 'Enter' && check()}
                placeholder={cur.q === 'hanzi-en' ? 'English meaning' : 'pinyin, e.g. ni3 hao3'}
                autocomplete="off"
                spellcheck={false}
                enterkeyhint="done"
                aria-label="Your answer"
              />
              {cur.q !== 'hanzi-en' && (
                <div class="tonerow">
                  {['1', '2', '3', '4', '5'].map((d) => (
                    <button class={`tone t${d}`} onClick={() => addDigit(d)} aria-label={`tone ${d}`}>{d}</button>
                  ))}
                </div>
              )}
              <button class="cta solid" disabled={!text.trim()} onClick={check}>Check</button>
            </div>
          ) : (
            <div class="typebox">
              {fb.english && !fb.correct && !fb.overridden && (
                <button class="ghost" onClick={() => { setFb({ ...fb, overridden: true }); setGain(answer(true, cur.retry ? 3 : 12)); }}>My answer was fine</button>
              )}
              <button class="cta solid" onClick={proceed}>Continue</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
