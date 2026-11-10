"""Shared helpers for build-content.py and build-stories.py: dictionaries, pinyin lookup, tone sandhi, segmentation.

Needs CEDICT=.../cedict_ts.u8 and HSK=.../complete.json in the environment.
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
hsk_py, hsk_level, hsk_freq = {}, {}, {}
for w in HSK:
    s = w["simplified"]
    hsk_py.setdefault(s, [f["transcriptions"]["pinyin"].lower().split() for f in w["forms"]])
    hsk_freq[s] = w["frequency"]  # lower = more common
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
