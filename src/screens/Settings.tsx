import { useRef, useState } from 'preact/hooks';
import { dateKey, update, useStore } from '../store';
import { exportData, importData } from '../db';
import { VoiceTest } from '../VoiceTest';
import { QuietToggle } from '../components/QuietToggle';
import { Credits } from '../components/Credits';

const GOALS = [10, 15, 20, 30];
const NEWS = [4, 6, 8, 12];

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
        <b>New phrases per day</b>
        <div class="seg">
          {NEWS.map((n) => (
            <button class={s.newPerDay === n ? 'on' : ''} onClick={() => update({ newPerDay: n })}>{n}</button>
          ))}
        </div>
      </section>

      <QuietToggle />

      <section class="card rise" style="--i:2">
        <b>Reminders</b>
        <p class="muted">Daily reminder at 12:00 (Singapore time). Coming in a later stage.</p>
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
