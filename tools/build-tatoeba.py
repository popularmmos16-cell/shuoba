#!/usr/bin/env python3
"""Pick reading sets from Tatoeba sentences and write them to tools/content/stories/t*.txt (then run build-stories.py).

Tatoeba (https://tatoeba.org) is a community corpus of sentences with translations, licensed CC BY 2.0 FR: you must credit
Tatoeba and the contributors. Each picked sentence carries its Tatoeba id and contributor name in the story file, and the app
shows them. Tatoeba's *audio* is not used (its licences vary per speaker); the app makes its own with `say`.

A sentence is picked only when EVERY word in it is a taught word or a grammar word, so a set never asks for vocabulary you have not
been taught. Sets are grouped by the latest unit their words come from. These are volunteer-written sentences: skim the result.

  TAT=/path/to/tatoeba CEDICT=... HSK=... python3 tools/build-tatoeba.py [--per-unit 3] [--size 6]
Needs from https://downloads.tatoeba.org/exports/per_language/: cmn/cmn_sentences_detailed.tsv.bz2, cmn/cmn-eng_links.tsv.bz2,
eng/eng_sentences.tsv.bz2 (all unpacked into $TAT).
"""
import collections, json, os, re, sys
from zhlib import ROOT, hanzi_only, jieba
from opencc import OpenCC  # only used to detect traditional-only characters

def arg(name, default):
    return int(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default
PER_UNIT, SIZE = arg("--per-unit", 3), arg("--size", 6)
TAT = os.environ["TAT"]
FUNCTION_WORDS = re.search(r'FUNCTION_WORDS = "([^"]+)"', (ROOT / "tools/build-stories.py").read_text(encoding="utf8")).group(1).split()

phrases = json.load(open(ROOT / "src/data/phrases.json"))
WORD_UNIT = {p["hanzi"]: p["unit"] for p in phrases if p["kind"] == "word"}
FUNC = set(FUNCTION_WORDS) - set(WORD_UNIT)
KNOWN = set(WORD_UNIT) | FUNC
UNIT_EN = [l[1:].strip() for l in (ROOT / "tools/content/units.txt").read_text(encoding="utf8").splitlines() if l.startswith("=")]
UNIT_ZH = ["人", "数字和钱", "吃喝", "出行", "日常时间", "家人", "购物", "心情和健康", "聊天"]

t2s = OpenCC("t2s")
def split_known(h):
    out, i = [], 0
    while i < len(h):
        for j in range(len(h), i, -1):
            if h[i:j] in KNOWN: out.append(h[i:j]); i = j; break
        else: return None
    return out

PUNCT = str.maketrans({"?": "？", "!": "！", ",": "，", ";": "；", ":": "：", ".": "。"})
OK_CHARS = re.compile(r"^[一-鿿，。？！、；：]+$")
NAMES = re.compile(r"\b(Tom|Mary|Sami|Layla|John|Ken|Bob|Jim|Taro|Mike|Maria)\b")

links = collections.defaultdict(list)
for l in open(f"{TAT}/cmn-eng_links.tsv"):
    a, b = l.split(); links[a].append(b)
need = {b for v in links.values() for b in v}
eng = {}
for l in open(f"{TAT}/eng_sentences.tsv", encoding="utf8"):
    i, _, t = l.rstrip("\n").split("\t")
    if i in need: eng[i] = t

cands = []
for l in open(f"{TAT}/cmn_sentences_detailed.tsv", encoding="utf8"):
    p = l.rstrip("\n").split("\t"); sid, zh, user = p[0], p[2].strip().translate(PUNCT), p[3]
    if not OK_CHARS.match(zh) or t2s.convert(zh) != zh or not zh[-1] in "。？！": continue  # simplified only, no quotes/latin/digits
    en = next((eng[b] for b in links.get(sid, []) if b in eng and not NAMES.search(eng[b]) and re.search(r"[.?!]$", eng[b])), None)
    if not en or "汤姆" in zh or user == "\\N": continue
    toks = []
    for t in jieba.cut(zh, HMM=False):
        h = hanzi_only(t)
        if not h: continue
        parts = [h] if h in KNOWN else split_known(h)
        if not parts: toks = None; break
        toks += parts
    if not toks or not 4 <= len(toks) <= 10: continue
    units = [WORD_UNIT[t] for t in toks if t in WORD_UNIT]
    if not units: continue
    cands.append({"id": sid, "zh": zh, "en": en, "by": user, "toks": toks, "unit": max(units)})

by_user = collections.Counter(c["by"] for c in cands)  # prolific contributors are, on average, more reliable
seen, picked = set(), collections.defaultdict(list)
for c in sorted(cands, key=lambda c: (-min(by_user[c["by"]], 60), abs(len(c["toks"]) - 7), c["id"])):
    key = (c["unit"], tuple(c["toks"][:3]))  # avoid a set full of the same template
    if c["zh"] in seen or sum(1 for k in seen if k == key) >= 2: continue
    seen.add(c["zh"]); seen.add(key)
    picked[c["unit"]].append(c)

out = ROOT / "tools/content/stories"
for f in out.glob("t*.txt"): f.unlink()
n = 0
for unit in sorted(picked):
    # tie each set together a little: sort by length so a set reads from short to longer lines
    pool = picked[unit][: PER_UNIT * SIZE]
    for k in range(0, len(pool) - SIZE + 1, SIZE):
        chunk = sorted(pool[k:k + SIZE], key=lambda c: len(c["zh"])); n += 1
        num = k // SIZE + 1
        lines = [f"# Tatoeba sentences (CC BY 2.0 FR). Picked by build-tatoeba.py from words taught up to unit {unit}.", "kind: set",
                 f"title: {UNIT_ZH[unit - 1]} {num}|Short sentences: {UNIT_EN[unit - 1]} {num}"]
        lines += [f"{c['zh']}|{c['en']}|tatoeba:{c['id']}:{c['by']}" for c in chunk]
        (out / f"t{n:02d}.txt").write_text("\n".join(lines) + "\n", encoding="utf8")
print(f"{len(cands)} usable sentences; wrote {n} sets of {SIZE} from units {sorted(picked)}")
