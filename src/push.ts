import { PUSH_URL, VAPID_PUBLIC } from './config';
import { setDoneHook } from './store';

// Daily 12:00 (Singapore time) reminder through Web Push. Only the push address goes to the reminder service;
// no progress data leaves the phone. Works on iPhone only for an app added to the Home Screen.

const FLAG = 'shuoba.push'; // kept out of the backup file: a push address belongs to one device

export const pushConfigured = () => !!PUSH_URL && !!VAPID_PUBLIC;
export const isStandalone = () => (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const remindersOn = () => {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
};
const setFlag = (on: boolean) => {
  try {
    on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
};

const toKey = (s: string) => {
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(PUSH_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function currentSub(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export type EnableResult = { ok: true } | { ok: false; why: 'unsupported' | 'not-installed' | 'denied' | 'service' | 'unconfigured' };

// Must be called from a tap: iOS only shows the permission prompt in response to a user gesture.
export async function enableReminders(): Promise<EnableResult> {
  if (!pushConfigured()) return { ok: false, why: 'unconfigured' };
  if (!pushSupported()) return { ok: false, why: 'unsupported' };
  if (!isStandalone()) return { ok: false, why: 'not-installed' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, why: 'denied' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC) }));
    const res = await post('/subscribe', { endpoint: sub.endpoint });
    if (!res.ok) return { ok: false, why: 'service' };
    setFlag(true);
    return { ok: true };
  } catch {
    return { ok: false, why: 'service' };
  }
}

export async function disableReminders() {
  setFlag(false);
  try {
    const sub = await currentSub();
    if (sub) {
      await post('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch {
    /* already gone */
  }
}

export async function sendTestReminder(): Promise<boolean> {
  try {
    const sub = await currentSub();
    if (!sub) return false;
    const res = await post('/test', { endpoint: sub.endpoint });
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

// Tell the service this day's words are done so it skips today's reminder.
setDoneHook(async (date) => {
  if (!remindersOn() || !pushConfigured()) return;
  try {
    const sub = await currentSub();
    if (sub) await post('/done', { endpoint: sub.endpoint, date });
  } catch {
    /* best effort: the reminder just still arrives */
  }
});
