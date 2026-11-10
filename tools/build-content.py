#!/usr/bin/env python3
"""Build src/data/phrases.json from tools/content/units.txt.

Pronunciations come from CC-CEDICT (via the MIT-licensed HSK 3.0 data, which embeds it) with pypinyin as a
fallback; sentences are split into word chunks with jieba. Prints warnings for sentences that use words
not yet taught. The first 32 items (ids p01-p32) are frozen in legacy-phrases.json so saved progress keeps
pointing at the same content.

  CEDICT=.../cedict_ts.u8 HSK=.../complete.json python3 tools/build-content.py
"""
import json, re
from zhlib import ROOT, chunk_pinyin, hanzi_only, hsk_freq, hsk_level, sandhi, segment

# --- parse units ------------------------------------------------------------------------------------------
legacy = json.load(open(ROOT / "tools/content/legacy-phrases.json"))
items, seen = [], set()
for p in legacy:
    p = {**p, "kind": "phrase", "unit": 0}
    items.append(p); seen.add(p["hanzi"])

unit, n = 0, len(items)
for raw in (ROOT / "tools/content/units.txt").read_text(encoding="utf8").splitlines():
    if raw.startswith("="): unit += 1; continue
    m = re.match(r"([WS]) ([^|]+)\|([^|]+)(?:\|py=(.+))?$", raw)
    if not m: continue
    kind, hanzi, en, py_over = m.group(1), m.group(2).strip(), m.group(3).strip(), m.group(4)
    if hanzi in seen: print("skip duplicate", hanzi); continue
    seen.add(hanzi); n += 1
    chunks = [hanzi] if kind == "W" else segment(hanzi)
    assert "".join(chunks) == hanzi, (hanzi, chunks)
    pys = [chunk_pinyin(hanzi_only(c)) if hanzi_only(c) else [] for c in chunks]
    flat = [s for p in pys for s in p]
    sandhi("".join(hanzi_only(c) for c in chunks), flat)
    py = py_over.strip() if py_over else " ".join(flat)
    assert len(py.split()) == len(hanzi_only(hanzi)), (hanzi, py)
    it = {"id": f"p{n:02d}", "hanzi": hanzi, "py": py, "en": en, "words": chunks, "kind": "word" if kind == "W" else "phrase", "unit": unit}
    if kind == "W" and hanzi in hsk_level: it["hsk"] = hsk_level[hanzi]
    if kind == "W" and hanzi in hsk_freq: it["freq"] = hsk_freq[hanzi]
    items.append(it)

# --- graded-ness check: every chunk of a sentence should already be taught --------------------------------
known, warnings = set(), 0
for it in items:
    if it["kind"] == "word": known.add(it["hanzi"]); continue
    for c in it["words"]:
        h = hanzi_only(c)
        if h and h not in known and not all(ch in known for ch in h):
            warnings += 1; print(f"  new word in {it['id']} {it['hanzi']}: {h}")
    known.update(hanzi_only(c) for c in it["words"])
print(f"{len(items)} items ({sum(i['kind']=='word' for i in items)} words), {warnings} untaught-word warnings")

json.dump(items, open(ROOT / "src/data/phrases.json", "w"), ensure_ascii=False, indent=1)
