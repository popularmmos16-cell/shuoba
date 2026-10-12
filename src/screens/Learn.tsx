import { useState } from 'preact/hooks';
import { PHRASES } from '../phrases';
import { Pinyin } from '../components/Pinyin';
import { IconClose, IconSound, IconCheck } from '../components/Icons';
import { speakZh } from '../speak';

// Preview of the review UI. It does not schedule or save anything yet (that comes with the FSRS stage).
export function Learn({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const done = i >= PHRASES.length;
  const p = PHRASES[Math.min(i, PHRASES.length - 1)];

  const next = () => {
    setShown(false);
    setI((n) => n + 1);
  };

  return (
    <div class="learn">
      <header class="learn-top">
        <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        <div class="bar"><i style={{ width: `${(Math.min(i, PHRASES.length) / PHRASES.length) * 100}%` }} /></div>
        <small>{Math.min(i, PHRASES.length)}/{PHRASES.length}</small>
      </header>

      {done ? (
        <div class="finish rise">
          <div class="seal big"><IconCheck /></div>
          <h1>Preview complete</h1>
          <p>This is how reviews will feel. Real spaced-repetition scheduling arrives in the next stage, so nothing was saved.</p>
          <button class="cta" onClick={onClose}>Back to Today</button>
        </div>
      ) : (
        <>
          <div class={`flash ${shown ? 'open' : ''}`} key={i} onClick={() => { setShown(true); if (!shown) speakZh(p.hanzi); }}>
            <small class="eyebrow">Read it</small>
            <div class="hanzi xl">{p.hanzi}</div>
            {shown ? (
              <div class="reveal">
                <Pinyin text={p.py} />
                <p class="en">{p.en}</p>
                <button class="round" aria-label="Play audio" onClick={(e) => { e.stopPropagation(); speakZh(p.hanzi); }}>
                  <IconSound />
                </button>
              </div>
            ) : (
              <p class="tap-hint">Tap to reveal</p>
            )}
          </div>

          <div class="answers">
            <button class="again" disabled={!shown} onClick={next}>Again</button>
            <button class="good" disabled={!shown} onClick={next}>Got it</button>
          </div>
        </>
      )}
    </div>
  );
}
