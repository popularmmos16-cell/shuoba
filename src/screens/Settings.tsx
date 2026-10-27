import { useRef, useState } from 'preact/hooks';
import { dateKey, update, useStore } from '../store';
import { exportData, importData } from '../db';
import { VoiceTest } from '../VoiceTest';
import { QuietToggle } from '../components/QuietToggle';
import { Credits } from '../components/Credits';
import { disableReminders, enableReminders, isStandalone, pushConfigured, pushSupported, remindersOn, sendTestReminder } from '../push';

const GOALS = [10, 15, 20, 30];
const NEWS = [8, 12, 15, 20];
const TYPING = [5, 7, 10, 12];

async function backupNow(): Promise<string> {
  const blob = new Blob([JSON.stringify(await exportData())], { type: 'application/json' });
  const file = new File([blob], `shuoba-backup-${dateKey()}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Shuōba backup' });
      update({ lastBackup: Date.now() });
      return 'Backup shared. Save it to Files or iCloud Drive.';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return '';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  update({ lastBackup: Date.now() });
  return 'Backup downloaded.';
}

export function Settings() {
  const s = useStore();
  const [msg, setMsg] = useState('');
  const [remind, setRemind] = useState(remindersOn());
  const [rmsg, setRmsg] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!f) return;
    if (!confirm('Replace all progress on this device with this backup?')) return;
    try {
      await importData(JSON.parse(await f.text()));
      setMsg('Backup restored.');
    } catch (err) {
      setMsg(`Could not restore: ${(err as Error).message}`);
    }
  };
  return (
    <main class="screen">
      <h1 class="page-title rise" style="--i:0">Settings</h1>

      <section class="card rise" style="--i:1">
        <b>Daily goal</b>
        <div class="seg">
          {GOALS.map((g) => (
            <button class={s.goalMin === g ? 'on' : ''} onClick={() => update({ goalMin: g })}>{g} min</button>
          ))}
        </div>
      </section>

      <section class="card rise" style="--i:1">
        <b>New words to type per day</b>
        <div class="seg">
          {TYPING.map((n) => (
            <button class={s.typingNew === n ? 'on' : ''} onClick={() => update({ typingNew: n })}>{n}</button>
          ))}
        </div>
      </section>

      <section class="card rise" style="--i:1">
        <b>New phrases per day</b>
        <div class="seg">
          {NEWS.map((n) => (
            <button class={s.newPerDay === n ? 'on' : ''} onClick={() => update({ newPerDay: n })}>{n}</button>
          ))}
        </div>
      </section>

      <QuietToggle />

      <section class="card rise" style="--i:2">
        <b>Daily reminder</b>
        <p class="muted">A notification at 12:00 noon (Singapore time), skipped on days you’ve already done your words. Every 6 hours (06:00, 12:00, 18:00, 00:00) it also puts one word you’ve learnt on your lock screen, replacing the last one.</p>
        {!pushConfigured() ? (
          <small>Reminders aren’t set up in this build yet.</small>
        ) : !pushSupported() ? (
          <small>This browser can’t receive notifications.</small>
        ) : !isStandalone() ? (
          <small>First add Shuōba to your Home Screen (Share → Add to Home Screen) and open it from there. iPhone only allows notifications for installed apps.</small>
        ) : (
          <div class="row">
            {!remind ? (
              <button
                class="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await enableReminders();
                  setBusy(false);
                  setRemind(r.ok);
                  setRmsg(
                    r.ok
                      ? 'Reminders are on. Tap “Send a test” to check one arrives.'
                      : r.why === 'denied'
                        ? 'Notifications are blocked. Turn them on in Settings → Notifications → Shuōba, then try again.'
                        : 'Could not turn reminders on. Check your connection and try again.',
                  );
                }}
              >
                Enable reminders
              </button>
            ) : (
              <>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const ok = await sendTestReminder();
                    setBusy(false);
                    setRmsg(ok ? 'Test sent. It should appear in a few seconds.' : 'The test did not go through. Try again, or turn reminders off and on.');
                  }}
                >
                  Send a test
                </button>
                <button
                  onClick={async () => {
                    await disableReminders();
                    setRemind(false);
                    setRmsg('Reminders are off.');
                  }}
                >
                  Turn off
                </button>
              </>
            )}
          </div>
        )}
        {rmsg && <small>{rmsg}</small>}
      </section>

      <section class="card rise" style="--i:2">
        <b>Backup</b>
        <p class="muted">All progress lives only on this phone. Save a copy now and then. Last backup: {s.lastBackup ? new Date(s.lastBackup).toLocaleDateString() : 'never'}.</p>
        <div class="row">
          <button class="primary" onClick={async () => setMsg(await backupNow())}>Export backup</button>
          <button onClick={() => fileRef.current?.click()}>Restore…</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        {msg && <small>{msg}</small>}
      </section>

      <Credits />

      <h2 class="rise" style="--i:3">Audio check</h2>
      <VoiceTest />
    </main>
  );
}
