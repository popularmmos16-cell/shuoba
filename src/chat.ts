import { PUSH_URL } from './config';
import { makeToken } from './widget';

// Conversation partner: an AI character you chat with in Chinese. The prompts live in the Worker (worker/src/chat.js);
// the app sends the chat so far and the Chinese words you have learnt, and keeps the transcripts on this device.

export type PersonaId = 'linlin' | 'wang' | 'dawei';
export const PERSONAS: { id: PersonaId; name: string; glyph: string; line: string }[] = [
  { id: 'linlin', name: '小林', glyph: '林', line: '26, marketing, Shanghai. Friendly and teasing. Loves hotpot and K-dramas.' },
  { id: 'wang', name: '王阿姨', glyph: '王', line: '54, retired teacher, Beijing. Warm and a little nosy. Loves cooking.' },
  { id: 'dawei', name: '大伟', glyph: '伟', line: '31, software engineer, Guangzhou. Laid-back and funny. Plays basketball.' },
];

export interface Note { wrong?: string; fix: string; why: string }
export interface Mistake extends Note { i: number } // i = index of the learner's message in the transcript
export interface Msg {
  role: 'user' | 'assistant';
  text: string;
  en?: string; // what the partner said, in English
  huh?: boolean; // the partner did not catch the previous message
  note?: Note; // set on a learner message the partner did not catch
}
export interface SavedChat { id: number; persona: PersonaId; date: string; msgs: Msg[]; mistakes: Mistake[]; reviewed: boolean }

export const MAX_USER_MSGS = 20; // the Worker accepts 44 messages per chat

export class ChatError extends Error {
  constructor(public why: 'offline' | 'cap' | 'limit' | 'busy') {
    super(why);
  }
}
export const WHY: Record<ChatError['why'], string> = {
  offline: 'No connection. Check your internet and try again.',
  cap: 'You have used today’s chat allowance. It resets tomorrow.',
  limit: 'The chat service is full for this app.',
  busy: 'Your partner didn’t get that. Try again.',
};

// A random token made on this phone identifies the device to the Worker (for the daily cap). Like the widget token it
// is kept out of the backup file because it belongs to one device.
const TOKEN_KEY = 'shuoba.chat';
function token(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) localStorage.setItem(TOKEN_KEY, (t = makeToken()));
    return t;
  } catch {
    return makeToken();
  }
}

async function call<T>(path: string, body: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(PUSH_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token(), ...body }) });
  } catch {
    throw new ChatError('offline');
  }
  if (res.ok) return res.json();
  if (res.status === 429) throw new ChatError(((await res.json().catch(() => ({}))) as { error?: string }).error === 'users' ? 'limit' : 'cap');
  throw new ChatError('busy');
}

const wire = (msgs: Msg[]) => msgs.map(({ role, text, en, huh }) => ({ role, text, en, huh }));

// Only whole hanzi words are sent, the most recently learnt last.
export const wordsForChat = (hanzi: string[]) => hanzi.filter((w) => /^[一-鿿]{1,8}$/.test(w)).slice(-300);

export const askPartner = (persona: PersonaId, words: string[], msgs: Msg[]) =>
  call<{ zh: string; en: string; huh?: boolean; note?: Note }>('/chat', { persona, words, history: wire(msgs) });

// The end-of-chat review is the authority. A message the partner already did not catch keeps its note even if the
// review let it through, so every "huh?" in the transcript has an explanation.
export function mergeMistakes(msgs: Msg[], reviewed: Mistake[]): Mistake[] {
  const byI = new Map(reviewed.map((m) => [m.i, m]));
  msgs.forEach((m, i) => {
    if (m.note && !byI.has(i)) byI.set(i, { i, ...m.note });
  });
  return [...byI.values()].sort((a, b) => a.i - b.i);
}

export async function reviewChat(persona: PersonaId, msgs: Msg[]): Promise<Mistake[]> {
  const r = await call<{ mistakes: Mistake[] }>('/review', { persona, history: wire(msgs) });
  return mergeMistakes(msgs, r.mistakes);
}

// ---- transcripts and the chat in progress, on this device ----
const CHATS = 'shuoba.chats';
const DRAFT = 'shuoba.chat.draft';
function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the chat just is not kept */
  }
}

export const savedChats = () => read<SavedChat[]>(CHATS, []);
export const saveChat = (c: SavedChat) => write(CHATS, [c, ...savedChats().filter((x) => x.id !== c.id)].slice(0, 30));

export interface Draft { persona: PersonaId; msgs: Msg[] }
export const getDraft = (): Draft | null => {
  const d = read<Draft | null>(DRAFT, null);
  return d && d.msgs.some((m) => m.role === 'user') ? d : null;
};
export const setDraft = (d: Draft | null) => write(DRAFT, d);
