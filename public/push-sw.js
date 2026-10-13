// Loaded by the generated service worker (see workbox.importScripts in vite.config.ts).
// The daily push carries no data, so the wording lives here.
const NUDGES = [
  'Your Mandarin words are ready. About five minutes to keep your streak going.',
  'Time for today’s Mandarin: type a few words, then your phrases.',
  'A quick Mandarin session now means less to relearn later.',
  'Words first, then phrases. Your daily Mandarin is waiting.',
];

self.addEventListener('push', (event) => {
  const body = NUDGES[Math.floor(Math.random() * NUDGES.length)];
  event.waitUntil(
    self.registration.showNotification('Shuōba 说吧', {
      body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'daily-reminder', // a new reminder replaces an unread one instead of stacking
      data: { url: self.registration.scope },
    }),
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
