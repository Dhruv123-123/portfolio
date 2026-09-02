#!/usr/bin/env python3
"""Validate accident records and FDR files against the taxonomy and schema.

Usage: python3 blackbox/pipeline/validate.py [--strict]
Exit code 1 on any error. Warnings never fail the run unless --strict.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "data" / "reports"
FDR = ROOT / "data" / "fdr"
TAX = json.loads((ROOT / "data" / "taxonomy.json").read_text())
SCHEMA = json.loads((ROOT / "pipeline" / "schema" / "report.schema.json").read_text())

FACTOR_IDS = {f["id"] for f in TAX["factors"]}
PHASES = set(TAX["phases"])
ACTORS = set(TAX["actors"].keys())
REQUIRED_FDR = ["alt_ft", "ias_kt", "pitch_deg", "roll_deg", "hdg_deg", "vs_fpm"]


def check_type(value, spec, path, errors):
    """Tiny JSON-schema subset checker (type, enum, required, properties, items, pattern, minItems)."""
    import re
    t = spec.get("type")
    if t:
        types = t if isinstance(t, list) else [t]
        ok = False
        for ty in types:
            if ty == "string" and isinstance(value, str): ok = True
            elif ty == "number" and isinstance(value, (int, float)) and not isinstance(value, bool): ok = True
            elif ty == "integer" and isinstance(value, int) and not isinstance(value, bool): ok = True
            elif ty == "boolean" and isinstance(value, bool): ok = True
            elif ty == "object" and isinstance(value, dict): ok = True
            elif ty == "array" and isinstance(value, list): ok = True
            elif ty == "null" and value is None: ok = True
        if not ok:
            errors.append(f"{path}: expected {t}, got {type(value).__name__}")
            return
    if "enum" in spec and value not in spec["enum"]:
        errors.append(f"{path}: {value!r} not in {spec['enum']}")
    if "pattern" in spec and isinstance(value, str) and not re.match(spec["pattern"], value):
        errors.append(f"{path}: {value!r} does not match {spec['pattern']}")
    if isinstance(value, dict):
        for req in spec.get("required", []):
            if req not in value:
                errors.append(f"{path}: missing required '{req}'")
        for key, sub in spec.get("properties", {}).items():
            if key in value:
                check_type(value[key], sub, f"{path}.{key}", errors)
    if isinstance(value, list):
        if "minItems" in spec and len(value) < spec["minItems"]:
            errors.append(f"{path}: needs at least {spec['minItems']} items")
        if "maxItems" in spec and len(value) > spec["maxItems"]:
            errors.append(f"{path}: at most {spec['maxItems']} items")
        if "items" in spec:
            for i, item in enumerate(value):
                check_type(item, spec["items"], f"{path}[{i}]", errors)


def validate_record(path, records_by_id):
    errors, warnings = [], []
    try:
        rec = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        return [f"{path.name}: invalid JSON: {exc}"], []
    check_type(rec, SCHEMA, path.stem, errors)
    if rec.get("id") != path.stem:
        errors.append(f"{path.name}: id '{rec.get('id')}' does not match filename")
    factor_ids = {f.get("id") for f in (rec.get("factors") or [])}
    for fid in factor_ids:
        if fid not in FACTOR_IDS:
            errors.append(f"{path.stem}: unknown factor '{fid}'")
    if len(factor_ids) != len((rec.get("factors") or [])):
        warnings.append(f"{path.stem}: duplicate factor ids")
    for a, b in (rec.get("chain") or []):
        for x in (a, b):
            if x not in FACTOR_IDS:
                errors.append(f"{path.stem}: chain references unknown factor '{x}'")
            elif x not in factor_ids:
                errors.append(f"{path.stem}: chain factor '{x}' not listed in factors")
        if a == b:
            errors.append(f"{path.stem}: self-loop in chain '{a}'")
    if rec.get("phase") not in PHASES:
        errors.append(f"{path.stem}: unknown phase '{rec.get('phase')}'")
    last_t = None
    for i, ev in enumerate((rec.get("events") or [])):
        if ev.get("actor") not in ACTORS:
            errors.append(f"{path.stem}: event[{i}] unknown actor '{ev.get('actor')}'")
        if ev.get("phase") and ev["phase"] not in PHASES:
            errors.append(f"{path.stem}: event[{i}] unknown phase '{ev['phase']}'")
        for fid in ev.get("factors", []):
            if fid not in FACTOR_IDS:
                errors.append(f"{path.stem}: event[{i}] unknown factor '{fid}'")
            elif fid not in factor_ids:
                warnings.append(f"{path.stem}: event[{i}] factor '{fid}' not in record factors")
        if last_t is not None and ev.get("t", 0) < last_t:
            errors.append(f"{path.stem}: event[{i}] t={ev.get('t')} is before previous t={last_t}")
        last_t = ev.get("t", 0)
    last_t = None
    for i, line in enumerate((rec.get("cvr") or [])):
        if last_t is not None and line.get("t", 0) < last_t:
            errors.append(f"{path.stem}: cvr[{i}] t={line.get('t')} is before previous t={last_t}")
        last_t = line.get("t", 0)
    for i, r in enumerate((rec.get("recommendations") or [])):
        for fid in r.get("trigger_factors", []):
            if fid not in FACTOR_IDS:
                errors.append(f"{path.stem}: recommendation[{i}] unknown factor '{fid}'")
    for rid in rec.get("related", []):
        if rid not in records_by_id:
            warnings.append(f"{path.stem}: related record '{rid}' does not exist")
    if rec.get("fdr"):
        if not (FDR / f"{rec['fdr']}.json").exists():
            errors.append(f"{path.stem}: fdr file '{rec['fdr']}.json' missing")
    lead = [a for a in rec.get("agencies", []) if a.get("role") == "lead"]
    if not lead:
        errors.append(f"{path.stem}: no lead agency")
    elif lead[0]["code"] != rec.get("agency"):
        errors.append(f"{path.stem}: agency '{rec.get('agency')}' is not the lead agency '{lead[0]['code']}'")
    if len((rec.get("events") or [])) < 5:
        warnings.append(f"{path.stem}: only {len(rec.get('events', []))} events")
    return errors, warnings


def validate_fdr(path):
    errors, warnings = [], []
    try:
        fdr = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        return [f"{path.name}: invalid JSON: {exc}"], []
    if fdr.get("id") != path.stem:
        errors.append(f"{path.name}: id does not match filename")
    if not (REPORTS / f"{fdr.get('record')}.json").exists():
        errors.append(f"{path.stem}: record '{fdr.get('record')}' does not exist")
    params = fdr.get("params", {})
    for req in REQUIRED_FDR:
        if req not in params or not params[req].get("keys"):
            errors.append(f"{path.stem}: missing required param '{req}'")
    for name, p in params.items():
        if p.get("interp") not in ("linear", "step"):
            errors.append(f"{path.stem}: param '{name}' has bad interp")
        last = None
        for k in p.get("keys", []):
            if not (isinstance(k, list) and len(k) == 2 and isinstance(k[0], (int, float))):
                errors.append(f"{path.stem}: param '{name}' bad keyframe {k!r}")
                break
            if last is not None and k[0] < last:
                errors.append(f"{path.stem}: param '{name}' keyframes not sorted at t={k[0]}")
            last = k[0]
    if "t_start" not in fdr or "t_end" not in fdr:
        errors.append(f"{path.stem}: t_start/t_end missing")
    return errors, warnings


def main():
    strict = "--strict" in sys.argv
    records = sorted(REPORTS.glob("*.json"))
    ids = {p.stem for p in records}
    all_errors, all_warnings = [], []
    for p in records:
        e, w = validate_record(p, ids)
        all_errors += e
        all_warnings += w
    for p in sorted(FDR.glob("*.json")):
        e, w = validate_fdr(p)
        all_errors += e
        all_warnings += w
    for w in all_warnings:
        print(f"WARN  {w}")
    for e in all_errors:
        print(f"ERROR {e}")
    print(f"{len(records)} records, {len(list(FDR.glob('*.json')))} FDR files, {len(all_errors)} errors, {len(all_warnings)} warnings")
    if all_errors or (strict and all_warnings):
        sys.exit(1)


if __name__ == "__main__":
    main()
