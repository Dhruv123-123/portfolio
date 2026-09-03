#!/usr/bin/env python3
"""Render a time-aligned cockpit audio track for every record that has both an FDR
keyframe file and a CVR transcript (or FDR warning flags).

Usage: python3 blackbox/pipeline/audio/render_cockpit_audio.py [id ...] [--force]

For each record it writes public/blackbox/cockpit/<id>/cues.json and one MP3 per cue:
  - every CVR line spoken with a voice chosen by seat and language (Piper TTS, offline)
  - every aural warning implied by the FDR flags and the CVR/event text, synthesized
    with numpy: stall cricket + "STALL" voice (Airbus) or stick shaker (Boeing),
    cavalry charge (AP disconnect), master caution/warning chimes, overspeed clacker,
    GPWS "SINK RATE" / "PULL UP" / "TERRAIN" / "WINDSHEAR" / altitude call-outs,
    altitude alert C-chord
The cue sheet is { "id", "cues": [{ "t", "file", "kind", "speaker", "text", "dur" }] }
and the app schedules each file on the Web Audio clock relative to the replay time.
Voices: blackbox/cache/voices/*.onnx (see README). Speech is never generated for
speakers SYS/GPWS/ENV; those lines become synthesized warnings instead.
"""
import json
import math
import os
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import lameenc

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT.parent
REPORTS = ROOT / "data" / "reports"
FDR = ROOT / "data" / "fdr"
VOICES = ROOT / "cache" / "voices"
OUT = REPO / "public" / "blackbox" / "cockpit"
SR = 22050

SEAT_VOICE = {
    "en": {"CAPT": "en_US-ryan-medium", "PF": "en_US-ryan-medium", "FO": "en_GB-alan-medium", "PNF": "en_GB-alan-medium", "PM": "en_GB-alan-medium",
           "RELIEF": "en_US-joe-medium", "FE": "en_US-joe-medium", "ATC": "en_US-lessac-medium", "CABIN": "en_US-amy-medium", "OTHER": "en_US-joe-medium", "GND": "en_US-lessac-medium"},
    "fr": {"CAPT": "fr_FR-upmc-medium", "PF": "fr_FR-upmc-medium", "FO": "fr_FR-siwis-medium", "PNF": "fr_FR-siwis-medium", "PM": "fr_FR-siwis-medium", "ATC": "fr_FR-upmc-medium", "CABIN": "fr_FR-siwis-medium", "OTHER": "fr_FR-upmc-medium"},
    "es": {"*": "es_ES-davefx-medium"},
    "de": {"*": "de_DE-thorsten-medium"},
    "pt": {"*": "pt_BR-faber-medium"},
}
GPWS_VOICE = "en_US-amy-medium"


def detect_lang(text):
    t = f" {text.lower()} "
    if re.search(r"\b(les|nous|vous|c'est|pas|je|on a|qu'est|alors|vitesse|monte|descend)\b", t) or re.search(r"[éèêàçù]", t):
        return "fr"
    if re.search(r"\b(qué|está|estamos|vamos|nos|el|la|no puedo|motor|velocidad)\b", t) and re.search(r"[áéíóúñ¿¡]", t):
        return "es"
    if re.search(r"\b(nicht|wir|haben|das|ist|schub|höhe)\b", t):
        return "de"
    if re.search(r"\b(não|estamos|vamos|você|velocidade)\b", t) and re.search(r"[ãõç]", t):
        return "pt"
    return "en"


def piper(text, voice, length_scale=1.0):
    model = VOICES / f"{voice}.onnx"
    if not model.exists():
        model = VOICES / "en_US-lessac-medium.onnx"
    tmp = OUT / "_tmp.wav"
    subprocess.run(["piper", "--model", str(model), "--output_file", str(tmp), "--length_scale", str(length_scale)], input=text.encode(), capture_output=True, timeout=120)
    if not tmp.exists():
        return np.zeros(SR // 2, dtype=np.float32), SR
    with wave.open(str(tmp), "rb") as w:
        sr = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    tmp.unlink()
    return data, sr


def resample(x, sr_from, sr_to=SR):
    if sr_from == sr_to:
        return x
    n = int(len(x) * sr_to / sr_from)
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def radio_filter(x, sr=SR):
    """Narrow-band, slightly distorted, with a click at each end: an ATC transmission."""
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / sr)
    band = ((freqs > 300) & (freqs < 3200)).astype(np.float32)
    band = np.convolve(band, np.ones(40) / 40, mode="same")
    y = np.fft.irfft(spec * band, n=len(x))
    y = np.tanh(y * 2.8) * 0.8
    hiss = np.random.randn(len(y)).astype(np.float32) * 0.02
    click = np.zeros_like(y)
    click[: int(0.02 * sr)] = np.random.randn(int(0.02 * sr)) * 0.3
    click[-int(0.02 * sr):] = np.random.randn(int(0.02 * sr)) * 0.3
    return (y + hiss + click).astype(np.float32)


