#!/usr/bin/env python3
"""Generate the app's audio clips with the macOS Tingting voice (zh_CN) and `say`.

Why files and not the browser's speech engine: iOS mutes speechSynthesis when the ringer is on silent,
but plays <audio> elements. Output is public/audio/p/<phrase id>.m4a and public/audio/t/<hex codepoint>.m4a.

Why Tingting and not Piper (used before): Piper's small Chinese voice mangled isolated words, which made
listening questions unanswerable. Each clip is also padded with a little silence at the start (iOS clips the
first few milliseconds of short audio, which swallowed the initial consonant), peak-normalised, and encoded
at a higher bitrate. Words and single syllables are spoken slower than sentences.

Needs macOS (say, afconvert). A clip is re-rendered when it is missing or older than this script, so editing
the script (voice, speed, padding) refreshes everything and an interrupted run simply resumes. --force redoes all.
  python3 tools/gen-audio.py [--force]
"""
import array, json, subprocess, sys, tempfile, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
force = "--force" in sys.argv
VOICE = "Tingting"
LEAD, TAIL, PEAK = 0.18, 0.12, 0.89  # seconds of silence before/after; target peak (about -1 dBFS)

# (text, output, words per minute)
jobs = []
for p in json.load(open(ROOT / "src/data/phrases.json")):
    jobs.append((p["hanzi"], ROOT / f"public/audio/p/{p['id']}.m4a", 135 if p["kind"] == "word" else 160))
for s in json.load(open(ROOT / "src/data/tones.json")):
    for ch in s["chars"]:
        jobs.append((ch, ROOT / f"public/audio/t/{ord(ch):x}.m4a", 120))

stale = lambda o: not o.exists() or o.stat().st_mtime < Path(__file__).stat().st_mtime
todo = [j for j in jobs if force or stale(j[1])]
print(f"{len(todo)} clips to render ({len(jobs) - len(todo)} already exist)", flush=True)

def polish(src: Path, dst: Path):
    with wave.open(str(src), "rb") as w:
        rate, ch = w.getframerate(), w.getnchannels()
        pcm = array.array("h", w.readframes(w.getnframes()))
    peak = max((abs(x) for x in pcm), default=1) or 1
    gain = PEAK * 32767 / peak
    pcm = array.array("h", (max(-32768, min(32767, int(x * gain))) for x in pcm))
    pad = lambda s: array.array("h", [0] * int(rate * s) * ch)
    out = pad(LEAD) + pcm + pad(TAIL)
    with wave.open(str(dst), "wb") as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(out.tobytes())

with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    for i, (text, out, wpm) in enumerate(todo, 1):
        out.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(3):  # `say` very occasionally hangs, so never wait on it forever
            try:
                subprocess.run(["say", "-v", VOICE, "-r", str(wpm), "-o", str(d / "a.aiff"), text], check=True, timeout=20)
                break
            except subprocess.TimeoutExpired:
                print(f"say timed out on {text!r}, retrying", flush=True)
        else:
            sys.exit(f"giving up on {text!r}")
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@44100", str(d / "a.aiff"), str(d / "a.wav")], check=True)
        polish(d / "a.wav", d / "b.wav")
        tmp = out.with_suffix(".tmp.m4a")
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", str(d / "b.wav"), str(tmp)], check=True)
        tmp.replace(out)  # only complete files ever appear under the final name
        if i % 50 == 0 or i == len(todo):
            print(f"{i}/{len(todo)}  {out.name}  {text}", flush=True)
