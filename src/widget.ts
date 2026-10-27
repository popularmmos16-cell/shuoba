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

// Same 6-hour rotation as the lock-screen notification, so the two always show the same word.
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
const w = words.length ? words[Math.floor(now / SLOT) % words.length] : null;
const family = config.widgetFamily;
const widget = new ListWidget();
if (!w) {
  widget.addText('Learn words in Shuōba first');
} else if (family === 'accessoryInline') {
  widget.addText(w.hanzi + ' ' + w.py);
} else {
  const h = widget.addText(w.hanzi);
  h.font = Font.semiboldSystemFont(family === 'accessoryRectangular' ? 26 : 44);
  const s = widget.addText(w.py + ' · ' + w.en);
  s.font = Font.systemFont(11);
  s.minimumScaleFactor = 0.6;
  s.lineLimit = 2;
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
