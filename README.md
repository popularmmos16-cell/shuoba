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

The app is a PWA with a service worker, so an installed copy updates in two steps: the new version downloads on one launch and takes over on
the next. After a deploy, close and reopen the Home Screen app twice (or load the site once in Safari) to see it.

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
4. **Your words** — `src/screens/Words.tsx`, `src/screens/Drill.tsx`. The front-and-centre card on Home is a wall of tiles, one per word
   you have started: pulsing when due, seal-red when mastered, three pips for the streak. Tap a tile for its detail; "See all" opens the
   full sheet (list or wall, filters, and a *cover the answers* switch to test yourself). **Drill** (10 questions) and **Blitz** (60 s,
   personal best in `gameBest.blitz`) run on those words any time: hanzi→meaning, meaning→hanzi, sound→hanzi, weak words more often.
   Drills earn XP and study time but never change the word schedule. They feed the "Drill 20 words" daily quest.
5. **Games** — `src/games/`, registry in `GAMES` in `src/game.ts`. One game per day on a fixed cycle (`gameOfToday`).
   Most are `Quizzer` configs in `src/games/specs.tsx`; `Match`, `Sprint`, `Echo`, `Typer`, `WordHunt` are custom.
6. **Read** — `src/stories.ts`, `src/screens/Read.tsx`, `ReadStory.tsx`. Short graded stories (a sixth tab). Each story shows how much of it you
   already know (words you have started, plus a few grammar words), underlines the words you have not met, and lets you tap any word for its
   pinyin, meaning and audio and add it to your Word wall (`newWordRow`, capped by `MAX_ACTIVE`). Reading earns a little XP once per story per
   day (`finishStory`) and never changes the word schedule. Stories are written offline and shipped as data. See "Stories" below.
7. **Chat** — `src/chat.ts`, `src/screens/Chat.tsx`, `ChatSession.tsx`, `ChatReview.tsx`. A conversation partner: you pick an
   AI character, chat in Chinese, and a wrong sentence gets a natural "啊？" instead of a correction. "End & review" shows
   the transcript with your mistakes marked and corrected. See "Chat partner" below.
8. **Reward layer** — `src/game.ts`: XP/levels, combos, daily quests, badges (`BADGES`), streak freezes. It never
   changes scheduling, and it all lives in the saved state so it is part of the backup.

### Source map

| Path | What |
|---|---|
| `src/App.tsx` | Tab bar, screen routing, kicks off lock-screen/widget sync and streak freezes |
| `src/store.ts` | Settings + game state in `localStorage` (`shuoba.state.v1`); `dateKey()`, streak maths |
| `src/db.ts` | IndexedDB (`shuoba`, v2) stores `cards`, `log`, `words`; backup export/import (`Backup`, version 1) |
| `src/phrases.ts` | Types and lookups over `src/data/phrases.json` (**generated**, see Content) |
| `src/stories.ts` | Types over `src/data/stories.json`, `tokenState()` and `coverage()` (how much of a story you already know) |
| `src/data/stories.json` | **Generated** from `tools/content/stories/*.txt` by `tools/build-stories.py` |
| `src/screens/Read.tsx`, `ReadStory.tsx` | The Read tab: the story and reading-set list, and the reader with tap-for-meaning and add-to-words |
| `src/speak.ts` | Plays `public/audio/**` via `<audio>`; falls back to `speechSynthesis` when no clip exists |
| `src/data/tones.json` | Tone-pair sets (4 characters each) for the tone exercises |
| `src/push.ts`, `src/lockscreen.ts`, `src/widget.ts` | Reminders, lock-screen word, Scriptable widget (see below) |
| `public/push-sw.js` | Push handler, imported into the generated service worker (`workbox.importScripts`) |
| `worker/` | Cloudflare Worker `shuoba-push` |
| `tools/` | Content and audio generators (see below). `zhlib.py` holds the pinyin and segmentation code shared by the build scripts |

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

Needs `jieba` and `pypinyin` (plus `opencc-python-reimplemented` for `build-tatoeba.py`; a virtualenv keeps them out of your system Python),
and two downloads: CC-CEDICT (`cedict_ts.u8`) and the MIT-licensed
[Complete HSK Vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) `complete.json`.
The script segments sentences into tiles, picks pinyin, applies 不/一 tone sandhi, and prints a warning for any
sentence that uses a word not yet taught.

