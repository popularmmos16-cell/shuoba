import { PUSH_URL } from './config';
import { learntWords } from './lockscreen';
import type { WordRow } from './vocab';

// Lock-screen widget through the Scriptable app. The widget script has no access to this app's storage, so the
// learnt words are copied to the reminder service under a random token made on this phone (kept out of the backup
// file: it belongs to one device). The token is the only key to that list; it holds no name or other identity.

const FLAG = 'shuoba.widget';

export const widgetToken = (): string | null => {
  try {
    return localStorage.getItem(FLAG);
  } catch {
    return null;
  }
};

function makeToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function syncWidget(rows: WordRow[]): Promise<boolean> {
  const token = widgetToken();
  if (!token || !PUSH_URL) return false;
  try {
    const res = await fetch(PUSH_URL + '/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, words: learntWords(rows) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Four words at a time, moving on to the next four every 6 hours.
const SCRIPT = `// Shuōba lock-screen word. Made by the app: paste into Scriptable and save.
const API = '__API__';
const TOKEN = '__TOKEN__';
const SLOT = 6 * 3600 * 1000;

const fm = FileManager.local();
const cache = fm.joinPath(fm.cacheDirectory(), 'shuoba-words.json');
let words = [];
try {
  const data = await new Request(API + '/progress?t=' + TOKEN).loadJSON();
  words = data.words || [];
  fm.writeString(cache, JSON.stringify(words));
} catch (e) {
  if (fm.fileExists(cache)) words = JSON.parse(fm.readString(cache));
}

const now = Date.now();
const SHOWN = 4;
const count = Math.min(SHOWN, words.length);
const first = (Math.floor(now / SLOT) * SHOWN) % Math.max(words.length, 1);
const shown = [];
for (let i = 0; i < count; i++) shown.push(words[(first + i) % words.length]);
const family = config.widgetFamily;
const small = family === 'accessoryRectangular' || family === 'accessoryInline';
const widget = new ListWidget();
if (!shown.length) {
  widget.addText('Learn words in Shuōba first');
} else if (family === 'accessoryInline') {
  widget.addText(shown.map((w) => w.hanzi).join(' '));
} else {
  widget.spacing = small ? 1 : 6;
  for (const w of shown) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.bottomAlignContent();
    row.spacing = 6;
    const h = row.addText(w.hanzi);
    h.font = Font.semiboldSystemFont(small ? 15 : 28);
    h.lineLimit = 1;
    const t = row.addText(w.py + ' · ' + w.en);
    t.font = Font.systemFont(small ? 9 : 13);
    t.minimumScaleFactor = 0.5;
    t.lineLimit = 1;
  }
}
widget.refreshAfterDate = new Date((Math.floor(now / SLOT) + 1) * SLOT);
if (config.runsInWidget) Script.setWidget(widget);
else widget.presentMedium();
Script.complete();
`;

// Makes the token on first use, uploads the words, and returns the script to paste into Scriptable.
export function widgetScript(): string {
  let token = widgetToken();
  if (!token) {
    token = makeToken();
    try {
      localStorage.setItem(FLAG, token);
    } catch {
      /* ignore */
    }
  }
  return SCRIPT.replace('__API__', PUSH_URL).replace('__TOKEN__', token);
}
