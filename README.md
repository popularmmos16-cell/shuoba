# Shuōba 说吧

A personal PWA for learning conversational Mandarin. Preact + TypeScript + Vite, installed to the iPhone Home Screen.
All progress lives on the device; the only server is a tiny Cloudflare Worker that sends reminder pushes.

## Quick start

```sh
npm install
npm run dev       # vite dev server, exposed on the LAN (--host) so a phone can load it
npm run build     # tsc --noEmit, then vite build into dist/
npm run preview   # serve dist/ (needed to test the service worker and push)
```

There is no test suite; `npm run build` (type check) is the only automated check.
Pushing to `main` deploys `dist/` to GitHub Pages via `.github/workflows/deploy.yml`.
`base` is `./`, so the app works from any sub-path.

## How the app works

Each day has a compulsory part and optional extras:

1. **Words (compulsory)** — `src/vocab.ts`, `src/screens/Vocab.tsx`. New words are shown, then tested with a mix of
   multiple-choice and typed questions. Rule: the *first* answer of the day decides. Right → streak +1, wrong → streak 0
   and back tomorrow. Streak 1 returns in 1 day, 2 in 2 days, 3 = mastered. Finishing the words keeps the day's streak.
   Limits: `MAX_ACTIVE` (20 unmastered at once), `MAX_DUE` (24 reviews/day), `typingNew` (new words/day, default 7).
2. **Phrases** — `src/srs.ts`, `src/screens/Learn.tsx`. FSRS scheduling (`ts-fsrs`), two cards per phrase
   (`read` and `listen`). Questions self-mark (no rating buttons): wrong = Again, slow (>20s) = Hard, else Good.
   `nextNew()` picks new items from the earliest unfinished unit and only brings in a sentence once its characters are taught.
3. **Extra practice** — `src/practice.ts`, `src/screens/Practice.tsx`, `Quiz.tsx`, `Build.tsx`. Tone ears, listen, read,
   recall, tones by sight, build the sentence. Draws only from phrases already started.
4. **Games** — `src/games/`, registry in `GAMES` in `src/game.ts`. One game per day on a fixed cycle (`gameOfToday`).
   Most are `Quizzer` configs in `src/games/specs.tsx`; `Match`, `Sprint`, `Echo`, `Typer`, `WordHunt` are custom.
5. **Reward layer** — `src/game.ts`: XP/levels, combos, daily quests, badges (`BADGES`), streak freezes. It never
   changes scheduling, and it all lives in the saved state so it is part of the backup.

### Source map

| Path | What |
|---|---|
| `src/App.tsx` | Tab bar, screen routing, kicks off lock-screen/widget sync and streak freezes |
| `src/store.ts` | Settings + game state in `localStorage` (`shuoba.state.v1`); `dateKey()`, streak maths |
| `src/db.ts` | IndexedDB (`shuoba`, v2) stores `cards`, `log`, `words`; backup export/import (`Backup`, version 1) |
| `src/phrases.ts` | Types and lookups over `src/data/phrases.json` (**generated**, see Content) |
| `src/speak.ts` | Plays `public/audio/**` via `<audio>`; falls back to `speechSynthesis` when no clip exists |
| `src/data/tones.json` | Tone-pair sets (4 characters each) for the tone exercises |
| `src/push.ts`, `src/lockscreen.ts`, `src/widget.ts` | Reminders, lock-screen word, Scriptable widget (see below) |
| `public/push-sw.js` | Push handler, imported into the generated service worker (`workbox.importScripts`) |
| `worker/` | Cloudflare Worker `shuoba-push` |
| `tools/` | Python content and audio generators |

Dates are **local** `YYYY-MM-DD` strings from `dateKey()` everywhere in the app. The Worker uses Singapore time (UTC+8).

## Content

`src/data/phrases.json` is generated. Do not edit it by hand; edit `tools/content/units.txt` and rebuild.

```
= Unit title                 starts a new unit
W 我们|we; us                a word (hanzi|English)
S 你好吗？|How are you?       a sentence
W 行|OK|py=xíng              optional py=... overrides the generated pinyin
```

