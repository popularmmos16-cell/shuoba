export interface Phrase {
  hanzi: string;
  py: string; // space-separated syllables
  en: string;
}

// Original starter phrases for the UI preview; the real content pack comes in a later stage.
export const PHRASES: Phrase[] = [
  { hanzi: '你好吗？', py: 'nǐ hǎo ma', en: 'How are you?' },
  { hanzi: '多少钱？', py: 'duō shǎo qián', en: 'How much is it?' },
  { hanzi: '我想喝咖啡。', py: 'wǒ xiǎng hē kā fēi', en: 'I’d like a coffee.' },
  { hanzi: '我们一起吃饭吧。', py: 'wǒ men yī qǐ chī fàn ba', en: 'Let’s eat together.' },
  { hanzi: '不好意思，请问厕所在哪里？', py: 'bù hǎo yì si qǐng wèn cè suǒ zài nǎ lǐ', en: 'Excuse me, where is the toilet?' },
  { hanzi: '谢谢，不客气。', py: 'xiè xie bú kè qi', en: 'Thank you. You’re welcome.' },
];

export const phraseOfTheDay = (d = new Date()) =>
  PHRASES[Math.floor(d.getTime() / 86_400_000) % PHRASES.length];
