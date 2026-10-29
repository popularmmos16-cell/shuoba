// Conversation partner. The prompts and characters live here, so the app can only pick a character and send the
// chat so far. Two calls: /chat (the next thing the character says) and /review (the learner's mistakes, at the end).

// Two models: Qwen3 is quick and sounds natural, so it plays the character; gpt-oss-120b judged mistakes best in
// testing (no false alarms on correct sentences, accurate English explanations), so it checks and reviews.
const TALK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const JUDGE_MODEL = '@cf/openai/gpt-oss-120b';
const MAX_CHAT_USERS = 5; // personal app: keeps a stranger from minting tokens to get around the daily cap
const MAX_PER_DAY = 150; // per device token; a chat turn costs 1 and a review costs 3
const MAX_TURNS = 44; // messages in one chat (the app stops at 20 from the learner)
const MAX_TEXT = 300;
const MAX_WORDS = 300;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const WORD_RE = /^[一-鿿]{1,8}$/; // only hanzi ever reaches a prompt, so the word list cannot carry instructions

const PERSONAS = {
  linlin: `You are 小林, a 26-year-old woman from Chengdu who works in marketing in Shanghai. You are friendly, a bit teasing and quick to laugh. You love hotpot, hiking and K-dramas, you are always tired on Mondays, and you have a cat called 豆豆.`,
  wang: `You are 王阿姨, a 54-year-old retired primary-school teacher in Beijing. You are warm and curious, a little nosy in an affectionate way. You love cooking, tai chi in the park with your friends, and your granddaughter 点点. You say things like 哎呀, 是吗, 好好好.`,
  dawei: `You are 大伟, a 31-year-old software engineer from Guangzhou. You are laid-back and joke a lot. You play basketball on weekends, love dim sum, and complain about the traffic and about your boss. You say things like 哈哈, 其实, 对啊.`,
};

function chatSystem(persona, words) {
  const level = words.length
    ? `They have studied only these words: ${words.join(' ')}.`
    : 'They have only just started. Use only the simplest words, such as 你好, 我, 你, 是, 好, 谢谢.';
  return `${PERSONAS[persona]}

You are chatting with a beginner learner of Mandarin whom you have just met. This is a relaxed, spoken-style conversation between two real people. Stay in character at all times.

HOW YOU TALK
- Chinese only (simplified characters). Never write English, pinyin, emoji, markdown, lists or stage directions in your reply. Write only what you would say out loud.
- Short and natural: one or two short sentences, the way people really talk. Use everyday spoken words and particles (啊, 呢, 吧, 哦, 嗯, 哈哈, 对了).
- React to what they just said like a real person would (surprise, agreement, a small joke, something from your own life), then keep the chat going, usually with one easy question. Do not end every turn with a question, and do not interview them. About one reply in three should have no question at all: just react or share something and let them answer. Mix questions with your own stories, opinions and plans. Remember what they told you earlier and bring it up again later.
- Drift between everyday topics: food, work, family, weekends, hobbies, travel, weather, daily life.
- You are not a teacher. Never explain grammar, never translate, never list vocabulary, and do not keep praising their Chinese.

IF YOU DID NOT CATCH WHAT THEY SAID
- Sometimes your previous line will be a short "huh?" (啊？, 什么？). That means you did not quite understand them. When they try again, just answer them naturally and carry on as if nothing happened. Never explain, correct or hint at what was wrong.

THEIR LEVEL
- ${level}
- Build your sentences mostly from those words and other very common ones. At most one or two new simple words per turn. No idioms and no long sentences.

HONESTY
- If they sincerely ask whether you are a real person or an AI, answer truthfully in very simple Chinese that you are an AI chat partner (我是AI聊天伙伴), then carry on chatting in character.

FORMAT
Your reply is the Chinese, then a new line that starts with EN: followed by a natural, fluent English translation of exactly what you said. Nothing else.`;
}

function reviewSystem() {
  return `You are an experienced Mandarin teacher reviewing a chat between a beginner learner (LEARNER) and a native speaker (PARTNER). Check only the LEARNER lines.
For each LEARNER line decide whether it contains a real mistake: grammar, word order, a wrong or missing word, a wrong measure word, a wrong particle, a phrasing no native speaker would use, or English words that should have been Chinese. Do not flag missing punctuation, and do not flag a correct sentence just because another way of saying it exists. If you are not sure a line is actually wrong, mark it ok: never flag anything a native speaker could naturally say. If the PARTNER answered with confusion (啊？ 什么？ 你说什么？), the LEARNER line just before it very likely has a mistake, so look for it.
Reply with JSON only, no other text, in this shape:
{"turns":[{"i":0,"ok":true},{"i":2,"ok":false,"wrong":"the exact wrong part, copied from the learner line","fix":"the whole learner line, corrected","why":"one short sentence in English giving the rule"}]}
"i" is the number printed before each line. Include every LEARNER line once. "wrong" must be copied exactly from that line. Change as little as possible, keep the learner's meaning, and keep the fix at beginner level.`;
}

