import { isQuiet } from './store';
import { PHRASES } from './phrases';
import TONES from './data/tones.json';

// Recorded clips play through an <audio> element, which iOS lets through even when the ringer is on silent.
// The browser's speech engine does not, so it is only the fallback for text without a clip.
const CLIPS = new Map<string, string>();
PHRASES.forEach((p) => CLIPS.set(p.hanzi, `./audio/p/${p.id}.m4a`));
TONES.forEach((s) => s.chars.forEach((c) => CLIPS.set(c, `./audio/t/${c.codePointAt(0)!.toString(16)}.m4a`)));

let el: HTMLAudioElement | null = null; // one shared element, so iOS keeps it unlocked after the first tap

function tts(text: string, rate: number) {
  if (!('speechSynthesis' in window)) return;
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = rate;
  speechSynthesis.speak(u);
}

export function speakZh(text: string, rate = 0.85) {
  if (isQuiet()) return;
  const src = CLIPS.get(text);
  if (!src) return tts(text, rate);
  el ??= new Audio();
  el.pause();
  el.src = src;
  el.play().catch(() => tts(text, rate));
}
