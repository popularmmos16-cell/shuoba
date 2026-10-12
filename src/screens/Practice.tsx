export type Mode = 'tones' | 'listen';

const MODES: { id: Mode | 'soon'; glyph: string; title: string; blurb: string; time: string }[] = [
  { id: 'tones', glyph: '调', title: 'Tone ears', blurb: 'Hear a syllable and pick its tone. Trains the thing that matters most early on.', time: '~3 min' },
  { id: 'listen', glyph: '听', title: 'Listen & choose', blurb: 'Hear a whole phrase and pick what it means. No reading needed.', time: '~3 min' },
  { id: 'soon', glyph: '读', title: 'Short dialogues', blurb: 'Read and listen to mini conversations using words you know.', time: 'Coming soon' },
];

export function Practice({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <main class="screen">
      <h1 class="page-title rise" style="--i:0">Extra practice</h1>
      <p class="intro rise" style="--i:1">Totally optional. For days when you have a bit more time. It never affects your streak or daily goal.</p>
      {MODES.map((m, n) => (
        <button
          class={`card mode rise ${m.id === 'soon' ? 'soon' : ''}`}
          style={`--i:${n + 2}`}
          disabled={m.id === 'soon'}
          onClick={() => m.id !== 'soon' && onPick(m.id)}
        >
          <span class="glyph">{m.glyph}</span>
          <span class="mode-text">
            <b>{m.title}</b>
            <small>{m.blurb}</small>
          </span>
          <span class="time">{m.time}</span>
        </button>
      ))}
    </main>
  );
}
