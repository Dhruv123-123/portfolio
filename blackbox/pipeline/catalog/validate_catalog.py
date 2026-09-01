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


import re

STOP = set("about after aircraft airline airlines airport approach before began cabin captain continued crashed crew during first flight flying killed landed landing minutes normal normally operated operating passengers pilot pilots proceeded reported runway scheduled second shortly takeoff which while would there their these those where after before because however".split())
GENERIC = re.compile(r"^(aircraft|the aircraft|airplane|flight) (departed|took off|began (its )?descent|approached|proceeded|continued|crashed( with \d+ fatalities)?|impacted terrain)\.?$", re.I)


def content_tokens(text):
    return {w for w in re.findall(r"[a-z0-9][a-z0-9'-]{4,}", (text or "").lower()) if w not in STOP}


def check_grounding(rec, item, errors, where, seen_events):
    """Every event, factor evidence and the summary must reuse specific words from the source text."""
    if not item:
        return
    source = content_tokens(item.get("text", "")) | content_tokens(item.get("label", "")) | content_tokens(item.get("description", ""))
    rich = len(item.get("text") or "") > 800
    lead = (item.get("text") or "").strip().split("\n")[0][:160].lower()
    if rec.get("summary", "").lstrip().startswith("["):
        errors.append(f"{where}: summary starts with a section marker; write prose")
    for i, e in enumerate(rec.get("events", [])):
        text = e.get("text", "")
        if text.lstrip().startswith("["):
            errors.append(f"{where}: event[{i}] starts with a section marker")
        if "\n" in text or len(text) > 320 or not re.match(r"^[A-Z0-9\"'(]", text.strip()):
            errors.append(f"{where}: event[{i}] is a text fragment, not a written sentence ({text[:50]!r})")
        if lead and len(lead) > 60 and text.strip().lower()[:80] == lead[:80]:
            errors.append(f"{where}: event[{i}] is the article's lead sentence, not an event")
        if re.search(r"\bwas a (scheduled|regular|chartered|domestic|international)\b", text, re.I):
            errors.append(f"{where}: event[{i}] is descriptive boilerplate, not an event")
        if GENERIC.match(text.strip()):
            errors.append(f"{where}: event[{i}] is a generic template sentence ({text!r}); describe what the article says happened")
            continue
        if rich and len(text) < 30:
            errors.append(f"{where}: event[{i}] too short to be specific ({text!r})")
        overlap = content_tokens(text) & source
        if rich and len(overlap) < 2:
            errors.append(f"{where}: event[{i}] not grounded in the source text ({text[:60]!r})")
        key = text.strip().lower()
        if key in seen_events:
            errors.append(f"{where}: event[{i}] duplicates an event in record {seen_events[key]}")
        else:
            seen_events[key] = rec.get("id")
    for f in rec.get("factors", []):
        ev = f.get("evidence") or ""
        if rich and (len(ev) < 20 or len(content_tokens(ev) & source) < 2):
            errors.append(f"{where}: factor {f.get('id')} evidence not grounded in the source text ({ev[:60]!r})")
    if rich and len(content_tokens(rec.get("summary", "")) & source) < 8:
        errors.append(f"{where}: summary shares too few specific words with the source text")


def check_richness(rec, text_len, errors, where):
    """Records built from substantial text must not be skeletons."""
    if text_len is None:
        return
    if rec.get("text_mismatch") is True and rec.get("extraction", {}).get("confidence") == "low" and len(rec.get("factors", [])) <= 2:
        return  # the fetched text was not about this accident; a minimal low-confidence record is the honest output
    if text_len > 3500:
        need = (4, 2, 4, 250)
    elif text_len > 1500:
        need = (3, 1, 3, 180)
    else:
        return
    f, c, e, s = need
    if len(rec.get("factors", [])) < f:
        errors.append(f"{where}: text has {text_len} chars but only {len(rec.get('factors', []))} factors (need >= {f})")
    if len(rec.get("chain", [])) < c:
        errors.append(f"{where}: text has {text_len} chars but only {len(rec.get('chain', []))} chain edges (need >= {c})")
    if len(rec.get("events", [])) < e:
        errors.append(f"{where}: text has {text_len} chars but only {len(rec.get('events', []))} events (need >= {e})")
    if len(rec.get("summary", "")) < s:
        errors.append(f"{where}: summary is {len(rec.get('summary', ''))} chars (need >= {s} for this much source text)")


def check(rec, errors, where):
    for k in REQUIRED:
        if k not in rec:
            errors.append(f"{where}: missing '{k}'")
    if not isinstance(rec.get("aircraft"), dict) or not rec["aircraft"].get("type") or not rec["aircraft"].get("manufacturer"):
        errors.append(f"{where}: aircraft.type and aircraft.manufacturer required")
    if not (isinstance(rec.get("date"), str) and len(rec["date"]) == 10):
        errors.append(f"{where}: date must be YYYY-MM-DD")
    if not re.match(r"^[A-Z][A-Z0-9-]{1,14}$", str(rec.get("agency") or "")):
        errors.append(f"{where}: agency must be a short agency code like NTSB, BEA, AAIB, CAB, IAC or UNKNOWN (got {rec.get('agency')!r})")
    if rec.get("phase") not in PHASES:
        errors.append(f"{where}: bad phase {rec.get('phase')!r}")
    if rec.get("category") not in CATEGORIES:
        errors.append(f"{where}: bad category {rec.get('category')!r}")
    if rec.get("depth") not in {"summary", "sections", "full"}:
        errors.append(f"{where}: bad depth {rec.get('depth')!r}")
    if rec.get("tier") not in {"wikidata", "ntsb"}:
        errors.append(f"{where}: bad tier {rec.get('tier')!r}")
    fids = set()
    ids_seen = [f.get("id") for f in rec.get("factors", []) if isinstance(f, dict)]
    if len(ids_seen) != len(set(ids_seen)):
        errors.append(f"{where}: duplicate factor ids")
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
        batch_in = path.with_name(path.name.replace(".out.jsonl", ".json"))
        text_lens = {}
        items = {}
        seen_events = {}
        if batch_in.exists() and batch_in != path:
            for item in json.loads(batch_in.read_text()):
                text_lens[item["id"]] = len(item.get("text") or "")
                items[item["id"]] = item
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
            check_richness(rec, text_lens.get(rec.get("id")), errors, f"{path.name}:{n} ({rec.get('id')})")
            check_grounding(rec, items.get(rec.get("id")), errors, f"{path.name}:{n} ({rec.get('id')})", seen_events)
        dup = {i for i in ids if ids.count(i) > 1}
        if dup:
            errors.append(f"{path.name}: duplicate ids {sorted(dup)}")
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
