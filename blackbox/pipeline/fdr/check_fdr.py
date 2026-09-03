#!/usr/bin/env python3
"""Sanity-check FDR keyframe files. Usage: check_fdr.py <fdr.json>... (exit 1 on problems)."""
import json
import sys

REQUIRED = ["alt_ft", "ias_kt", "pitch_deg", "roll_deg", "hdg_deg", "vs_fpm"]
RANGES = {
    "alt_ft": (-1500, 60000), "ias_kt": (0, 700), "pitch_deg": (-90, 90), "roll_deg": (-180, 180), "hdg_deg": (-360, 720),
    "vs_fpm": (-40000, 20000), "aoa_deg": (-30, 90), "n1_pct": (0, 120), "n1_left_pct": (0, 120), "n1_right_pct": (0, 120),
    "stick_pitch": (-1, 1), "stick_roll": (-1, 1), "ths_deg": (-20, 20), "gear": (0, 1), "ap": (0, 1), "athr": (0, 1),
    "stall_warn": (0, 1), "ra_ft": (-50, 5000), "gs_kt": (0, 800), "mach": (0, 1.2), "ias_valid": (0, 1), "flaps": (0, 60),
    "column_force_lb": (-300, 300),
}
MODELS = {"airliner_twin", "airliner_quad", "regional_turboprop", "regional_jet", "narrowbody_tri"}
TERRAINS = {"ocean", "flat", "runway", "mountains", "city"}
FIDELITY = {"reconstructed", "tabulated", "narrative", "schematic"}


def check(path):
    problems = []
    try:
        f = json.load(open(path))
    except Exception as e:
        return [f"{path}: unreadable JSON ({e})"]
    for k in ("id", "record", "source", "fidelity", "t_start", "t_end", "aircraft_model", "params", "markers", "terrain"):
        if k not in f:
            problems.append(f"missing field {k}")
    if f.get("fidelity") not in FIDELITY:
        problems.append(f"fidelity must be one of {sorted(FIDELITY)}")
    if f.get("aircraft_model") not in MODELS:
        problems.append(f"aircraft_model must be one of {sorted(MODELS)}")
    if f.get("terrain") not in TERRAINS:
        problems.append(f"terrain must be one of {sorted(TERRAINS)}")
    ts, te = f.get("t_start"), f.get("t_end")
    if not (isinstance(ts, (int, float)) and isinstance(te, (int, float)) and te > ts):
        problems.append("t_end must be greater than t_start")
    params = f.get("params") or {}
    for k in REQUIRED:
        if k not in params:
            problems.append(f"missing required param {k}")
    for name, p in params.items():
        keys = p.get("keys") if isinstance(p, dict) else None
        if not isinstance(keys, list) or not keys:
            problems.append(f"{name}: keys must be a non-empty list")
            continue
        last = None
        for i, kv in enumerate(keys):
            if not (isinstance(kv, list) and len(kv) == 2 and isinstance(kv[0], (int, float))):
                problems.append(f"{name}[{i}]: key must be [t, value]")
                continue
            t, v = kv
            if last is not None and t <= last:
                problems.append(f"{name}[{i}]: t {t} not increasing")
            last = t
            if isinstance(v, (int, float)) and name in RANGES:
                lo, hi = RANGES[name]
                if v < lo or v > hi:
                    problems.append(f"{name}[{i}]: value {v} outside {lo}..{hi}")
            if name not in ("law", "thrust_lever") and not isinstance(v, (int, float)):
                problems.append(f"{name}[{i}]: non-numeric value")
        if name in REQUIRED and len(keys) < 4 and name in ("alt_ft", "ias_kt"):
            problems.append(f"{name}: needs at least 4 keyframes")
        if isinstance(ts, (int, float)) and keys and isinstance(keys[0][0], (int, float)) and keys[0][0] > ts + 60:
            problems.append(f"{name}: first key {keys[0][0]} starts long after t_start {ts}")
    # density: alt keys should cover the dynamic span reasonably
    alt = params.get("alt_ft", {}).get("keys") or []
    if len(alt) >= 2 and isinstance(te, (int, float)) and isinstance(ts, (int, float)):
        span = te - ts
        if span > 120 and len(alt) < max(4, span / 60):
            problems.append(f"alt_ft: only {len(alt)} keys over {span:.0f} s; add keyframes every 5-15 s in the dynamic part")
    markers = f.get("markers") or []
    if not (isinstance(markers, list) and 2 <= len(markers) <= 20):
        problems.append("markers: give 2 to 20 {t,label} entries")
    for m in markers:
        if not (isinstance(m, dict) and isinstance(m.get("t"), (int, float)) and isinstance(m.get("label"), str)):
            problems.append("markers: each must be {t: number, label: string}")
    return [f"{path}: {p}" for p in problems]


if __name__ == "__main__":
    allp = []
    for path in sys.argv[1:]:
        allp += check(path)
    for p in allp:
        print(p)
    print(f"{len(allp)} problems")
    sys.exit(1 if allp else 0)
