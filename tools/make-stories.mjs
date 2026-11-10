#!/usr/bin/env node
// Draft graded stories for review. Writes tools/content/stories/drafts/dNN.txt; nothing here ships until you check the
// Chinese yourself (or have someone who reads Chinese check it) and move the file up into tools/content/stories/.
//
//   cd tools/story-proxy && npx wrangler dev --remote --port 8799 --ip 127.0.0.1     (separate terminal; uses your free AI allowance)
//   node tools/make-stories.mjs --units 4 --count 5 [--topic "a day at the shop"] [--url http://127.0.0.1:8799]
//
// --units N allows the words taught in units 1..N. A draft is kept only if at least 95% of its words are allowed words;
// words that are not (shown as "# outside:") must be reworded or added to units.txt before the story can be published.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const UNITS = +arg('units', 4), COUNT = +arg('count', 5), URL_ = arg('url', 'http://127.0.0.1:8799'), TRIES = 4;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OSS = '@cf/openai/gpt-oss-120b';
const phrases = JSON.parse(fs.readFileSync(path.join(root, 'src/data/phrases.json'), 'utf8'));
const allowed = phrases.filter((p) => p.kind === 'word' && p.unit <= UNITS).map((p) => p.hanzi);
const FUNC = fs.readFileSync(path.join(root, 'tools/build-stories.py'), 'utf8').match(/FUNCTION_WORDS = "([^"]+)"/)[1].split(' ');
const ok = new Set([...allowed, ...FUNC]);
const TOPICS = [arg('topic', ''), 'a day at the shop', 'meeting a friend', 'eating together', 'a phone call', 'asking for directions', 'going home by bus', 'a family meal', 'ordering drinks'].filter(Boolean);
const isHan = (c) => c >= '一' && c <= '鿿';
const seg = new Intl.Segmenter('zh', { granularity: 'word' });

function outside(text) { // words not in the allowed set: longest allowed match first, Intl.Segmenter for the rest
  const toks = []; let i = 0, rest = '';
  const flush = () => { for (const s of seg.segment(rest)) if (s.isWordLike) toks.push(s.segment); rest = ''; };
  while (i < text.length) {
    let hit = '';
    if (isHan(text[i])) for (let l = Math.min(6, text.length - i); l >= 1; l--) if (ok.has(text.slice(i, i + l))) { hit = text.slice(i, i + l); break; }
    if (hit) { flush(); toks.push(hit); i += hit.length; } else rest += text[i++];
  }
  flush();
  const han = toks.filter((t) => [...t].some(isHan));
  return { n: han.length, bad: han.filter((t) => !ok.has(t)) };
}
async function ask(messages, opts) {
  const r = await fetch(URL_, { method: 'POST', body: JSON.stringify({ model: OSS, messages, opts }) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json()).text;
}
const json = (t) => { try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return null; } };
const SYS = `You write short graded reading stories in SIMPLIFIED Chinese for a beginner.
Allowed words: ${allowed.join(' ')}. Always allowed grammar words: ${FUNC.join(' ')}.
Use ONLY those words. Write the Chinese as normal text with NO spaces between words. Write 6 to 8 sentences forming a natural, coherent mini story with a beginning, middle and end, the way a native speaker would, not a list of "我有X". Every sentence must be grammatical.
Reply with JSON only: {"title":"2-5 character Chinese title","titleEn":"English title","sentences":[{"zh":"...","en":"natural English translation"}]}`;
const JUDGE = `You check a short Chinese story for a beginner. Reply with JSON only: {"naturalness":1-5,"errors":"short English list of any grammar mistakes, unnatural phrases or wrong word choices, or empty"}.`;

const dir = path.join(root, 'tools/content/stories/drafts');
let n = fs.readdirSync(dir).filter((f) => /^d\d+\.txt$/.test(f)).length;
for (let k = 0; k < COUNT; k++) {
  const topic = TOPICS[k % TOPICS.length]; let best = null;
  let messages = [{ role: 'system', content: SYS }, { role: 'user', content: `Write a story about ${topic}.` }];
  for (let t = 0; t < TRIES; t++) {
    const raw = await ask(messages, { max_tokens: 1800, temperature: 0.7, reasoning_effort: 'low' });
    const s = json(raw); if (!s?.sentences?.length) continue;
    s.sentences.forEach((x) => { x.zh = String(x.zh).replace(/\s+/g, ''); });
    const zh = s.sentences.map((x) => x.zh).join(''); const o = outside(zh);
    const cov = 1 - o.bad.length / (o.n || 1);
    if (!best || cov > best.cov) best = { s, cov, bad: [...new Set(o.bad)] };
    if (cov >= 0.98) break;
    messages = [...messages, { role: 'assistant', content: raw }, { role: 'user', content: `These words are not allowed: ${[...new Set(o.bad)].join(' ')}. Rewrite the whole story without them, keeping it natural. JSON only.` }];
  }
  if (!best || best.cov < 0.95) { console.log(`skip "${topic}": best coverage ${best ? Math.round(best.cov * 100) : 0}%`); continue; }
  const j = json(await ask([{ role: 'system', content: JUDGE }, { role: 'user', content: best.s.sentences.map((x) => x.zh).join('\n') }], { max_tokens: 600, temperature: 0, reasoning_effort: 'low' }));
  const name = `d${String(++n).padStart(2, '0')}.txt`;
  const lines = [`# DRAFT, not reviewed. Topic: ${topic}. Allowed-word coverage ${Math.round(best.cov * 100)}%.`,
    best.bad.length ? `# outside: ${best.bad.join(' ')}` : '# outside: none',
    `# model judge: naturalness ${j?.naturalness ?? '?'}${j?.errors ? `; ${j.errors}` : ''}`,
    `title: ${best.s.title}|${best.s.titleEn}`, ...best.s.sentences.map((x) => `${x.zh}|${x.en}`)];
  fs.writeFileSync(path.join(dir, name), lines.join('\n') + '\n');
  console.log(`wrote drafts/${name}: ${best.s.title} (${Math.round(best.cov * 100)}% allowed, judge ${j?.naturalness ?? '?'})`);
}
