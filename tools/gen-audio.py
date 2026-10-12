#!/usr/bin/env python3
"""Generate the app's audio clips with Piper (voice: zh_CN-chaowen-medium, trained on a CC0 dataset).

Why files and not the browser's speech engine: iOS mutes speechSynthesis when the ringer is on silent,
but plays <audio> elements. Output is public/audio/p/<phrase id>.m4a and public/audio/t/<hex codepoint>.m4a.
Existing clips are skipped unless --force is given, so adding content only renders the new items.

One-time setup (macOS; afconvert makes the .m4a), in a scratch folder:
  python3 -m venv venv && venv/bin/pip install "piper-tts[zh]"
  curl -L -O https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/chaowen/medium/zh_CN-chaowen-medium.onnx
  curl -L -O https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/chaowen/medium/zh_CN-chaowen-medium.onnx.json
  # piper wants its g2pW model in ./g2pW (if its own download fails on SSL, extract g2pw.tar.gz there yourself)
Run from that folder, with the venv's python (the model is loaded once, so this is fast):
  PIPER_MODEL=zh_CN-chaowen-medium.onnx venv/bin/python /path/to/shuoba/tools/gen-audio.py [--force]
"""
import json, os, subprocess, sys, tempfile, wave
from pathlib import Path
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parent.parent
force = "--force" in sys.argv

jobs = []
for p in json.load(open(ROOT / "src/data/phrases.json")):
    jobs.append((p["hanzi"], ROOT / f"public/audio/p/{p['id']}.m4a"))
for s in json.load(open(ROOT / "src/data/tones.json")):
    for ch in s["chars"]:
        jobs.append((ch, ROOT / f"public/audio/t/{ord(ch):x}.m4a"))

todo = [(t, o) for t, o in jobs if force or not o.exists()]
print(f"{len(todo)} clips to render ({len(jobs) - len(todo)} already exist)", flush=True)
if not todo:
    sys.exit(0)

voice = PiperVoice.load(os.environ["PIPER_MODEL"])
cfg = SynthesisConfig(volume=0.7)  # leaves headroom: full-scale output clips

with tempfile.TemporaryDirectory() as d:
    for i, (text, out) in enumerate(todo, 1):
        out.parent.mkdir(parents=True, exist_ok=True)
        wav = Path(d) / "a.wav"
        with wave.open(str(wav), "wb") as w:
            voice.synthesize_wav(text, w, syn_config=cfg)
        tmp = out.with_suffix(".tmp.m4a")
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "48000", str(wav), str(tmp)], check=True)
        tmp.replace(out)  # only complete files ever appear under the final name
        if i % 25 == 0 or i == len(todo):
            print(f"{i}/{len(todo)}  {out.name}  {text}", flush=True)
