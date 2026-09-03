#!/usr/bin/env python3
"""Deterministic repair of mechanical schema slips in worker-written records.

Usage: python3 blackbox/pipeline/catalog/fix_records.py <record.json> [...]
Maps unknown factor ids onto taxonomy synonyms (or drops them everywhere they are
referenced), maps unknown phases/actors onto the taxonomy vocabulary, replaces null
list fields with [], normalises recommendation status and agency role enums, and
sorts events by time. Every change is appended to extraction.notes.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TAX = json.loads((ROOT / "data" / "taxonomy.json").read_text())
FACTORS = {f["id"]: f for f in TAX["factors"]}
PHASES = set(TAX["phases"]) if isinstance(TAX["phases"], (list, set)) else set(TAX["phases"].keys())
ACTORS = set(TAX["actors"]) if isinstance(TAX["actors"], (list, set)) else set(TAX["actors"].keys())
STATUS = {"open", "closed_acceptable", "closed_unacceptable", "superseded", "unknown"}
ROLES = {"lead", "accredited_representative", "participant", "commenting", "delegated", "assisting"}
PHASE_MAP = {"impact": "landing", "crash": "landing", "preflight": "ground", "pre-flight": "ground", "post_impact": "landing", "postimpact": "landing", "final_approach": "approach", "final": "approach", "enroute": "cruise", "en_route": "cruise", "rollout": "landing", "touchdown": "landing", "pushback": "taxi", "hover": "cruise", "missed_approach": "go_around", "emergency_descent": "descent"}
ACTOR_MAP = {"CREW": "CAPT", "CA": "CAPT", "CAPTAIN": "CAPT", "PIC": "CAPT", "F/O": "FO", "COPILOT": "FO", "OTH": "OTHER", "PAX": "CABIN", "CC": "CABIN", "FA": "CABIN", "TWR": "ATC", "APP": "ATC", "CTR": "ATC", "AC": "SYS", "AIRCRAFT": "SYS", "WX": "ENV", "MAINT": "GND", "GROUND": "GND", "INV": "OTHER", "NTSB": "OTHER", "MIL": "OTHER"}


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


SYN = {}
for fid, f in FACTORS.items():
    for term in [fid, f.get("name", "")] + list(f.get("synonyms", [])):
        SYN.setdefault(norm(term), fid)


def map_factor(fid):
    if fid in FACTORS:
        return fid
    n = norm(fid)
    if n in SYN:
        return SYN[n]
    for k, v in SYN.items():
        if k and (k in n or n in k) and len(k) > 6:
            return v
    return None


def fix(path):
    rec = json.loads(path.read_text())
    notes = rec.setdefault("extraction", {}).setdefault("notes", [])
    changes = []
    for key in ("cvr", "recommendations", "dissent", "safety_changes", "related", "sources", "chain", "events", "factors"):
        if rec.get(key) is None:
            rec[key] = []
            changes.append(f"{key} was null")
    if rec.get("route") is None:
        rec["route"] = {}
        changes.append("route was null")
    if rec.get("probable_cause") is None:
        rec["probable_cause"] = ""
        changes.append("probable_cause was null")
    if rec.get("agencies") is None:
        rec["agencies"] = []
    bad_cvr = [x for x in rec["cvr"] if not isinstance(x, dict)]
    if bad_cvr:
        rec["cvr"] = [x for x in rec["cvr"] if isinstance(x, dict)]
        changes.append(f"dropped {len(bad_cvr)} non-object cvr lines")
    bad_rec = [x for x in rec["recommendations"] if not isinstance(x, dict)]
    if bad_rec:
        rec["recommendations"] = [x for x in rec["recommendations"] if isinstance(x, dict)]
        changes.append(f"dropped {len(bad_rec)} non-object recommendations")
    rec["events"] = [e for e in rec["events"] if isinstance(e, dict)]
    rec["factors"] = [f for f in rec["factors"] if isinstance(f, dict)]
    rec["chain"] = [e for e in rec["chain"] if isinstance(e, (list, tuple)) and len(e) == 2]
    # factors
    mapping = {}
    keep = []
    for f in rec["factors"]:
        m = map_factor(f.get("id"))
        if m is None:
            changes.append(f"dropped unknown factor {f.get('id')}")
            continue
        if m != f.get("id"):
            changes.append(f"factor {f.get('id')} -> {m}")
            mapping[f["id"]] = m
            f["id"] = m
        if m in {x["id"] for x in keep}:
            continue
        keep.append(f)
    known = {f["id"] for f in keep}
    rec["factors"] = keep
    def mf(x):
        return mapping.get(x, x)
    rec["chain"] = [[mf(a), mf(b)] for a, b in rec["chain"] if isinstance((a, b), tuple) and mf(a) in known and mf(b) in known and mf(a) != mf(b)]
    seen = set()
    rec["chain"] = [e for e in rec["chain"] if not (tuple(e) in seen or seen.add(tuple(e)))]
    for ev in rec["events"]:
        if isinstance(ev.get("factors"), list):
            newf = [mf(x) for x in ev["factors"] if mf(x) in known]
            if newf != ev["factors"]:
                changes.append(f"event factors {ev['factors']} -> {newf}")
            ev["factors"] = newf
        ph = ev.get("phase")
        if ph and ph not in PHASES:
            ev["phase"] = PHASE_MAP.get(ph, "unknown")
            changes.append(f"phase {ph} -> {ev['phase']}")
        ac = ev.get("actor")
        if ac and ac not in ACTORS:
            ev["actor"] = ACTOR_MAP.get(ac.upper(), "OTHER")
            changes.append(f"actor {ac} -> {ev['actor']}")
    if all(isinstance(ev.get("t"), (int, float)) for ev in rec["events"]):
        srt = sorted(rec["events"], key=lambda e: e["t"])
        if srt != rec["events"]:
            rec["events"] = srt
            changes.append("events re-sorted by t")
    for r in rec["recommendations"]:
        if r.get("status") not in STATUS:
            r["status"] = "unknown"
        if isinstance(r.get("trigger_factors"), list):
            newt = [mf(x) for x in r["trigger_factors"] if mf(x) in known]
            if newt != r["trigger_factors"]:
                changes.append("recommendation trigger factors pruned")
            r["trigger_factors"] = newt
    for a in rec["agencies"]:
        if a.get("role") not in ROLES:
            changes.append(f"agency role {a.get('role')} -> participant")
            a["role"] = "participant"
    if not rec["agencies"] and rec.get("agency"):
        rec["agencies"] = [{"code": rec["agency"], "name": rec["agency"], "country": "unknown", "role": "lead"}]
        changes.append("agencies built from agency code")
    KINDS = {"system", "crew_action", "crew_speech", "atc", "env", "outcome", "warning"}
    for ev in rec["events"]:
        if ev.get("kind") not in KINDS:
            changes.append(f"event kind {ev.get('kind')} -> system")
            ev["kind"] = "system"
    if rec["agencies"] and not any(a.get("role") == "lead" for a in rec["agencies"]):
        rec["agencies"][0]["role"] = "lead"
        changes.append("first agency set as lead")
    if changes:
        notes.append("auto-repair: " + "; ".join(changes))
        path.write_text(json.dumps(rec, ensure_ascii=False, indent=1))
        print(f"{path.name}: {'; '.join(changes)}")
    else:
        print(f"{path.name}: no changes")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        fix(Path(p))
