import { getDraft, PERSONAS, savedChats, type PersonaId, type SavedChat } from '../chat';

export function Chat({ wordCount, onStart, onResume, onOpen }: { wordCount: number; onStart: (p: PersonaId) => void; onResume: () => void; onOpen: (c: SavedChat) => void }) {
  const draft = getDraft();
  const past = savedChats();
  const who = (id: PersonaId) => PERSONAS.find((p) => p.id === id)!;
  return (
    <main class="screen">
      <h1 class="page-title rise" style="--i:0">Chat</h1>
      <p class="intro rise" style="--i:1">
        Talk to an AI character in Chinese, like a real conversation. They ask you questions and you answer. If you slip up they’ll say
        “啊？” and carry on. When you’re done you get the whole chat back with your mistakes marked and corrected.
      </p>
      {wordCount < 10 && <p class="intro rise" style="--i:1">Learn a few more words first for easier chats. Your partner sticks to words you know.</p>}

      {draft && (
        <button class="card mode rise" style="--i:2" onClick={onResume}>
          <span class="glyph">{who(draft.persona).glyph}</span>
          <span class="mode-text"><b>Continue chat with {who(draft.persona).name}</b><small>{draft.msgs.filter((m) => m.role === 'user').length} messages so far</small></span>
          <span class="time">Resume</span>
        </button>
      )}

      <h2 class="rise" style="--i:2">Who do you want to talk to?</h2>
      {PERSONAS.map((p, n) => (
        <button class="card mode rise" style={`--i:${n + 3}`} onClick={() => onStart(p.id)}>
          <span class="glyph">{p.glyph}</span>
          <span class="mode-text"><b>{p.name}</b><small>{p.line}</small></span>
          <span class="time">New chat</span>
        </button>
      ))}

      {past.length > 0 && <h2 class="rise" style="--i:6">Past chats</h2>}
      {past.map((c) => (
        <button class="card mode rise" style="--i:7" onClick={() => onOpen(c)}>
          <span class="glyph">{who(c.persona).glyph}</span>
          <span class="mode-text"><b>{who(c.persona).name}</b><small>{c.date}</small></span>
          <span class="time">{c.mistakes.length ? `${c.mistakes.length} to fix` : 'Clean'}</span>
        </button>
      ))}

      <p class="muted rise" style="--i:8">
        Characters are AI. Your messages and the Chinese words you’ve learnt are sent to this app’s own reminder service and answered by
        Cloudflare Workers AI. Chats are saved only on this device.
      </p>
    </main>
  );
}
