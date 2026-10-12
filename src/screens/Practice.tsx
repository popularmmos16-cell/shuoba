import { QuietToggle } from '../components/QuietToggle';
import { useStore } from '../store';

export type Mode = 'tones' | 'listen' | 'read' | 'pinyin' | 'recall' | 'build';

interface Entry { id: Mode | 'soon'; glyph: string; title: string; blurb: string; time: string }

const SOUND: Entry[] = [
  { id: 'tones', glyph: '调', title: 'Tone ears', blurb: 'Hear a syllable and pick its tone.', time: '~3 min' },
  { id: 'listen', glyph: '听', title: 'Listen & choose', blurb: 'Hear a whole phrase and pick what it means.', time: '~3 min' },
];

const SILENT: Entry[] = [
  { id: 'read', glyph: '读', title: 'Read & choose', blurb: 'See the characters, pick the meaning.', time: '~2 min' },
  { id: 'recall', glyph: '想', title: 'Say it in Chinese', blurb: 'See the English, pick the right Chinese.', time: '~2 min' },
  { id: 'pinyin', glyph: '拼', title: 'Tones by sight', blurb: 'See a character, pick its pinyin and tone.', time: '~3 min' },
  { id: 'build', glyph: '排', title: 'Build the sentence', blurb: 'Put the pieces in the right order.', time: '~3 min' },
  { id: 'soon', glyph: '话', title: 'Short dialogues', blurb: 'Mini conversations using words you know.', time: 'Coming soon' },
];

function Card({ e, i, locked, onPick }: { e: Entry; i: number; locked: boolean; onPick: (m: Mode) => void }) {
  const off = locked || e.id === 'soon';
  return (
    <button class={`card mode rise ${off ? 'soon' : ''}`} style={`--i:${i}`} disabled={off} onClick={() => e.id !== 'soon' && onPick(e.id)}>
      <span class="glyph">{e.glyph}</span>
      <span class="mode-text"><b>{e.title}</b><small>{e.blurb}</small></span>
      <span class="time">{locked ? 'Needs sound' : e.time}</span>
    </button>
  );
}

export function Practice({ onPick }: { onPick: (m: Mode) => void }) {
  const { quiet } = useStore();
  return (
    <main class="screen">
      <h1 class="page-title rise" style="--i:0">Extra practice</h1>
      <p class="intro rise" style="--i:1">Totally optional. For days when you have a bit more time. It never affects your streak or daily goal.</p>
      <QuietToggle />

      <h2 class="rise" style="--i:2">Silent practice</h2>
      {SILENT.map((e, n) => <Card e={e} i={n + 3} locked={false} onPick={onPick} />)}

      <h2 class="rise" style="--i:8">With sound</h2>
      {SOUND.map((e, n) => <Card e={e} i={n + 9} locked={quiet} onPick={onPick} />)}
    </main>
  );
}
