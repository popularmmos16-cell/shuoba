#!/usr/bin/env python3
"""Build src/data/stories.json from tools/content/stories/*.txt.

A story file looks like this (blank lines and # comments are ignored):

    kind: set                         (optional: "set" for a reading set, default "story")
    title: 朋友来吃饭|A friend comes for a meal
    我朋友来我家。|My friend comes to my home.
    我们喝茶。|We drink tea.|tatoeba:12345:someone      (optional source: a Tatoeba sentence id and contributor)

Every word in a story should be a word the app teaches (a W line in units.txt), so a new word met while reading can be
added to the Word wall. A few grammar words that are not taught as words (了 吗 呢 ...) are listed in FUNCTION_WORDS and
always count as known. Anything else is reported as "outside the curriculum": add it to units.txt (append only) or
reword the sentence.

Segmentation and pinyin happen here, at build time, so the app never has to segment Chinese on the phone.
Glosses for function words and outside words come from tools/content/glosses.txt (hanzi|gloss), else the HSK data.

  CEDICT=.../cedict_ts.u8 HSK=.../complete.json python3 tools/build-stories.py
"""
import json, os, re, sys
from zhlib import ROOT, chunk_pinyin, hanzi_only, sandhi, segment

# Grammar words that are never taught as vocabulary but appear in every story. Counted as known for coverage.
FUNCTION_WORDS = "了 吗 呢 吧 啊 过 着 都 也 很 不 没 没有 就 还 但是 因为 所以 这 什么 请 想 要 会 能 可以 太 又 再 跟 和 在 对 到 好 的".split()

phrases = json.load(open(ROOT / "src/data/phrases.json"))
WORDS = {p["hanzi"]: p for p in phrases if p["kind"] == "word"}
FUNC = {w for w in FUNCTION_WORDS if w not in WORDS}  # a taught word follows the learner, not this list

hsk_meaning = {}
for e in json.load(open(os.environ["HSK"])):
    try:
        hsk_meaning.setdefault(e["simplified"], "; ".join(e["forms"][0]["meanings"][:2]))
    except (KeyError, IndexError):
        pass
gloss_override = {}
gfile = ROOT / "tools/content/glosses.txt"
if gfile.exists():
    for line in gfile.read_text(encoding="utf8").splitlines():
        if "|" in line and not line.startswith("#"):
            h, g = line.split("|", 1)
            gloss_override[h.strip()] = g.strip()
gloss_of = lambda h: gloss_override.get(h) or hsk_meaning.get(h, "")

def split_known(h):
    """Greedy longest-first split of a hanzi string into taught words / function words, or None if it can't be."""
    out, i = [], 0
    while i < len(h):
        for j in range(len(h), i, -1):
            if h[i:j] in WORDS or h[i:j] in FUNC:
                out.append(h[i:j]); i = j; break
        else:
            return None
    return out

def tokenize(zh):
    """-> list of (text-with-punctuation, hanzi) pieces, preferring taught words over dictionary compounds."""
    pieces = []
    for chunk in segment(zh):
        h = hanzi_only(chunk)
        if not h:
            if pieces: pieces[-1] = (pieces[-1][0] + chunk, pieces[-1][1])
            else: pieces.append((chunk, ""))
            continue
        if h in WORDS or h in FUNC: pieces.append((chunk, h)); continue
        parts = split_known(h)
        if parts and len(parts) > 1:
            trail = chunk[len(chunk.rstrip("。，！？、：；”“…,.!?:;\"' ")):]
            for k, part in enumerate(parts): pieces.append((part + (trail if k == len(parts) - 1 else ""), part))
        else:
            pieces.append((chunk, h))
    return pieces

problems = []
def build_sentence(sid, zh, en):
    pieces = tokenize(zh)
    assert "".join(t for t, _ in pieces) == zh, (zh, pieces)
    sylls = []
    for _, h in pieces:
        if not h: sylls.append([]); continue
        w = WORDS.get(h)
        # a taught word keeps its own pinyin (it may carry a py= override), except 不/一 which depend on their neighbours
        sylls.append(w["py"].split() if w and not re.search("[不一]", h) and len(w["py"].split()) == len(h) else list(chunk_pinyin(h)))
    flat = [s for p in sylls for s in p]
    sandhi("".join(h for _, h in pieces), flat)
    toks, at = [], 0
    for (text, h), syl in zip(pieces, sylls):
        py = " ".join(flat[at:at + len(syl)]); at += len(syl)
        tok = {"t": text, "py": py}
        if h in WORDS: tok["id"] = WORDS[h]["id"]
        elif h in FUNC: tok["f"] = 1; tok["g"] = gloss_of(h)
        elif h:
            tok["g"] = gloss_of(h)
            problems.append(f"  {sid}: '{h}' is outside the curriculum ({zh})")
        toks.append(tok)
    return {"zh": zh, "en": en, "py": " ".join(flat), "tokens": toks}

stories = []
for f in sorted((ROOT / "tools/content/stories").glob("*.txt")):
    title = en_title = None
    kind = "story"
    sents = []
    for raw in f.read_text(encoding="utf8").splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#"): continue
        if raw.startswith("kind:"): kind = raw[5:].strip(); continue
        if raw.startswith("title:"):
            title, _, en_title = raw[6:].partition("|"); title, en_title = title.strip(), en_title.strip(); continue
        zh, _, rest = raw.partition("|")
        en, _, src = rest.partition("|")  # optional third field: tatoeba:<sentence id>:<contributor>
        s = build_sentence(f.stem, zh.strip(), en.strip())
        if src.startswith("tatoeba:"):
            _, sid, by = src.split(":", 2)
            s["src"] = {"id": int(sid), "by": by}
        sents.append(s)
    if not title or not sents: sys.exit(f"{f.name}: needs a 'title: 中文|English' line and at least one sentence")
    stories.append({"id": f.stem, "kind": kind, "title": title, "titleEn": en_title, "sentences": sents})

print(f"{len(stories)} stories, {sum(len(s['sentences']) for s in stories)} sentences")
print("\n".join(problems) if problems else "every word is in the curriculum")
json.dump(stories, open(ROOT / "src/data/stories.json", "w"), ensure_ascii=False, indent=1)
