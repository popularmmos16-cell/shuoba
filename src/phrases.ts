export interface Phrase {
  hanzi: string;
  py: string; // space-separated syllables
  en: string;
  words: string[]; // chunks that join back into hanzi, for sentence building
}

// Original starter phrases for the UI preview; the real content pack comes in a later stage.
export const PHRASES: Phrase[] = [
  { hanzi: '你好吗？', py: 'nǐ hǎo ma', en: 'How are you?', words: ['你好', '吗？'] },
  { hanzi: '多少钱？', py: 'duō shǎo qián', en: 'How much is it?', words: ['多少', '钱？'] },
  { hanzi: '我想喝咖啡。', py: 'wǒ xiǎng hē kā fēi', en: 'I’d like a coffee.', words: ['我', '想', '喝', '咖啡。'] },
  { hanzi: '我们一起吃饭吧。', py: 'wǒ men yī qǐ chī fàn ba', en: 'Let’s eat together.', words: ['我们', '一起', '吃饭', '吧。'] },
  { hanzi: '不好意思，请问厕所在哪里？', py: 'bù hǎo yì si qǐng wèn cè suǒ zài nǎ lǐ', en: 'Excuse me, where is the toilet?', words: ['不好意思，', '请问', '厕所', '在', '哪里？'] },
  { hanzi: '谢谢，不客气。', py: 'xiè xie bú kè qi', en: 'Thank you. You’re welcome.', words: ['谢谢，', '不客气。'] },
];

export const phraseOfTheDay = (d = new Date()) =>
  PHRASES[Math.floor(d.getTime() / 86_400_000) % PHRASES.length];
