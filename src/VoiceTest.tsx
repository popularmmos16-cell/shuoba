import { useEffect, useState } from 'preact/hooks';

const SAMPLES: { hanzi: string; pinyin: string; tones: number[]; note: string }[] = [
  { hanzi: '妈', pinyin: 'mā', tones: [1], note: 'tone 1' },
  { hanzi: '麻', pinyin: 'má', tones: [2], note: 'tone 2' },
  { hanzi: '马', pinyin: 'mǎ', tones: [3], note: 'tone 3' },
  { hanzi: '骂', pinyin: 'mà', tones: [4], note: 'tone 4' },
  { hanzi: '你好，很高兴认识你。', pinyin: 'nǐ hǎo, hěn gāoxìng rènshi nǐ', tones: [], note: 'sentence' },
  { hanzi: '我想吃鸡饭，你呢？', pinyin: 'wǒ xiǎng chī jī fàn, nǐ ne', tones: [], note: 'sentence' },
  { hanzi: '不好意思，请问地铁站在哪里？', pinyin: 'bù hǎo yìsi, qǐngwèn dìtiě zhàn zài nǎlǐ', tones: [], note: 'sentence' },
];

export function VoiceTest() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [uri, setUri] = useState('');
  const [rate, setRate] = useState(0.85);
  const [log, setLog] = useState<string[]>([]);
  const note = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 8));
  const supported = 'speechSynthesis' in window;

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const zh = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('zh'));
      setVoices(zh);
      setUri((cur) => cur || zh.find((v) => v.lang === 'zh-CN')?.voiceURI || zh[0]?.voiceURI || '');
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const speak = (text: string, useVoice = true) => {
    // cancel() right before speak() can silently drop the utterance on iOS, so only cancel when busy
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find((x) => x.voiceURI === uri);
    if (useVoice && v) u.voice = v;
    u.lang = (useVoice && v?.lang) || 'zh-CN';
    u.rate = rate;
    u.volume = 1;
    u.onstart = () => note(`start: ${useVoice && v ? v.name : 'default voice'}`);
    u.onend = () => note('end');
    u.onerror = (e) => note(`ERROR: ${e.error}`);
    note('speak() called');
    speechSynthesis.speak(u);
  };

  const beep = () => {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      o.connect(ctx.destination);
      o.frequency.value = 440;
      o.start();
      o.stop(ctx.currentTime + 0.4);
      note(`beep played (audio ${ctx.state})`);
    } catch (e) {
      note(`beep failed: ${e}`);
    }
  };

  const standalone = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;

  return (
    <main>
      <h1>Shuōba 说吧</h1>
      <p class="sub">Stage 1: voice test</p>

      <div class="card">
        <small>
          Installed to Home Screen: <b>{standalone ? 'yes' : 'no'}</b> · speech: <b>{supported ? 'available' : 'missing'}</b> ·
          Chinese voices found: <b>{voices.length}</b>
        </small>
      </div>

      <div class="card">
        <div class="row">
          <button onClick={beep}>🔔 Beep test</button>
          <button onClick={() => speak('你好', false)}>▶ 你好 (default voice)</button>
          <button onClick={() => speak('hello')}>▶ English test</button>
        </div>
        <small>Check ringer is on (silent switch), volume up, and Silent Mode off. Log:</small>
        {log.map((l) => (
          <div><small>{l}</small></div>
        ))}
      </div>

      {voices.length > 0 && (
        <>
          <label>
            <small>Voice</small>
            <select value={uri} onChange={(e) => setUri((e.target as HTMLSelectElement).value)}>
              {voices.map((v) => (
                <option value={v.voiceURI}>
                  {v.name} ({v.lang}){v.localService ? '' : ' – online'}
                </option>
              ))}
            </select>
          </label>
          <label>
            <small>Speed {rate.toFixed(2)}</small>
            <input
              type="range" min="0.5" max="1.1" step="0.05" value={rate} style="width:100%"
              onInput={(e) => setRate(parseFloat((e.target as HTMLInputElement).value))}
            />
          </label>
        </>
      )}
      {supported && voices.length === 0 && (
        <div class="card">No Chinese voice listed. Add one in Settings → Accessibility → Spoken Content → Voices → Chinese, then reopen the app.</div>
      )}

      {SAMPLES.map((s) => (
        <div class="card">
          <div class="hanzi">{s.hanzi}</div>
          <div class="pinyin">{s.pinyin}</div>
          <small>{s.note}</small>
          <div class="row"><button class="primary" onClick={() => speak(s.hanzi)}>▶ Play</button></div>
        </div>
      ))}
    </main>
  );
}
