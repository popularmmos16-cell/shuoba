import { IconClose, IconSound } from '../components/Icons';
import { speakZh } from '../speak';
import { PERSONAS, type SavedChat } from '../chat';

// The learner's wrong part picked out inside their own sentence (the whole line if it cannot be found).
function Marked({ text, wrong }: { text: string; wrong?: string }) {
  const at = wrong ? text.indexOf(wrong) : -1;
  if (!wrong || at < 0) return <mark class="wrong">{text}</mark>;
  return (
    <>
      {text.slice(0, at)}
      <mark class="wrong">{wrong}</mark>
      {text.slice(at + wrong.length)}
    </>
  );
}

export function ChatReview({ chat, onClose }: { chat: SavedChat; onClose: () => void }) {
  const p = PERSONAS.find((x) => x.id === chat.persona)!;
  const byI = new Map(chat.mistakes.map((m) => [m.i, m]));
  const mine = chat.msgs.filter((m) => m.role === 'user').length;
  const bad = chat.mistakes.length;
  return (
    <div class="learn chat-review">
      <header class="learn-top">
        <button class="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        <div class="chat-who"><b>Chat with {p.name}</b><small>{chat.date}</small></div>
      </header>

      <div class="card review-sum rise">
        <b>{bad === 0 ? 'No mistakes this time' : `${bad} of your ${mine} ${mine === 1 ? 'message' : 'messages'} to fix`}</b>
        <small>
          {bad === 0
            ? 'Nice one. Every line you wrote read fine.'
            : 'Your slips are marked below, with the corrected line and why. Tap the speaker to hear it.'}
          {!chat.reviewed && ' The full check could not run, so only the lines your partner didn’t understand are marked.'}
        </small>
      </div>

      <div class="chat-log static">
        {chat.msgs.map((m, i) => {
          if (m.role === 'assistant')
            return (
              <div class="bub ai">
                <span class="hz">{m.text}</span>
                <span class="bub-tools"><button aria-label="Play" onClick={() => speakZh(m.text)}><IconSound /></button></span>
                {m.en && <small class="en">{m.en}</small>}
              </div>
            );
          const f = byI.get(i);
          return (
            <>
              <div class={`bub me ${f ? 'flag' : ''}`}>
                <span class="hz">{f ? <Marked text={m.text} wrong={f.wrong} /> : m.text}</span>
              </div>
              {f && (
                <div class="fix">
                  <div class="fix-line">
                    <b class="hz">{f.fix}</b>
                    <span class="bub-tools"><button aria-label="Play corrected line" onClick={() => speakZh(f.fix)}><IconSound /></button></span>
                  </div>
                  {f.why && <small>{f.why}</small>}
                </div>
              )}
            </>
          );
        })}
      </div>

      <button class="cta solid" onClick={onClose}>Done</button>
    </div>
  );
}
