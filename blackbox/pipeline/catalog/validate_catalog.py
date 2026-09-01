#!/usr/bin/env python3
"""Validate catalog batch outputs (JSONL) against the taxonomy and the catalog
schema rules in SPEC.md.

Usage: python3 blackbox/pipeline/catalog/validate_catalog.py <file.jsonl> [more.jsonl ...]
Prints one ERROR line per problem and exits 1 if any. Also reports which batch
input ids are missing from the output when the input batch file sits next to it.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TAX = json.loads((ROOT / "data" / "taxonomy.json").read_text())
FACTORS = {f["id"] for f in TAX["factors"]}
PHASES = set(TAX["phases"])
ACTORS = set(TAX["actors"])
ROLES = {"initiating", "contributing", "latent", "outcome"}
KINDS = {"system", "crew_action", "crew_speech", "atc", "env", "outcome", "warning"}
CATEGORIES = {"LOC-I", "CFIT", "RE", "RI", "SCF-PP", "SCF-NP", "F-NI", "F-POST", "MAC", "FUEL", "ICE", "WSTRW", "USOS", "ARC", "TURB", "OTHR", "UNK", "SEC", "MED", "CABIN", "GCOL", "ADRM", "RAMP", "ATM", "AMAN", "LALT", "EVAC", "LOC-G", "BIRD", "EXTL", "GTOW", "WILD", "NAV", "CTOL", "UIMC", "LALT"}
REQUIRED = ["id", "title", "date", "tier", "depth", "agency", "aircraft", "operator", "phase", "category", "summary", "factors", "chain", "events", "extraction"]


def check(rec, errors, where):
    for k in REQUIRED:
        if k not in rec:
            errors.append(f"{where}: missing '{k}'")
    if not isinstance(rec.get("aircraft"), dict) or not rec["aircraft"].get("type") or not rec["aircraft"].get("manufacturer"):
        errors.append(f"{where}: aircraft.type and aircraft.manufacturer required")
    if not (isinstance(rec.get("date"), str) and len(rec["date"]) == 10):
        errors.append(f"{where}: date must be YYYY-MM-DD")
    if rec.get("phase") not in PHASES:
        errors.append(f"{where}: bad phase {rec.get('phase')!r}")
    if rec.get("category") not in CATEGORIES:
        errors.append(f"{where}: bad category {rec.get('category')!r}")
    if rec.get("depth") not in {"summary", "sections", "full"}:
        errors.append(f"{where}: bad depth {rec.get('depth')!r}")
    if rec.get("tier") not in {"wikidata", "ntsb"}:
        errors.append(f"{where}: bad tier {rec.get('tier')!r}")
    fids = set()
    for f in rec.get("factors", []):
        if not isinstance(f, dict) or f.get("id") not in FACTORS:
            errors.append(f"{where}: unknown factor {f.get('id') if isinstance(f, dict) else f!r}")
            continue
        if f.get("role") not in ROLES:
            errors.append(f"{where}: factor {f['id']} bad role {f.get('role')!r}")
        fids.add(f["id"])
    for edge in rec.get("chain", []):
        if not (isinstance(edge, list) and len(edge) == 2):
            errors.append(f"{where}: bad chain edge {edge!r}")
            continue
        for x in edge:
            if x not in fids:
                errors.append(f"{where}: chain factor '{x}' not in factors")
        if edge[0] == edge[1]:
            errors.append(f"{where}: self loop {edge[0]}")
    events = rec.get("events", [])
    if not events:
        errors.append(f"{where}: needs at least one event")
    last = None
    for i, e in enumerate(events):
        if not isinstance(e.get("t"), (int, float)):
            errors.append(f"{where}: event[{i}] t must be a number")
            continue
        if e.get("actor") not in ACTORS:
            errors.append(f"{where}: event[{i}] bad actor {e.get('actor')!r}")
        if e.get("kind") and e["kind"] not in KINDS:
            errors.append(f"{where}: event[{i}] bad kind {e['kind']!r}")
        if e.get("phase") and e["phase"] not in PHASES:
            errors.append(f"{where}: event[{i}] bad phase {e['phase']!r}")
        for fid in e.get("factors", []):
            if fid not in fids:
                errors.append(f"{where}: event[{i}] factor '{fid}' not in factors")
        if last is not None and e["t"] < last:
            errors.append(f"{where}: event[{i}] out of order")
        last = e["t"]
        if not e.get("text"):
            errors.append(f"{where}: event[{i}] empty text")
    ex = rec.get("extraction", {})
    if ex.get("confidence") not in {"high", "medium", "low"}:
        errors.append(f"{where}: extraction.confidence must be high|medium|low")
    if not rec.get("summary") or len(rec["summary"]) < 40:
        errors.append(f"{where}: summary too short")


def main():
    files = [Path(p) for p in sys.argv[1:]]
    if not files:
        sys.exit(__doc__)
    total_errors = 0
    for path in files:
        errors = []
        ids = []
        for n, line in enumerate(path.read_text().splitlines(), 1):
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError as exc:
                errors.append(f"{path.name}:{n}: invalid JSON ({exc})")
                continue
            ids.append(rec.get("id"))
            check(rec, errors, f"{path.name}:{n} ({rec.get('id')})")
        dup = {i for i in ids if ids.count(i) > 1}
        if dup:
            errors.append(f"{path.name}: duplicate ids {sorted(dup)}")
        batch_in = path.with_name(path.name.replace(".out.jsonl", ".json"))
        if batch_in.exists() and batch_in != path:
            wanted = [r["id"] for r in json.loads(batch_in.read_text())]
            missing = [i for i in wanted if i not in ids]
            if missing:
                errors.append(f"{path.name}: {len(missing)} input ids missing from output: {missing}")
        for e in errors:
            print("ERROR", e)
        print(f"{path.name}: {len(ids)} records, {len(errors)} errors")
        total_errors += len(errors)
    sys.exit(1 if total_errors else 0)


if __name__ == "__main__":
    main()
