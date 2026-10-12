import { toneOf } from '../tones';

export function Pinyin({ text }: { text: string }) {
  return (
    <span class="pinyin">
      {text.split(' ').map((s) => (
        <span class={`t${toneOf(s)}`}>{s}</span>
      ))}
    </span>
  );
}
