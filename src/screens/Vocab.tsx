import { useEffect, useRef, useState } from 'preact/hooks';
import { Pinyin } from '../components/Pinyin';
import { IconClose, IconSound, IconCheck } from '../components/Icons';
import { speakZh } from '../speak';
import { addStudy, dateKey, markVocabDone, useStore } from '../store';
import { saveWord } from '../db';
import { useVocabPlan } from '../useVocab';
import { applyFirstAnswer, buildQueue, newWordRow, pickType, type VItem } from '../vocab';
import { checkEnglish, checkPinyin, parseTarget } from '../typing';

interface Feedback { correct: boolean; reason?: 'letters' | 'tones'; english: boolean; overridden: boolean }

const QUESTION: Record<string, { eyebrow: string; prompt: string }> = {
  'hanzi-pinyin': { eyebrow: 'Type the pinyin', prompt: 'Add the tone number after each syllable, like ni3 hao3' },
  'en-pinyin': { eyebrow: 'How do you say it?', prompt: 'Type the pinyin with tone numbers, like ni3 hao3' },
  'hanzi-en': { eyebrow: 'Type the meaning', prompt: 'Type the English meaning' },
  'audio-pinyin': { eyebrow: 'What did you hear?', prompt: 'Type the pinyin with tone numbers, like ni3 hao3' },
};

export function Vocab({ onClose, onContinue }: { onClose: () => void; onContinue?: () => void }) {
  const s = useStore();
  const { plan, loaded, rows } = useVocabPlan();
  const [queue, setQueue] = useState<VItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [text, setText] = useState('');
  const [fb, setFb] = useState<Feedback | null>(null);
  const [stats, setStats] = useState({ right: 0, wrong: 0 });
  const answered = useRef(new Set<string>()); // words whose first answer today has been recorded
  const last = useRef(Date.now());
  const input = useRef<HTMLInputElement>(null);
  const today = dateKey();

  useEffect(() => {
    if (loaded && queue === null) {
      const q = buildQueue(plan, s.quiet);
      setQueue(q);
      setTotal(q.filter((x) => x.kind === 'test').length);
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
    if (cur.kind === 'learn' || (cur.kind === 'test' && cur.q === 'audio-pinyin')) speakZh(cur.word.hanzi);
    if (cur.kind === 'test') setTimeout(() => input.current?.focus(), 50);
  }, [key]);

  const next = (rest: VItem[]) => {
    setText('');
    setFb(null);
    setQueue(rest);
    if (rest.length === 0) markVocabDone(today);
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
    speakZh(cur.word.hanzi); // hearing it right after answering helps it stick
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
    if (!correct) rest.splice(Math.min(3, rest.length), 0, { kind: 'test', word: cur.word, q: pickType(cur.word, s.quiet, cur.q), retry: true });
    next(rest);
  };

  const addDigit = (d: string) => {
    if (fb) return;
    setText((t) => t + d);
    input.current?.focus();
  };

  const left = queue?.filter((x) => x.kind === 'test').length ?? 0;
  const progress = total === 0 ? 1 : Math.max(0, Math.min(1, 1 - left / Math.max(total, 1)));

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
          <h1>{stats.right + stats.wrong === 0 ? 'No words due' : 'Words done'}</h1>
          <p>
            {stats.right + stats.wrong === 0
              ? 'Nothing to type right now. Today’s word practice is complete.'
              : `${stats.right} right first time${stats.wrong ? `, ${stats.wrong} to try again tomorrow` : ''}. Word practice for today is complete.`}
          </p>
          {onContinue && <button class="cta solid" onClick={onContinue}>Continue to phrases</button>}
          <button class={onContinue ? 'ghost' : 'cta solid'} onClick={onClose}>Back to Today</button>
        </div>
      ) : cur.kind === 'learn' ? (
        <>
          <div class="flash" key={key}>
            <small class="eyebrow">New word</small>
            <div class="reveal">
              <div class="hanzi xl">{cur.word.hanzi}</div>
              <Pinyin text={cur.word.py} />
              <p class="en">{cur.word.en}</p>
              {!s.quiet && (
                <button class="round" aria-label="Play audio" onClick={() => speakZh(cur.word.hanzi)}><IconSound /></button>
              )}
            </div>
          </div>
          <button class="cta solid" onClick={() => { tick(); next(queue.slice(1)); }}>Got it, test me</button>
        </>
      ) : (
        <>
          <div class="flash q" key={key}>
            <small class="eyebrow">{QUESTION[cur.q].eyebrow}{cur.retry ? ' · again' : ''}</small>
            {cur.q === 'audio-pinyin' ? (
              <button class="big-play" aria-label="Play audio" onClick={() => speakZh(cur.word.hanzi)}><IconSound /></button>
            ) : cur.q === 'en-pinyin' ? (
              <div class="stem md">{cur.word.en}</div>
            ) : (
              <div class="stem xl">{cur.word.hanzi}</div>
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
                </b>
                <div class="hanzi">{cur.word.hanzi}</div>
                <Pinyin text={cur.word.py} />
                <p class="en">{cur.word.en}</p>
                {!fb.correct && !fb.overridden && <small>You typed: {text}</small>}
              </div>
            )}
          </div>

          {!fb ? (
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
                <button class="ghost" onClick={() => setFb({ ...fb, overridden: true })}>My answer was fine</button>
              )}
              <button class="cta solid" onClick={proceed}>Continue</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
