export function speakZh(text: string, rate = 0.85) {
  if (!('speechSynthesis' in window)) return;
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = rate;
  speechSynthesis.speak(u);
}
