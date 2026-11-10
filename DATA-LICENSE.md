# Content licence

The content in `src/data/` (phrases, sentences, English glosses, pronunciations) and `public/audio/` (spoken audio)
is licensed under **CC BY-SA 4.0** (https://creativecommons.org/licenses/by-sa/4.0/).

It includes pronunciation data derived from **CC-CEDICT** (CC BY-SA 4.0, https://cc-cedict.org/), which is why
the share-alike terms apply. Other sources and credits are listed in the app under Settings → Credits & licences.

- HSK word lists / level tags: Complete HSK Vocabulary (MIT) - https://github.com/drkameleon/complete-hsk-vocabulary
- Audio: generated with the macOS text-to-speech tool (`say`) and its Tingting voice (see `tools/gen-audio.py`).
- Reading-set sentences and their English translations (`tools/content/stories/t*.txt`, and the matching entries in `src/data/stories.json` and `public/audio/s/`) come from
  **Tatoeba** (https://tatoeba.org) and its contributors under **CC BY 2.0 FR** (https://creativecommons.org/licenses/by/2.0/fr/). They keep that licence and
  must be credited to Tatoeba and the named contributors, as the app does. The spoken clips for them are our own `say` renderings.