const clean = (s) => String(s).replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// "你好！\nEN: Hello!" -> { zh, en }. Anything the model adds around that (labels, markdown, line breaks) is dropped.
export function parseReply(raw) {
  const text = clean(raw).replace(/```[a-z]*/g, '');
  const [first, ...rest] = text.split(/\n+\s*EN\s*[:：]\s*/i);
  const zh = first
    .replace(/^\s*[一-鿿A-Za-z]{1,6}\s*[:：]\s*/, '') // a leading "小林："
    .replace(/[*_#>`]/g, '')
    .replace(/\s*\n+\s*/g, '')
    .trim()
    .slice(0, 200);
  const en = rest.join(' ').replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { zh, en };
}

function validHistory(h) {
  return (
    Array.isArray(h) &&
    h.length <= MAX_TURNS &&
    h.every((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.length > 0 && m.text.length <= MAX_TEXT && (m.en === undefined || (typeof m.en === 'string' && m.en.length <= MAX_TEXT)) && (m.huh === undefined || typeof m.huh === 'boolean'))
  );
}

// One KV record per device: the day and how many calls it has used that day.
async function spend(env, token, cost, today) {
  const key = 'ct:' + token;
  let rec = await env.SUBS.get(key, 'json');
  if (!rec) {
    const { keys } = await env.SUBS.list({ prefix: 'ct:' });
    if (keys.length >= MAX_CHAT_USERS) return 'users';
    rec = { day: today, n: 0 };
  }
  if (rec.day !== today) rec = { day: today, n: 0 };
  if (rec.n + cost > MAX_PER_DAY) return 'cap';
  await env.SUBS.put(key, JSON.stringify({ day: today, n: rec.n + cost }), { expirationTtl: 172800 });
  return null;
}

const NO_THINK = ' /no_think'; // Qwen3 otherwise spends its whole budget reasoning and returns no content

async function run(env, model, messages, opts) {
  let msgs = messages;
  if (model === TALK_MODEL) {
    const last = messages[messages.length - 1];
    msgs = [...messages.slice(0, -1), { ...last, content: last.content + NO_THINK }];
  }
  const r = await env.AI.run(model, { messages: msgs, ...opts });
  return r.choices?.[0]?.message?.content ?? r.response ?? '';
}

const START = '[The chat has just started. Greet the learner like someone you have just met, say your name in one short sentence, and ask one easy question.]';

// Spoken "huh?" reactions, with what they mean. A second miss in a row uses the second list.
const HUH = [['啊？', 'Huh?'], ['嗯？', 'Hm?'], ['什么？', 'What?'], ['你说什么？', 'What did you say?'], ['我没听懂。', "I didn't get that."], ['不好意思，再说一次？', 'Sorry, say that again?']];
const HUH_AGAIN = [['啊？再说一次？', 'Huh? Say it again?'], ['嗯？慢一点说？', 'Hm? A bit slower?'], ['还是没听懂，你再说一次？', "I still didn't get it, can you say it again?"]];
const pick = (list, not) => {
  const pool = list.filter(([zh]) => zh !== not);
  return pool[Math.floor(Math.random() * pool.length)];
};

// How many of the partner's most recent lines in a row were a "huh?" (the app marks them).
const huhStreak = (history) => {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') continue;
    if (!history[i].huh) break;
    n++;
  }
  return n;
};

// One strict yes/no on the learner's latest message, kept separate from the chat so the "huh?" is dependable.
function checkSystem() {
  return `You judge one message written by a beginner learner of Mandarin in a chat. Decide whether a native speaker would find it clearly wrong: wrong word order (for example the place or time after the verb when it belongs before it), a wrong or missing word, a wrong measure word, a wrong particle, English words in place of Chinese, or nonsense.
Be strict about real mistakes but fair: correct sentences are OK, natural short answers and fragments (好的, 我也是, 不知道, 三十块) are OK, and an unusual but natural phrasing is OK. Judge the Chinese only: never flag a message because it does not answer the question, changes the subject, or says something untrue or odd. The PARTNER line, when present, is only context.
Reply with JSON only. If it is fine: {"ok":true}
If it is clearly wrong: {"ok":false,"wrong":"the exact wrong part, copied from the learner message","fix":"the whole message, corrected with as few changes as possible","why":"one short sentence in English giving the rule"}`;
}

async function check(env, history) {
  const last = history[history.length - 1];
  const prev = history.findLast((m) => m.role === 'assistant');
  const input = `${prev ? `PARTNER: ${prev.text}\n` : ''}LEARNER: ${last.text}`;
  try {
    const data = extractJson(await run(env, JUDGE_MODEL, [{ role: 'system', content: checkSystem() }, { role: 'user', content: input }], { max_tokens: 900, temperature: 0, reasoning_effort: 'low' }));
    return data?.ok === false ? asMistake(data, last.text) : null;
  } catch {
    return null; // a failed check must never block the chat
  }
}

