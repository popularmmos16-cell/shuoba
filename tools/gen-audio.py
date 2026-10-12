#!/usr/bin/env python3
"""Generate the app's audio clips with Piper (voice: zh_CN-chaowen-medium, trained on a CC0 dataset).

Why files and not the browser's speech engine: iOS mutes speechSynthesis when the ringer is on silent,
but plays <audio> elements. Output is public/audio/p/<phrase id>.m4a and public/audio/t/<hex codepoint>.m4a.

One-time setup (macOS; afconvert makes the .m4a):
  python3 -m venv venv && venv/bin/pip install "piper-tts[zh]"
  curl -L -O https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/chaowen/medium/zh_CN-chaowen-medium.onnx
  curl -L -O https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/chaowen/medium/zh_CN-chaowen-medium.onnx.json
  # piper downloads its g2pW model into ./g2pW on first run (extract g2pw.tar.gz there yourself if SSL fails)
Run from the folder holding the venv, model and g2pW:
  PIPER_PY=venv/bin/python PIPER_MODEL=zh_CN-chaowen-medium.onnx python3 /path/to/shuoba/tools/gen-audio.py [--force]
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY, MODEL = os.environ["PIPER_PY"], os.environ["PIPER_MODEL"]
force = "--force" in sys.argv

jobs = []
for p in json.load(open(ROOT / "src/data/phrases.json")):
    jobs.append((p["hanzi"], ROOT / f"public/audio/p/{p['id']}.m4a"))
for s in json.load(open(ROOT / "src/data/tones.json")):
    for ch in s["chars"]:
        jobs.append((ch, ROOT / f"public/audio/t/{ord(ch):x}.m4a"))

for text, out in jobs:
    if out.exists() and not force:
        continue
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / "a.wav"
        subprocess.run([PY, "-m", "piper", "-m", MODEL, "-f", str(wav), "--volume", "0.7", "--", text], check=True, capture_output=True)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "48000", str(wav), str(out)], check=True)
    print("wrote", out.relative_to(ROOT), text)