**Ids are positional.** Items get `p01, p02, ...` in file order, and saved progress and audio filenames use those ids.
Inserting a line in the middle shifts every later id and scrambles existing progress. **Only append**, and note that
appending to a unit other than the last one also shifts the ids of the units after it. The first 32 items are frozen in
`tools/content/legacy-phrases.json` for the same reason.

If you add a new unit, also check `THEMES` in `src/games/specs.tsx` (Odd One Out only uses themed units 1–8).

### Stories

The Read tab has two kinds of content, both built from files in `tools/content/stories/` by one script:

- **Stories** (`s01.txt` ...): hand-written, cohesive.
- **Reading sets** (`t01.txt` ...): six unrelated everyday sentences per set, grouped by unit, picked from Tatoeba.

Story ids come from the file name, so adding, editing or deleting one never shifts anything (unlike phrases).

```
kind: set                          optional: "set" for a reading set, default "story"
title: 朋友来我家|A friend comes to my home
今天我朋友来我家。|Today my friend comes to my home.
我们喝茶。|We drink tea.|tatoeba:12345:someone     optional third field: a Tatoeba sentence id and its contributor
```

Pipeline, in this order (the build scripts take `CEDICT=... HSK=...` as for the phrases):

```sh
python3 tools/build-content.py   # only if units.txt changed
python3 tools/build-stories.py   # tools/content/stories/*.txt -> src/data/stories.json
python3 tools/gen-audio.py       # renders only the missing clips, including story sentences
```

`build-stories.py` does the segmentation and pinyin here, at build time, so the phone never segments Chinese. Every word in a story should be a
taught word (a `W` line in `units.txt`), because that is what makes it addable to the Word wall in the app. The script lists any word outside the
curriculum: reword the sentence, or append the word to `units.txt`. Grammar words that are never taught as vocabulary (了 吗 呢 ...) are in
`FUNCTION_WORDS` and always count as known. Their meanings, and the meanings of any outside word, come from `tools/content/glosses.txt`
(`hanzi|gloss`), then the HSK data. The HSK's first entry is often a rare sense (it gives 也 as "surname Ye"), so add a line to `glosses.txt`
when a tapped word shows something odd.

How the app uses it: a word is **known** when you have started it (a row in the `words` store) or it is a grammar word. `coverage()` is
the share of word occurrences in a story that are known; stories are listed easiest first. Tapping a word you have not started offers
"Add to my words", which creates the same row the Word practice would (`newWordRow`), limited by `MAX_ACTIVE`. Finishing a story gives
`STORY_XP` once per story per day (`finishStory`), and the day is kept in `storiesRead` in the saved state, which is part of the backup.

**Reading sets from Tatoeba.** `tools/build-tatoeba.py` writes `t01.txt` ... (it deletes and recreates all `t*.txt`, so do not hand-edit those).

```sh
# unpack these from https://downloads.tatoeba.org/exports/per_language/ into one folder:
#   cmn/cmn_sentences_detailed.tsv.bz2  cmn/cmn-eng_links.tsv.bz2  eng/eng_sentences.tsv.bz2
TAT=/path/to/that/folder CEDICT=... HSK=... python3 tools/build-tatoeba.py [--per-unit 3] [--size 6]
```

It keeps a sentence only when every word is a taught or grammar word, the characters are simplified, and it has no names, quotes, digits or Latin
letters. Contributors with many sentences are preferred and repeated sentence templates are limited. The result is deterministic. These are
volunteer-written sentences, so skim them: to drop one, delete its line (or the whole `tNN.txt`) and re-run `build-stories.py`, but re-running
`build-tatoeba.py` brings every line back. Tatoeba's own audio is not used, because its licences vary per speaker; the app's clips are made with `say`.

**Drafting stories with AI** (`tools/make-stories.mjs`, with the local-only proxy in `tools/story-proxy/`, never to be deployed) works poorly from a
200-word vocabulary: in testing the drafts were choppy and sometimes ungrammatical, and the AI judge missed real errors. Treat its output
(`tools/content/stories/drafts/`) as raw material and have someone who reads Chinese check every story before moving it up a folder.

### Audio

```sh
python3 tools/gen-audio.py [--force]
```

