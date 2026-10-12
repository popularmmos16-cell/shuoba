// Checking typed answers. Pinyin may be typed with tone marks (nǐ), tone numbers (ni3) or a mix, with or without
// spaces; ü may be ü, v or u:. English answers tolerate small typos and the usual "to " / article differences.

const TONE_MARKS: Record<string, [string, number]> = {};
for (const [base, marks] of Object.entries({ a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', v: 'ǖǘǚǜ' })) {
  [...marks].forEach((m, t) => (TONE_MARKS[m] = [base, t + 1]));
}

export interface Syl { base: string; tone: number }

// Split a pinyin string with tone marks (as stored in the data) into base letters and tone.
export function parseTarget(py: string): Syl[] {
  return py.trim().split(/\s+/).map((s) => {
    let tone = 5;
    let base = '';
    for (const ch of s.normalize('NFC').toLowerCase()) {
      if (TONE_MARKS[ch]) { base += TONE_MARKS[ch][0]; tone = TONE_MARKS[ch][1]; }
      else base += ch === 'ü' ? 'v' : ch;
    }
    return { base, tone };
  });
}

export type PinyinResult = { ok: true } | { ok: false; reason: 'letters' | 'tones' };

export function checkPinyin(input: string, target: Syl[]): PinyinResult {
  const s = input.normalize('NFC').toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v');
  let i = 0;
  const skipSep = () => { while (i < s.length && /[\s'’\-.,]/.test(s[i])) i++; };
  let tonesOk = true;
  for (const syl of target) {
    skipSep();
    let tone = 0; // 0 = none typed yet
    for (const want of syl.base) {
      const c = s[i];
      if (c === undefined) return { ok: false, reason: 'letters' };
      const m = TONE_MARKS[c];
      const letter = m ? m[0] : c;
      if (letter !== want) return { ok: false, reason: 'letters' };
      if (m) tone = m[1];
      i++;
    }
    if (i < s.length && /[0-5]/.test(s[i])) { tone = s[i] === '0' ? 5 : Number(s[i]); i++; }
    if ((tone || 5) !== syl.tone) tonesOk = false; // nothing typed counts as neutral
  }
  skipSep();
  if (i < s.length) return { ok: false, reason: 'letters' };
  return tonesOk ? { ok: true } : { ok: false, reason: 'tones' };
}

// "I; me" -> ["i", "me"];  "to be" -> ["to be", "be"];  "(general counting word)" -> [] (not typeable)
export function englishAnswers(gloss: string): string[] {
  const out = new Set<string>();
  for (const part of gloss.replace(/\([^)]*\)/g, '').split(';')) {
    const a = part.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!a) continue;
    out.add(a);
    const bare = a.replace(/^(to|a|an|the) /, '');
    if (bare) out.add(bare);
  }
  return [...out];
}

const SYNONYMS: Record<string, string[]> = {
  mum: ['mom', 'mother'], dad: ['father'], phone: ['telephone', 'cell phone', 'mobile phone', 'mobile'],
  'mobile phone': ['phone', 'cell phone', 'cellphone'], film: ['movie'], 'to be': ['be', 'is', 'am', 'are'],
  teacher: ['instructor'], tasty: ['delicious', 'yummy'], 'older brother': ['big brother', 'elder brother', 'brother'],
  'older sister': ['big sister', 'elder sister', 'sister'], 'younger brother': ['little brother', 'brother'],
  'younger sister': ['little sister', 'sister'], taxi: ['cab'], 'to buy': ['buy', 'purchase'], tired: ['exhausted'],
};

// Edit distance where swapping two neighbouring letters (the commonest typo) costs one edit.
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

export function checkEnglish(input: string, gloss: string): boolean {
  const typed = input.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!typed) return false;
  const good = englishAnswers(gloss);
  const all = new Set(good.flatMap((g) => [g, ...(SYNONYMS[g] ?? [])]));
  for (const g of all) {
    if (typed === g) return true;
    if (g.length >= 5 && distance(typed, g) <= 1) return true; // one typo is fine on longer answers
  }
  return false;
}

export const canTypeEnglish = (gloss: string) => englishAnswers(gloss).length > 0;