def cockpit_room(x, sr=SR):
    """Cockpit area mic: a little low-pass and short reflections."""
    d = int(0.012 * sr)
    y = x.copy()
    y[d:] += 0.25 * x[:-d]
    y[2 * d:] += 0.12 * x[:-2 * d]
    return (y * 0.85).astype(np.float32)


# ---------- synthesized warnings ----------
def tone(freq, dur, kind="sine", gain=0.4, glide=None, attack=0.005, release=0.02):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.linspace(freq, glide, n) if glide else np.full(n, freq)
    phase = 2 * np.pi * np.cumsum(f) / SR
    if kind == "square":
        y = np.sign(np.sin(phase))
    elif kind == "saw":
        y = 2 * ((phase / (2 * np.pi)) % 1) - 1
    elif kind == "tri":
        y = 2 * np.abs(2 * ((phase / (2 * np.pi)) % 1) - 1) - 1
    else:
        y = np.sin(phase)
    env = np.ones(n)
    a = int(attack * SR); r = int(release * SR)
    env[:a] = np.linspace(0, 1, a)
    if r:
        env[-r:] = np.linspace(1, 0, r)
    return (y * env * gain).astype(np.float32)


def silence(dur):
    return np.zeros(int(dur * SR), dtype=np.float32)


def concat(*parts):
    return np.concatenate(parts).astype(np.float32)


def mix(a, b, offset=0.0):
    off = int(offset * SR)
    n = max(len(a), off + len(b))
    out = np.zeros(n, dtype=np.float32)
    out[: len(a)] += a
    out[off:off + len(b)] += b
    return out