macOS only (`say` with the Tingting voice, `afconvert`). Renders `public/audio/p/<id>.m4a` for every item and
`public/audio/t/<hex codepoint>.m4a` for every tone character, and `public/audio/s/<story id>-<n>.m4a` for every story sentence.
A clip is redone when it is missing or older than the script (file time, so a fresh clone may re-render everything), so editing the script refreshes everything and an interrupted run resumes. Run it after adding content,
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
  `/unsubscribe`, `/done`, `/test`, `/progress` (GET and POST), and `/chat` and `/review` (see Chat partner). It is capped
  at 5 subscribers and 5 widget tokens.

```sh
cd worker
npm install
npx wrangler secret put VAPID_PRIVATE_JWK   # private key, never committed (*.jwk is gitignored)
npm run dev                                 # wrangler dev --test-scheduled
npm run deploy
```

If you change the cron schedule in `wrangler.toml`, also update `SLOT_MS` in `public/push-sw.js` and the 6-hour `SLOT`
in the widget script, which assume 6-hour slots. `ALLOWED_ORIGIN` must match the site's origin (CORS).

## Chat partner

Runs on **Cloudflare Workers AI** through the `[ai]` binding in `worker/wrangler.toml` (no API key). All prompts and the
characters live in `worker/src/chat.js`; the app can only choose a character and send the chat plus the hanzi words you have
learnt, so it cannot change the prompt.

- `POST /chat`: two calls run side by side. One model (Qwen3-30B, `TALK_MODEL`) writes the character's reply. Another
  (gpt-oss-120b, `JUDGE_MODEL`) strictly checks your latest message. If it finds a mistake the reply is thrown away and the
  Worker answers with a "huh?" from a fixed list (a second miss in a row uses another list; a third makes the character
  gently move on). The mistake's correction is returned as `note` and stored on that message.
- `POST /review`: the end-of-chat pass over the whole transcript with the judge model. The app merges it with the `note`s
  (`mergeMistakes` in `src/chat.ts`) so every "huh?" has an explanation.
- Why two models: in testing the judge never flagged a correct sentence and gave accurate English reasons; Qwen3 was faster
  and sounded more natural but false-alarmed and sometimes explained rules wrongly. Re-run a batch of correct and wrong
  sentences through `/chat` after changing a prompt or a model.
- Qwen3 needs `/no_think` appended to the last user message (`run()` does it), or it returns empty content.
  gpt-oss takes `reasoning_effort: 'low'` for the quick per-message check.
- Guardrails: the token must look like a random token; at most 5 devices (`MAX_CHAT_USERS`); 150 calls per device per day
  (`MAX_PER_DAY`, a review counts 3); history, message and word-list sizes are capped; only hanzi words are ever put in a
  prompt; the character answers honestly if sincerely asked whether it is an AI. The free Workers AI allowance is 10,000
  neurons a day; a chat turn costs roughly 20, a review roughly 80. Every call also writes one KV record, and the free KV
  plan allows 1,000 writes a day (shared with push and widget syncs). Past that, calls fail (nothing is billed) until 00:00 UTC.
- Chats live only on the phone (`shuoba.chats`, the unfinished one in `shuoba.chat.draft`, the device token in
  `shuoba.chat`). They are **not** part of the backup file.
- Voice: replies are read aloud with `speakZh` (browser speech, so the iPhone silent switch mutes them). To speak instead of
  type, use the dictation key on the iOS Chinese keyboard.

## Data and backups

- Settings and game state: `localStorage`. Cards, review log and word progress: IndexedDB.
- Settings → backup exports all of it as one JSON file (`Backup` in `src/db.ts`). If you change the shape of stored
  data, keep old backups importable (see how `words?` is optional) or bump `version`.
- Words added from a story are ordinary rows in the `words` store, and finished stories (`storiesRead`) are in the saved state, so both are in the backup.
- Device-specific flags (`shuoba.push`, `shuoba.widget`, `shuoba.chat*`) are deliberately kept out of backups.

## Project notes (read this before changing things)

State and decisions that are not obvious from the code.

**Status of the Read tab** (added Nov 2026, merged to `main`). Two hand-written stories (`s01`, `s02`) and 27 Tatoeba reading sets (`t01`-`t27`).
**Nobody who reads Chinese has reviewed them yet**, and Tatoeba's licence terms were taken from secondary research, not read on tatoeba.org.
Neither was tested on a real iPhone (sentence audio with the silent switch, offline use). Treat all three as open items.