```sh
CEDICT=/path/to/cedict_ts.u8 HSK=/path/to/complete.json python3 tools/build-content.py
```

Needs `jieba` and `pypinyin`, plus two downloads: CC-CEDICT (`cedict_ts.u8`) and the MIT-licensed
[Complete HSK Vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) `complete.json`.
The script segments sentences into tiles, picks pinyin, applies 不/一 tone sandhi, and prints a warning for any
sentence that uses a word not yet taught.

**Ids are positional.** Items get `p01, p02, ...` in file order, and saved progress and audio filenames use those ids.
Inserting a line in the middle shifts every later id and scrambles existing progress. **Only append**, and note that
appending to a unit other than the last one also shifts the ids of the units after it. The first 32 items are frozen in
`tools/content/legacy-phrases.json` for the same reason.

If you add a new unit, also check `THEMES` in `src/games/specs.tsx` (Odd One Out only uses themed units 1–8).

### Audio

```sh
python3 tools/gen-audio.py [--force]
```

macOS only (`say` with the Tingting voice, `afconvert`). Renders `public/audio/p/<id>.m4a` for every item and
`public/audio/t/<hex codepoint>.m4a` for every tone character. A clip is redone when it is missing or older than the
script, so editing the script refreshes everything and an interrupted run resumes. Run it after adding content,
then commit the new clips. Clips are files, not browser TTS, because iOS mutes `speechSynthesis` on silent.

## Reminders, lock-screen word and widget

All three depend on the Worker. Its URL and the VAPID public key are in `src/config.ts` (public values).

- **Push reminders** (`src/push.ts`): the Worker's cron fires at 06:00, 12:00, 18:00, 00:00 SGT and sends a *bodyless* push.
  `public/push-sw.js` decides what to show: a lock-screen word every slot, plus a study nudge at noon unless today's
  words are done. The app writes the learnt words and the done-date to the Cache API (`shuoba-lockscreen`,
  `lockscreen.json`) so the service worker can read them. Needs the app added to the Home Screen on iPhone.
- **Widget** (`src/widget.ts`): the app uploads the learnt words to the Worker under a random token kept in
  `localStorage`. Settings generates a Scriptable script (the `SCRIPT` template in `widget.ts`) that fetches them.
  Edit that template to change the widget layout, then re-paste it into Scriptable.
- **Worker** (`worker/src/index.js`, KV namespace `SUBS`, config in `worker/wrangler.toml`): endpoints `/subscribe`,
  `/unsubscribe`, `/done`, `/test`, `/progress` (GET and POST). It is capped at 5 subscribers and 5 widget tokens.

```sh
cd worker
npm install
npx wrangler secret put VAPID_PRIVATE_JWK   # private key, never committed (*.jwk is gitignored)
npm run dev                                 # wrangler dev --test-scheduled
npm run deploy
```

If you change the cron schedule in `wrangler.toml`, also update `SLOT_MS` in `public/push-sw.js` and the 6-hour `SLOT`
in the widget script, which assume 6-hour slots. `ALLOWED_ORIGIN` must match the site's origin (CORS).

## Data and backups

- Settings and game state: `localStorage`. Cards, review log and word progress: IndexedDB.
- Settings → backup exports all of it as one JSON file (`Backup` in `src/db.ts`). If you change the shape of stored
  data, keep old backups importable (see how `words?` is optional) or bump `version`.
- Device-specific flags (`shuoba.push`, `shuoba.widget`) are deliberately kept out of backups.

## Licences

Code: see `LICENSE`. Content in `src/data/` and `public/audio/`: CC BY-SA 4.0 (`DATA-LICENSE.md`), because it includes
CC-CEDICT-derived pronunciations. Credits shown in the app live in `src/components/Credits.tsx`.

> Known stale: `DATA-LICENSE.md` and `Credits.tsx` still say the audio comes from Piper / 超文. It is now generated
> with the macOS Tingting voice (see `tools/gen-audio.py`). Update both when you next touch licences.