def stall_cricket(dur=1.6):
    """Airbus cricket: 1.75 kHz square chirps at ~11 Hz, then the STALL voice is layered by the caller."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    carrier = np.sign(np.sin(2 * np.pi * 1750 * t + 3 * np.sin(2 * np.pi * 40 * t)))
    gate = (np.sin(2 * np.pi * 11 * t) > 0).astype(np.float32)
    return (carrier * gate * 0.22).astype(np.float32)


def stick_shaker(dur=1.6):
    n = int(dur * SR)
    noise = np.random.randn(n).astype(np.float32)
    # low-pass by moving average
    k = 40
    lp = np.convolve(noise, np.ones(k) / k, mode="same")
    t = np.arange(n) / SR
    gate = (np.sin(2 * np.pi * 19 * t) > 0.3).astype(np.float32)
    thump = np.sin(2 * np.pi * 55 * t) * gate
    return ((lp * 1.8 + thump * 0.5) * gate * 0.6).astype(np.float32)


def cavalry_charge():
    seq = [740, 880, 740, 880, 740, 880, 740, 880]
    parts = []
    for f in seq:
        parts.append(tone(f, 0.13, "square", 0.22))
        parts.append(silence(0.03))
    return concat(*parts)


def crc_chime(n=3):
    """Continuous repetitive chime (Airbus master warning)."""
    parts = []
    for _ in range(n):
        parts.append(mix(tone(1046, 0.16, "tri", 0.3), tone(1568, 0.16, "sine", 0.15)))
        parts.append(silence(0.16))
    return concat(*parts)


def single_chime():
    return mix(tone(880, 0.35, "sine", 0.3, release=0.25), tone(1320, 0.35, "sine", 0.12, release=0.25))


def c_chord():
    """Altitude alert: C major chord, two strikes."""
    chord = mix(mix(tone(523, 0.5, "sine", 0.25, release=0.35), tone(659, 0.5, "sine", 0.2, release=0.35)), tone(784, 0.5, "sine", 0.18, release=0.35))
    return concat(chord, silence(0.15), chord)


def overspeed_clacker(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    carrier = np.sign(np.sin(2 * np.pi * 520 * t))
    gate = (np.sin(2 * np.pi * 14 * t) > 0).astype(np.float32)
    return (carrier * gate * 0.2).astype(np.float32)


def whoop():
    return concat(tone(400, 0.28, "saw", 0.25, glide=900), silence(0.06), tone(400, 0.28, "saw", 0.25, glide=900))


def gpws_voice(words):
    """Synthetic GPWS/EGPWS voice: female voice, slightly slowed and low-passed."""
    x, sr = piper(words.lower(), GPWS_VOICE, length_scale=1.05)
    x = resample(x, sr)
    # pitch down a little by resampling
    x = np.interp(np.linspace(0, len(x) - 1, int(len(x) * 1.08)), np.arange(len(x)), x).astype(np.float32)
    k = 12
    x = np.convolve(x, np.ones(k) / k, mode="same")
    return (x * 1.6).astype(np.float32)


def stall_voice():
    x, sr = piper("stall, stall, stall.", GPWS_VOICE, length_scale=0.9)
    x = resample(x, sr)
    x = np.interp(np.linspace(0, len(x) - 1, int(len(x) * 1.06)), np.arange(len(x)), x).astype(np.float32)
    return x


def encode_mp3(x, path, bitrate=64):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype(np.int16).tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(bitrate)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    data = enc.encode(pcm) + enc.flush()
    path.write_bytes(data)


# ---------- FDR helpers ----------
def sample(param, t):
    keys = param["keys"]
    if not keys:
        return None
    if t <= keys[0][0]:
        return keys[0][1]
    for i in range(len(keys) - 1):
        t0, v0 = keys[i]
        t1, v1 = keys[i + 1]
        if t0 <= t <= t1:
            if param.get("interp") == "step" or not isinstance(v0, (int, float)) or not isinstance(v1, (int, float)):
                return v0
            f = (t - t0) / (t1 - t0) if t1 > t0 else 0
            return v0 + (v1 - v0) * f
    return keys[-1][1]


def warning_cues(fdr, rec):
    """Derive aural warnings with times from the FDR flags and thresholds."""
    cues = []
    p = fdr["params"]
    mf = (rec.get("aircraft", {}).get("manufacturer") or rec.get("aircraft", {}).get("type") or "").lower()
    airbus = "airbus" in mf
    t0, t1 = fdr["t_start"], fdr["t_end"]
    ts = np.arange(t0, t1 + 0.5, 0.5)
    prev = {}
    stall_on_since = None
    last_gpws = -99
    last_callout = {}
    for t in ts:
        st = {k: sample(v, t) for k, v in p.items()}
        # AP disconnect
        if prev.get("ap") == 1 and st.get("ap") == 0:
            cues.append({"t": float(t), "kind": "ap_disconnect", "gen": "cavalry" if airbus else "wailer"})
        if prev.get("law") and st.get("law") and st["law"] != prev["law"] and st["law"] != "NORMAL":
            cues.append({"t": float(t), "kind": "master_caution", "gen": "single_chime"})
        if prev.get("ias_valid") == 1 and st.get("ias_valid") == 0:
            cues.append({"t": float(t), "kind": "master_warning", "gen": "crc"})
        # stall: continuous while on; emit a cue every 1.6 s
        if st.get("stall_warn"):
            if stall_on_since is None or t - stall_on_since >= 1.6:
                stall_on_since = t
                cues.append({"t": float(t), "kind": "stall", "gen": "cricket_stall" if airbus else "shaker"})
        else:
            stall_on_since = None
        # overspeed
        if (st.get("mach") or 0) > 0.87 or (st.get("ias_kt") or 0) > 360:
            if t - last_gpws > 1.2 and (prev.get("_over") is not True):
                cues.append({"t": float(t), "kind": "overspeed", "gen": "clacker"})
            prev["_over"] = True
        else:
            prev["_over"] = False
        # GPWS
        ra = st.get("ra_ft")
        vs = st.get("vs_fpm") or 0
        if isinstance(ra, (int, float)) and ra < 2450 and t - last_gpws > 2.2:
            if (vs < -3000 and ra < 1500) or (vs < -1800 and ra < 500):
                cues.append({"t": float(t), "kind": "gpws", "gen": "whoop_pull_up"}); last_gpws = t
            elif vs < -1400:
                cues.append({"t": float(t), "kind": "gpws", "gen": "sink_rate"}); last_gpws = t
        # altitude call-outs while descending
        pra = prev.get("ra_ft")
        if isinstance(ra, (int, float)) and isinstance(pra, (int, float)) and ra < pra:
            for g in (2500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10):
                if pra > g >= ra and last_callout.get(g) is None:
                    last_callout[g] = t
                    cues.append({"t": float(t), "kind": "callout", "gen": f"callout_{g}"})
                    break
        prev.update(st)
    # markers and events that name a warning the flags did not carry
    seen = {(round(c["t"]), c["kind"]) for c in cues}
    texts = [(m["t"], m["label"]) for m in fdr.get("markers", [])] + [(e["t"], e.get("text", "")) for e in rec.get("events", []) if e.get("kind") in ("warning", "system")] + [(c["t"], c.get("text", "")) for c in rec.get("cvr", []) if (c.get("speaker") or "").upper() in ("SYS", "GPWS", "EGPWS", "TCAS")]
    for t, label in texts:
        l = label.lower()
        if not (fdr["t_start"] <= t <= fdr["t_end"]):
            continue
        gen = None
        if "pull up" in l or "whoop" in l:
            gen = "whoop_pull_up"
        elif "terrain" in l:
            gen = "terrain"
        elif "sink rate" in l:
            gen = "sink_rate"
        elif "windshear" in l or "wind shear" in l:
            gen = "windshear"
        elif "too low" in l:
            gen = "too_low"
        elif "don't sink" in l or "dont sink" in l:
            gen = "dont_sink"
        elif "glideslope" in l or "glide slope" in l:
            gen = "glideslope"
        elif "bank angle" in l:
            gen = "bank_angle"
        elif "stall" in l and "warning" in l:
            gen = "cricket_stall" if airbus else "shaker"
        elif "stick shaker" in l or "stickshaker" in l:
            gen = "shaker"
        elif "altitude alert" in l:
            gen = "c_chord"
        elif "master caution" in l:
            gen = "single_chime"
        elif "master warning" in l or "fire warning" in l or "fire bell" in l:
            gen = "crc"
        elif "autopilot disconnect" in l or "ap disconnect" in l:
            gen = "cavalry" if airbus else "wailer"
        elif "tcas" in l and ("climb" in l or "descend" in l or "traffic" in l):
            gen = "tcas_climb" if "climb" in l else "tcas_descend" if "descend" in l else "traffic"
        elif "retard" in l:
            gen = "retard"
        elif "minimums" in l or "minimum" in l:
            gen = "minimums"
        elif "decision height" in l:
            gen = "minimums"
        # skip when a flag-derived cue of the same family already sounds within 3 s
        family = gen.split("_")[0] if gen else None
        near = any(abs(c["t"] - t) < 3 and c["gen"].split("_")[0] == family for c in cues) if gen else True
        if gen and not near:
            cues.append({"t": float(t), "kind": "warning", "gen": gen})
            seen.add((round(t), family))
    cues.sort(key=lambda c: c["t"])
    return cues


CALLOUT_WORDS = {2500: "two thousand five hundred", 1000: "one thousand", 500: "five hundred", 400: "four hundred", 300: "three hundred", 200: "two hundred", 100: "one hundred", 50: "fifty", 40: "forty", 30: "thirty", 20: "twenty", 10: "ten"}


def render_warning(gen, cache):
    if gen in cache:
        return cache[gen]
    if gen == "cavalry":
        x = cavalry_charge()
    elif gen == "wailer":
        x = concat(*[mix(tone(540, 0.22, "square", 0.18, glide=470), tone(1080, 0.22, "square", 0.05, glide=940)) for _ in range(4)])
    elif gen == "single_chime":
        x = single_chime()
    elif gen == "crc":
        x = crc_chime(4)
    elif gen == "c_chord":
        x = c_chord()
    elif gen == "clacker":
        x = overspeed_clacker()
    elif gen == "cricket_stall":
        x = mix(stall_cricket(1.7), stall_voice(), 0.05)
    elif gen == "shaker":
        x = stick_shaker(1.6)
    elif gen == "whoop_pull_up":
        x = concat(whoop(), gpws_voice("pull up"))
    elif gen == "terrain":
        x = gpws_voice("terrain, terrain")
    elif gen == "sink_rate":
        x = gpws_voice("sink rate")
    elif gen == "windshear":
        x = concat(tone(700, 0.25, "square", 0.15), tone(700, 0.25, "square", 0.15), gpws_voice("windshear, windshear, windshear"))
    elif gen == "too_low":
        x = gpws_voice("too low, terrain")
    elif gen == "dont_sink":
        x = gpws_voice("don't sink")
    elif gen == "glideslope":
        x = gpws_voice("glideslope")
    elif gen == "bank_angle":
        x = gpws_voice("bank angle")
    elif gen == "tcas_climb":
        x = gpws_voice("climb, climb")
    elif gen == "tcas_descend":
        x = gpws_voice("descend, descend")
    elif gen == "traffic":
        x = gpws_voice("traffic, traffic")
    elif gen == "retard":
        x = gpws_voice("retard, retard")
    elif gen == "minimums":
        x = gpws_voice("minimums, minimums")
    elif gen.startswith("callout_"):
        x = gpws_voice(CALLOUT_WORDS[int(gen.split("_")[1])])
    else:
        x = single_chime()
    cache[gen] = x
    return x


def render_record(rec, fdr, force=False):
    out = OUT / rec["id"]
    cue_path = out / "cues.json"
    if cue_path.exists() and not force:
        return json.loads(cue_path.read_text())
    out.mkdir(parents=True, exist_ok=True)
    cues = []
    cache = {}
    # CVR lines
    lang_votes = [detect_lang(c.get("text", "")) for c in rec.get("cvr", [])]
    lang = max(set(lang_votes), key=lang_votes.count) if lang_votes else "en"
    for i, c in enumerate(rec.get("cvr", [])):
        spk = (c.get("speaker") or "OTHER").upper()
        if spk in ("SYS", "GPWS", "EGPWS", "TCAS", "ENV"):
            continue
        text = c.get("text", "")
        text = re.sub(r"\[[^\]]*\]|\([^)]*\)", "", text).strip()
        if not text:
            continue
        line_lang = detect_lang(text) if lang != "en" else "en"
        table = SEAT_VOICE.get(line_lang, SEAT_VOICE["en"])
        voice = table.get(spk) or table.get("*") or SEAT_VOICE["en"].get(spk) or "en_US-lessac-medium"
        x, sr = piper(text, voice, 1.0)
        x = resample(x, sr)
        x = radio_filter(x) if spk in ("ATC", "GND") else cockpit_room(x)
        fn = f"cvr_{i:03d}.mp3"
        encode_mp3(x, out / fn)
        cues.append({"t": c["t"], "file": fn, "kind": "atc" if spk in ("ATC", "GND") else "cvr", "speaker": spk, "text": c.get("text", ""), "dur": round(len(x) / SR, 2)})
    # warnings
    for w in warning_cues(fdr, rec):
        x = render_warning(w["gen"], cache)
        fn = f"w_{w['gen']}.mp3"
        if not (out / fn).exists():
            encode_mp3(x, out / fn)
        cues.append({"t": w["t"], "file": fn, "kind": w["kind"], "speaker": "SYS", "text": w["gen"].replace("_", " "), "dur": round(len(x) / SR, 2)})
    cues.sort(key=lambda c: c["t"])
    sheet = {"id": rec["id"], "cues": cues, "note": "Speech is synthesized from the published transcript with a voice per seat; warnings are synthesized to the recorded flags. Nothing here is the real recording."}
    cue_path.write_text(json.dumps(sheet, ensure_ascii=False, indent=1))
    return sheet


def main():
    force = "--force" in sys.argv
    ids = [a for a in sys.argv[1:] if not a.startswith("--")]
    OUT.mkdir(parents=True, exist_ok=True)
    done = 0
    for p in sorted(REPORTS.glob("*.json")):
        rec = json.loads(p.read_text())
        if ids and rec["id"] not in ids:
            continue
        if not rec.get("fdr"):
            continue
        fp = FDR / f"{rec['fdr']}.json"
        if not fp.exists():
            continue
        fdr = json.loads(fp.read_text())
        has_cvr = any((c.get("speaker") or "").upper() not in ("SYS", "GPWS", "ENV") for c in rec.get("cvr", []))
        if not has_cvr and not any(k in fdr["params"] for k in ("stall_warn", "ap", "ra_ft")) and not fdr.get("markers"):
            continue
        sheet = render_record(rec, fdr, force)
        done += 1
        print(f"{rec['id']}: {len(sheet['cues'])} cues ({sum(1 for c in sheet['cues'] if c['kind'] in ('cvr', 'atc'))} spoken)", flush=True)
    print(f"rendered {done} records")


if __name__ == "__main__":
    main()
