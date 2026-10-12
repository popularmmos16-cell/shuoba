#!/usr/bin/env python3
"""Build src/data/phrases.json from tools/content/units.txt.

Pronunciations come from CC-CEDICT (via the MIT-licensed HSK 3.0 data, which embeds it) with pypinyin as a
fallback; sentences are split into word chunks with jieba. Prints warnings for sentences that use words
not yet taught. The first 32 items (ids p01-p32) are frozen in legacy-phrases.json so saved progress keeps
pointing at the same content.

  CEDICT=.../cedict_ts.u8 HSK=.../complete.json python3 tools/build-content.py
"""
import json, os, re, sys, unicodedata
from pathlib import Path
import jieba
from pypinyin import lazy_pinyin, Style

ROOT = Path(__file__).resolve().parent.parent
HSK = json.load(open(os.environ["HSK"]))
CEDICT = Path(os.environ["CEDICT"])

def strip_tones(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).replace("ü", "u").lower()

def tone_of(s):
    for c in unicodedata.normalize("NFC", s):
        if c in "āēīōūǖ": return 1
        if c in "áéíóúǘ": return 2
        if c in "ǎěǐǒǔǚ": return 3
        if c in "àèìòùǜ": return 4
    return 5

VOW = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}
def numeric_to_marked(syl):
    m = re.fullmatch(r"([a-zü]+)([1-5])?", syl.lower().replace("u:", "ü"))
    if not m: raise ValueError(syl)  # e.g. "A", "xx5", "·": not a plain syllable, entry is skipped
    base, t = m.group(1), int(m.group(2) or 5)
    if t == 5: return base
    for pat in ("a", "e", "ou"):
        if pat in base:
            i = base.index(pat)
            return base[:i] + VOW[pat[0]][t - 1] + base[i + 1:]
    idx = max(i for i, c in enumerate(base) if c in VOW)
    return base[:idx] + VOW[base[idx]][t - 1] + base[idx + 1:]

# --- dictionaries -----------------------------------------------------------------------------------------
hsk_py, hsk_level = {}, {}
for w in HSK:
    s = w["simplified"]
    hsk_py.setdefault(s, [f["transcriptions"]["pinyin"].lower().split() for f in w["forms"]])
    lv = [int(l.split("-")[1]) for l in w["level"] if l.startswith("new-")]
    if lv: hsk_level[s] = min(lv)

cedict = {}
for line in CEDICT.read_text(encoding="utf8").splitlines():
    if line.startswith("#"): continue
    m = re.match(r"(\S+) (\S+) \[([^\]]+)\] /", line)
    if m:
        try:
            cedict.setdefault(m.group(2), []).append([numeric_to_marked(x) for x in m.group(3).split()])
        except ValueError:
            pass

def readings(chunk):
    out = list(hsk_py.get(chunk, [])) + cedict.get(chunk, [])
    return [r for r in out if len(r) == len(chunk)]

def chunk_pinyin(chunk):
    ref = lazy_pinyin(chunk, style=Style.TONE)
    cands = readings(chunk)
    for r in cands:  # prefer the dictionary reading that agrees with pypinyin on every non-neutral syllable
        if all(strip_tones(a) == strip_tones(b) and (tone_of(a) == 5 or tone_of(a) == tone_of(b)) for a, b in zip(r, ref)):
            return r
    return cands[0] if len(cands) == 1 and all(strip_tones(a) == strip_tones(b) for a, b in zip(cands[0], ref)) else ref

POTENTIAL = {"听不懂", "看不懂", "买不起", "说不好"}  # verb + 不 + complement: neutral bu

def sandhi(hz, syl):
    """Apply 不 / 一 tone changes over the whole text (dictionary readings only carry the base tone).
    不 -> bú before a 4th tone, neutral "bu" in A不A (累不累), otherwise bù.
    一 -> yí before a 4th tone or a neutral syllable that was 4th (一个), yì before 1st/2nd/3rd,
    and stays yī when alone, last, or after an ordinal/number (第一, 十一)."""
    for k, ch in enumerate(hz):
        if ch not in "不一" or len(hz) == 1: continue
        nxt = tone_of(syl[k + 1]) if k + 1 < len(hz) else None
        if ch == "不":
            if k and k + 1 < len(hz) and (hz[k - 1] == hz[k + 1] or hz[k - 1:k + 2] in POTENTIAL): syl[k] = "bu"
            elif nxt is not None: syl[k] = "bú" if nxt == 4 else "bù"
        else:
            if nxt is None or (k and hz[k - 1] in "第十二三四五六七八九零"): syl[k] = "yī"
            else: syl[k] = "yí" if nxt in (4, 5) else "yì"

# Taught words are always kept whole, and a few dictionary compounds that would make odd tiles are split.
for _line in (ROOT / "tools/content/units.txt").read_text(encoding="utf8").splitlines():
    if _line.startswith("W "): jieba.add_word(_line[2:].split("|")[0].strip(), freq=20000)
for _a, _b in [("电影", "吧"), ("朋友", "家"), ("喝", "咖啡"), ("买", "手机"), ("坐", "地铁"), ("住", "在一起")]:
    jieba.suggest_freq((_a, _b), True)

def segment(text):
    chunks, buf = [], ""
    for tok in jieba.cut(text, HMM=False):
        if re.fullmatch(r"[一-鿿]+", tok):
            if buf: chunks.append(buf); buf = ""
            chunks.append(tok)
        else:
            if chunks: chunks[-1] += tok
            else: buf += tok
    return chunks

def hanzi_only(c): return "".join(x for x in c if "一" <= x <= "鿿")

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
