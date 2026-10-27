// Shuōba reminder service: stores push addresses and sends a push every 6 hours (06:00, 12:00, 18:00, 00:00 Singapore time).
// It holds no progress data. Per subscriber it keeps only the push address and the date they last finished
// their words (so it can skip the reminder on days they've already studied).

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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const path = new URL(req.url).pathname;
    if (req.method === 'GET' && path === '/') return reply({ ok: true, service: 'shuoba-push' });
    if (req.method !== 'POST') return reply({ error: 'not found' }, 404);

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