**Why stories are shipped as data and not generated live.** Spikes run against the deployed Workers AI models (Qwen3-30B and gpt-oss-120b) on a
60/120/199-word vocabulary showed that models do not stay inside a small vocabulary: first-try coverage was about 66-70%, retries pushed
coverage up only by making the text choppy ("我有面。我有茶。"), and the AI judge missed real errors (去家吃饭). With a ~90% target and dictionary
glosses it still passed only ~4 of 15 times. So stories are written or picked offline and checked by a person. If you revisit live generation,
use gpt-oss (Qwen3 mostly failed and wrote traditional characters), keep the best attempt rather than the last, and check coverage in code.

**Why no open-licensed story library.** Searched GitHub, Hugging Face, Tatoeba lists, Chinese Wikibooks and Wikisource. Graded-reader
publishers are copyrighted; Tatoeba's lists are study decks; the usable Wikisource tales (Dai Wangshu's Perrault) are 1930s traditional-character
prose with only ~46-53% of words in the 199-word curriculum. Cohesive stories that fit the curriculum have to be written or adapted for it. Tatoeba
sentences are the one measured fit (about 1,300 usable sentences fully inside the curriculum).

**Rules that are easy to break**
- `phrases.json` ids are positional (append only). Story ids are file names and are safe to add or remove.
- `build-tatoeba.py` deletes and rewrites every `tools/content/stories/t*.txt`. Never hand-edit those; edit by deleting lines and running only `build-stories.py`.
- Words in a story must be taught words (`W` lines in `units.txt`) so they can be added to the Word wall. Do not make `ReadStory` add words that are not in `WORDS`.
- Reading must never change the word schedule (like Drill); it only gives XP via `finishStory`.
- Keep the `tatoeba:<id>:<contributor>` field on Tatoeba sentences: the app's credit line and source links depend on it.
- `tools/story-proxy/` is an unauthenticated AI passthrough for local authoring only. Never deploy it.
- Segmentation and pinyin happen at build time (`zhlib.py`, jieba). The app has no segmenter; `Intl.Segmenter` was not tested on iOS Safari.
- Grammar-word meanings come from `tools/content/glosses.txt`. The HSK data's first sense is often wrong for particles.

**Recreating the build environment.** The content scripts need Python packages and two data files that are not in the repo. A working setup:

```sh
python3 -m venv .venv-content && .venv-content/bin/pip install jieba pypinyin opencc-python-reimplemented
# CC-CEDICT: https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip  (unzip -> cedict_ts.u8)
# HSK data:  https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json
export CEDICT=/path/to/cedict_ts.u8 HSK=/path/to/complete.json
.venv-content/bin/python tools/build-stories.py
```

A virtualenv in the repo root would be untracked clutter: add it to `.gitignore` if you use that name. Checking a change to the shared code in `zhlib.py`
is easy: rebuild with `build-content.py` and confirm `git diff src/data/phrases.json` is empty.

**Checking the UI without a phone.** There is no test suite. To drive the app in a browser, run `npx vite --port 5199 --strictPort`, then use
Playwright against `http://localhost:5199`; to see Read content you must first seed started words into IndexedDB (database `shuoba`, store `words`,
rows shaped like `WordRow`). A deployed update only reaches an installed iPhone app after two launches (service worker), so "I don't see it" right after a
deploy is usually the cache, not a failed deploy: check that the live bundle contains the new text before debugging the code.

**Ideas not done.** Real hand-written stories; a native reviewer; counting how often you meet each word while reading (not tracked today);
a "saved words" store for words outside the curriculum (would need an IndexedDB version bump and a backup `version` bump); live per-learner
generation if models improve.

## Licences

Code: see `LICENSE`. Content in `src/data/` and `public/audio/`: CC BY-SA 4.0 (`DATA-LICENSE.md`), because it includes
CC-CEDICT-derived pronunciations. Credits shown in the app live in `src/components/Credits.tsx`.

The reading sets are sentences and translations from [Tatoeba](https://tatoeba.org) and its contributors, under CC BY 2.0 FR, which requires
crediting Tatoeba and the authors. The app does this in three places: the credit line under each set, a link to each source sentence, and the
Credits screen. Keep the `tatoeba:<id>:<contributor>` field on every sentence you add. This README does not settle licence questions: read
Tatoeba's own terms before you publish.
