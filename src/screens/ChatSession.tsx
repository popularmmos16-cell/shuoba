import { useEffect, useRef, useState } from 'preact/hooks';
import { IconClose, IconMute, IconSound } from '../components/Icons';
import { isQuiet, dateKey } from '../store';
import { speakZh } from '../speak';
import {
  askPartner, ChatError, MAX_USER_MSGS, PERSONAS, reviewChat, saveChat, setDraft, WHY, mergeMistakes,
  type Msg, type PersonaId, type SavedChat,
} from '../chat';
import { ChatReview } from './ChatReview';

type Phase = 'chat' | 'reviewing' | 'done';

export function ChatSession({ persona, resume, words, onClose }: { persona: PersonaId; resume?: Msg[]; words: string[]; onClose: () => void }) {
  const p = PERSONAS.find((x) => x.id === persona)!;
  const [msgs, setMsgs] = useState<Msg[]>(resume ?? []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(() => !resume?.length || resume[resume.length - 1].role === 'user'); // the partner speaks first
  const [err, setErr] = useState<ChatError['why'] | null>(null);
  const [shown, setShown] = useState<Set<number>>(new Set()); // partner lines whose English is open
  const [voice, setVoice] = useState(!isQuiet());
  const [phase, setPhase] = useState<Phase>('chat');
  const [reviewErr, setReviewErr] = useState<ChatError['why'] | null>(null);
  const [saved, setSaved] = useState<SavedChat | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const mine = msgs.filter((m) => m.role === 'user').length;
  const full = mine >= MAX_USER_MSGS;

  async function ask(list: Msg[]) {
    setBusy(true);
    setErr(null);
    try {
      const r = await askPartner(persona, words, list);
      const reply: Msg = { role: 'assistant', text: r.zh, en: r.en, huh: r.huh || undefined };
      // a message the partner did not catch carries its correction, so the review can explain the "huh?"
      const head = r.note ? [...list.slice(0, -1), { ...list[list.length - 1], note: r.note }] : list;
      setMsgs([...head, reply]);
      if (voice) speakZh(r.zh);
    } catch (e) {
      setErr(e instanceof ChatError ? e.why : 'busy');
    } finally {
      setBusy(false);
    }
  }

  // open the chat (or pick up where an unfinished one left off)
  useEffect(() => {
    if (!msgs.length || msgs[msgs.length - 1].role === 'user') ask(msgs);
  }, []);
  useEffect(() => setDraft(msgs.length ? { persona, msgs } : null), [msgs]);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [msgs.length, busy, err]);

  function send(e: Event) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy || full) return;
    const next: Msg[] = [...msgs, { role: 'user', text: t.slice(0, 300) }];
    setMsgs(next);
    setText('');
    ask(next);
  }

  async function finish(skipReview = false) {
    setPhase('reviewing');
    setReviewErr(null);
    try {
      const mistakes = skipReview ? mergeMistakes(msgs, []) : await reviewChat(persona, msgs);
      const chat: SavedChat = { id: Date.now(), persona, date: dateKey(), msgs, mistakes, reviewed: !skipReview };
      saveChat(chat);
      setDraft(null);
      setSaved(chat);
      setPhase('done');
    } catch (e) {
      setReviewErr(e instanceof ChatError ? e.why : 'busy');
    }
  }

  if (phase === 'done' && saved) return <ChatReview chat={saved} onClose={onClose} />;

  if (phase === 'reviewing')
    return (
      <div class="learn">
        <div class="finish rise">
          <div class="seal big">{p.glyph}</div>
          {reviewErr ? (
            <>
              <h1>Couldn’t check your chat</h1>
              <p>{WHY[reviewErr]}</p>
              <button class="cta solid" onClick={() => finish()}>Try again</button>
              <button class="ghost" onClick={() => finish(true)}>Save without the full check</button>
              <button class="ghost" onClick={() => setPhase('chat')}>Back to the chat</button>
            </>
          ) : (
            <>
              <h1>Checking your chat…</h1>
              <p>Looking for slips in what you wrote. This takes a few seconds.</p>
            </>
          )}
        </div>
      </div>
    );

  return (
    <div class="chat">
      <header class="chat-top">
        <button class="icon-btn" aria-label="Leave chat (it is kept so you can continue)" onClick={onClose}><IconClose /></button>
        <div class="chat-who"><b>{p.name}</b><small>AI chat partner</small></div>
        <button class={`chip mute ${voice ? '' : 'on'}`} aria-label={voice ? 'Turn voice off' : 'Turn voice on'} onClick={() => setVoice(!voice)}>
          {voice ? <IconSound /> : <IconMute />}
        </button>
        <button class="chat-end" disabled={busy || mine === 0} onClick={() => finish()}>End &amp; review</button>
      </header>

      <div class="chat-log">
        {msgs.map((m, i) =>
          m.role === 'assistant' ? (
            <div class={`bub ai ${m.huh ? 'huh' : ''}`}>
              <span class="hz">{m.text}</span>
              <span class="bub-tools">
                <button aria-label="Play" onClick={() => speakZh(m.text)}><IconSound /></button>
                {m.en && (
                  <button aria-label="Show English" onClick={() => setShown((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}>EN</button>
                )}
              </span>
              {shown.has(i) && m.en && <small class="en">{m.en}</small>}
            </div>
          ) : (
            <div class="bub me"><span class="hz">{m.text}</span></div>
          ),
        )}
        {busy && <div class="bub ai typing" aria-label={`${p.name} is typing`}><i /><i /><i /></div>}
        {err && (
          <div class="chat-err">
            <small>{WHY[err]}</small>
            {err !== 'cap' && err !== 'limit' && <button onClick={() => ask(msgs)}>Try again</button>}
          </div>
        )}
        {full && !busy && <small class="chat-hint">That’s a long chat. Tap “End &amp; review” to see your mistakes.</small>}
        <div ref={end} />
      </div>

      <form class="chat-in" onSubmit={send}>
        <input
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          placeholder={full ? 'Chat is full' : 'Type in Chinese'}
          disabled={full}
          lang="zh-Hans"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck={false}
          aria-label="Your message"
        />
        <button type="submit" disabled={!text.trim() || busy || full}>Send</button>
      </form>
    </div>
  );
}
