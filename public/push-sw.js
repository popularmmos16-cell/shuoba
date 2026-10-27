// Loaded by the generated service worker (see workbox.importScripts in vite.config.ts).
// The pushes carry no data, so the wording lives here.
const NUDGES = [
  'Your Mandarin words are ready. About five minutes to keep your streak going.',
  'Time for today’s Mandarin: type a few words, then your phrases.',
  'A quick Mandarin session now means less to relearn later.',
  'Words first, then phrases. Your daily Mandarin is waiting.',
];

const SLOT_MS = 6 * 3600_000;

async function lockData() {
  try {
    const cache = await caches.open('shuoba-lockscreen');
    const res = await cache.match(new URL('lockscreen.json', self.registration.scope).href);
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The service sends a push every 6 hours with no data. Each one swaps the lock-screen word for the next learnt
// word (the same tag replaces the old card, so there is only ever one), and the noon one also carries the study
// nudge unless today's words are already done.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const now = new Date();
      const data = await lockData();
      const shown = [];
      if (data && data.words.length) {
        const w = data.words[Math.floor(now.getTime() / SLOT_MS) % data.words.length];
        shown.push(
          self.registration.showNotification(w.hanzi, {
            body: `${w.py} · ${w.en}`,
            icon: 'icon-192.png',
            badge: 'icon-192.png',
            tag: 'lockscreen-word', // replaces the previous word rather than stacking
            requireInteraction: true, // asks the system to keep it until dismissed (honoured on some platforms only)
            silent: true,
            data: { url: self.registration.scope },
          }),
        );
      }
      const noon = now.getHours() >= 11 && now.getHours() <= 13;
      if (noon && data?.doneDate !== localDay(now)) {
        shown.push(
          self.registration.showNotification('Shuōba 说吧', {
            body: NUDGES[Math.floor(Math.random() * NUDGES.length)],
            icon: 'icon-192.png',
            badge: 'icon-192.png',
            tag: 'daily-reminder', // a new reminder replaces an unread one instead of stacking
            data: { url: self.registration.scope },
          }),
        );
      }
      await Promise.all(shown);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(event.notification.data?.url ?? './');
    }),
  );
});
