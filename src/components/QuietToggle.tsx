import { update, useStore } from '../store';

export function setQuiet(on: boolean) {
  if (on && 'speechSynthesis' in window) speechSynthesis.cancel();
  update({ quiet: on });
}

export function QuietToggle() {
  const s = useStore();
  return (
    <button class={`card quiet ${s.quiet ? 'on' : ''}`} role="switch" aria-checked={s.quiet} onClick={() => setQuiet(!s.quiet)}>
      <span class="mode-text">
        <b>{s.quiet ? 'Quiet mode is on' : 'Can’t listen right now?'}</b>
        <small>{s.quiet ? 'Sound is off. Listening practice is swapped for silent practice.' : 'Turn sound off and practise silently instead.'}</small>
      </span>
      <span class="switch"><i /></span>
    </button>
  );
}