// The model sometimes forgets the EN: line, so ask for the translation on its own.
async function translate(env, zh) {
  try {
    const r = await run(env, TALK_MODEL, [{ role: 'system', content: 'Translate the Chinese into natural, fluent English. Output only the translation.' }, { role: 'user', content: zh }], { max_tokens: 120, temperature: 0.2 });
    return clean(r).replace(/\s+/g, ' ').slice(0, 300);
  } catch {
    return '';
  }
}

async function say(env, persona, words, history, hint) {
  const messages = [{ role: 'system', content: chatSystem(persona, words) + (hint ? `\n\n${hint}` : '') }];
  if (!history.length) messages.push({ role: 'user', content: START });
  for (const m of history) messages.push({ role: m.role, content: m.role === 'assistant' && m.en ? `${m.text}\nEN: ${m.en}` : m.text });
  for (let attempt = 0; attempt < 2; attempt++) {
    const { zh, en } = parseReply(await run(env, TALK_MODEL, messages, { max_tokens: 220, temperature: 0.8, top_p: 0.9 }));
    if (zh) return { zh, en: en || (await translate(env, zh)) };
  }
  return null;
}

const SHARE = 'For this reply do NOT ask a question. Just react and tell them something short about your own life, an opinion or a small story, and let them respond in their own time.';

const MOVE_ON = 'The learner has struggled to be understood for a few messages in a row. Kindly move on: say something short and warm like 没关系 and ask a different, very easy question about something simple.';

async function chat(b, env) {
  const { history, persona, words } = b;
  // The check and the reply run side by side; if the check finds a mistake the reply is thrown away.
  const share = history.filter((m) => m.role === 'user').length % 3 === 2;
  const [note, said] = await Promise.all([history.length ? check(env, history) : null, say(env, persona, words, history, share ? SHARE : undefined)]);
  if (note) {
    const streak = huhStreak(history) + 1;
    if (streak <= 2) {
      const last = history.findLast((m) => m.role === 'assistant')?.text;
      const [zh, en] = pick(streak === 1 ? HUH : HUH_AGAIN, last);
      return { status: 200, body: { zh, en, huh: true, note } };
    }
    const moved = await say(env, persona, words, history, MOVE_ON);
    if (moved) return { status: 200, body: { ...moved, note } };
  }
  return said ? { status: 200, body: said } : { status: 502, body: { error: 'empty' } };
}

// A mistake record the model produced, checked against the learner's real text. null when it is not a real fix.
function asMistake(t, text) {
  const fix = typeof t?.fix === 'string' ? t.fix.trim().slice(0, MAX_TEXT) : '';
  if (!fix || fix === text.trim()) return null; // "fixed" to the same sentence: it was fine
  const wrong = typeof t.wrong === 'string' && t.wrong && text.includes(t.wrong) ? t.wrong : undefined;
  return { wrong, fix, why: typeof t.why === 'string' ? t.why.trim().slice(0, MAX_TEXT) : '' };
}

function extractJson(raw) {
  const t = clean(raw);
  const a = t.indexOf('{');
  const z = t.lastIndexOf('}');
  if (a < 0 || z < a) return null;
  try { return JSON.parse(t.slice(a, z + 1)); } catch { return null; }
}

async function review(b, env) {
  const history = b.history;
  const lines = history.map((m, i) => `${i} ${m.role === 'user' ? 'LEARNER' : 'PARTNER'}: ${m.text}`).join('\n');
  const messages = [{ role: 'system', content: reviewSystem() }, { role: 'user', content: lines }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = extractJson(await run(env, JUDGE_MODEL, messages, { max_tokens: 3000, temperature: 0.2 }));
    if (!data || !Array.isArray(data.turns)) continue;
    const mistakes = [];
    for (const t of data.turns) {
      const m = Number.isInteger(t?.i) ? history[t.i] : null;
      if (!m || m.role !== 'user' || t.ok !== false) continue;
      const found = asMistake(t, m.text);
      if (found) mistakes.push({ i: t.i, ...found });
    }
    return { status: 200, body: { mistakes } };
  }
  return { status: 502, body: { error: 'empty' } };
}

// path is /chat or /review. Returns { status, body }.
export async function handleChat(path, b, env, today) {
  const bad = { status: 400, body: { error: 'bad request' } };
  if (!env.AI) return { status: 503, body: { error: 'unavailable' } };
  if (!TOKEN_RE.test(b?.token ?? '') || !validHistory(b.history)) return bad;
  if (path === '/chat') {
    if (!Object.hasOwn(PERSONAS, b.persona)) return bad;
    if (b.history.length && b.history[b.history.length - 1].role !== 'user') return bad; // the learner speaks last
    if (!Array.isArray(b.words) || b.words.length > MAX_WORDS || !b.words.every((w) => typeof w === 'string' && WORD_RE.test(w))) return bad;
  } else if (!b.history.some((m) => m.role === 'user')) return bad;
  const blocked = await spend(env, b.token, path === '/chat' ? 1 : 3, today);
  if (blocked) return { status: 429, body: { error: blocked } };
  try {
    return await (path === '/chat' ? chat(b, env) : review(b, env));
  } catch (e) {
    console.log('ai failed', String(e));
    return { status: 502, body: { error: 'ai' } };
  }
}
