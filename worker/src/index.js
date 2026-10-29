// Shuōba reminder service: stores push addresses and sends a push every 6 hours (06:00, 12:00, 18:00, 00:00 Singapore time).
// Per subscriber it keeps the push address and the date they last finished their words. For the lock-screen
// widget it also keeps the list of words learnt (hanzi, pinyin, English) under a random token, with no name or
// other identity attached.

import { handleChat } from './chat.js';

const MAX_WIDGETS = 5; // same idea for widget tokens
const MAX_WORDS = 3000;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_SUBSCRIBERS = 5; // personal app: keeps a stranger from filling the list
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /(^|\.)googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uText = (s) => b64u(enc.encode(s));

async function keyFor(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(endpoint));
  return 'sub:' + [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const validEndpoint = (e) => {
  try {
    const u = new URL(e);
    return u.protocol === 'https:' && e.length < 1000 && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
};

// Singapore has no daylight saving, so a fixed UTC+8 offset is exact.
export const sgtDate = (now = new Date()) => new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

export async function vapidHeader(env, endpoint, now = Date.now()) {
  const header = b64uText(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64uText(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.SUBJECT }));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}

// A push with no body: the app's service worker decides what to show, so nothing needs encrypting.
async function sendPush(env, endpoint) {
  return fetch(endpoint, { method: 'POST', headers: { Authorization: await vapidHeader(env, endpoint), TTL: '43200', Urgency: 'normal' } });
}

export async function runDaily(env, now = new Date()) {
  const today = sgtDate(now);
  const out = { sent: 0, skipped: 0, removed: 0, failed: 0 };
  const { keys } = await env.SUBS.list({ prefix: 'sub:' });
  for (const { name } of keys) {
    const sub = await env.SUBS.get(name, 'json');
    if (!sub) continue;
    // Every slot is sent: the app's service worker shows the lock-screen word, and decides at noon whether
    // today's study reminder is still needed (it knows if the words are done).
    const res = await sendPush(env, sub.endpoint).catch(() => null);
    if (res && res.status < 300) out.sent++;
    else if (res && (res.status === 404 || res.status === 410)) { await env.SUBS.delete(name); out.removed++; }
    else { out.failed++; console.log('push failed', res?.status); }
  }
  console.log('scheduled push', today, JSON.stringify(out));
  return out;
}

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const path = new URL(req.url).pathname;
    if (req.method === 'GET' && path === '/') return reply({ ok: true, service: 'shuoba-push' });
    if (req.method === 'GET' && path === '/progress') {
      const t = new URL(req.url).searchParams.get('t') ?? '';
      const found = TOKEN_RE.test(t) ? await env.SUBS.get('prog:' + t, 'json') : null;
      return found ? reply({ words: found.words }) : reply({ error: 'not found' }, 404);
    }
    if (req.method !== 'POST') return reply({ error: 'not found' }, 404);

    if (path === '/chat' || path === '/review') {
      if (Number(req.headers.get('content-length') ?? 0) > 40_000) return reply({ error: 'too large' }, 413);
      let b;
      try { b = await req.json(); } catch { return reply({ error: 'bad json' }, 400); }
      const r = await handleChat(path, b, env, sgtDate());
      return reply(r.body, r.status);
    }

    if (path === '/progress') {
      let b;
      try { b = await req.json(); } catch { return reply({ error: 'bad json' }, 400); }
      const words = b?.words;
      const okWord = (w) => w && ['hanzi', 'py', 'en'].every((k) => typeof w[k] === 'string' && w[k].length <= 200);
      if (!TOKEN_RE.test(b?.token ?? '') || !Array.isArray(words) || words.length > MAX_WORDS || !words.every(okWord)) return reply({ error: 'bad request' }, 400);
      const key = 'prog:' + b.token;
      if (!(await env.SUBS.get(key))) {
        const { keys } = await env.SUBS.list({ prefix: 'prog:' });
        if (keys.length >= MAX_WIDGETS) return reply({ error: 'widget limit reached' }, 429);
      }
      await env.SUBS.put(key, JSON.stringify({ words: words.map(({ hanzi, py, en }) => ({ hanzi, py, en })), updated: sgtDate() }));
      return reply({ ok: true });
    }

    let body;
    try { body = await req.json(); } catch { return reply({ error: 'bad json' }, 400); }
    const endpoint = body?.endpoint;
    if (!validEndpoint(endpoint)) return reply({ error: 'bad endpoint' }, 400);
    const key = await keyFor(endpoint);

    if (path === '/subscribe') {
      const existing = await env.SUBS.get(key, 'json');
      if (!existing) {
        const { keys } = await env.SUBS.list({ prefix: 'sub:' });
        if (keys.length >= MAX_SUBSCRIBERS) return reply({ error: 'subscriber limit reached' }, 429);
      }
      await env.SUBS.put(key, JSON.stringify({ endpoint, created: existing?.created ?? sgtDate(), lastDone: existing?.lastDone ?? null }));
      return reply({ ok: true });
    }
    if (path === '/unsubscribe') {
      await env.SUBS.delete(key);
      return reply({ ok: true });
    }
    const sub = await env.SUBS.get(key, 'json');
    if (!sub) return reply({ error: 'not subscribed' }, 404);
    if (path === '/done') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')) return reply({ error: 'bad date' }, 400);
      await env.SUBS.put(key, JSON.stringify({ ...sub, lastDone: body.date }));
      return reply({ ok: true });
    }
    if (path === '/test') {
      const res = await sendPush(env, endpoint).catch(() => null);
      return reply({ ok: !!res && res.status < 300, status: res?.status ?? 0 });
    }
    return reply({ error: 'not found' }, 404);
  },

  async scheduled(_event, env) {
    await runDaily(env);
  },
};
