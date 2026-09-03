#!/usr/bin/env python3
"""Audit worker-written FDR files against the evidence the record actually holds.

Usage: python3 blackbox/pipeline/fdr/audit_fdr.py [--apply]
Rules (a file failing any is listed; with --apply it is deleted and the record's fdr unset):
  - schematic files need at least 4 events in the record with an altitude or speed state
  - narrative files need cached report text for the record (or 4 stated events)
  - t_end - t_start must be between 20 s and 5 h
  - altitude must move: max - min of alt_ft over the file >= 100 ft (or the record is a ground/landing case)
  - check_fdr.py must pass
The six hand-digitised files (fidelity reconstructed/tabulated) are never touched.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "data" / "reports"
FDR = ROOT / "data" / "fdr"
TEXT = ROOT / "cache" / "text"


def stated(rec):
    return sum(1 for e in rec.get("events", []) if e.get("state") and any(k in e["state"] for k in ("alt", "ias", "gs", "ra", "vs")))


def main():
    apply = "--apply" in sys.argv
    bad = []
    kept = 0
    for p in sorted(FDR.glob("*.json")):
        try:
            f = json.loads(p.read_text())
        except Exception as e:
            bad.append((p, f"unreadable: {e}"))
            continue
        if f.get("fidelity") in ("reconstructed", "tabulated"):
            kept += 1
            continue
        rp = REPORTS / f"{f.get('record', p.stem)}.json"
        if not rp.exists():
            bad.append((p, "record missing"))
            continue
        rec = json.loads(rp.read_text())
        n = stated(rec)
        has_text = (TEXT / f"{rec['id']}.txt").exists() and os.path.getsize(TEXT / f"{rec['id']}.txt") > 4000
        reasons = []
        if f.get("fidelity") == "schematic" and n < 4:
            reasons.append(f"schematic with only {n} stated events")
        if f.get("fidelity") == "narrative" and not has_text and n < 4:
            reasons.append("narrative without report text")
        span = (f.get("t_end") or 0) - (f.get("t_start") or 0)
        if not (20 <= span <= 5 * 3600):
            reasons.append(f"span {span:.0f} s")
        alt = [k[1] for k in f.get("params", {}).get("alt_ft", {}).get("keys", []) if isinstance(k[1], (int, float))]
        if alt and max(alt) - min(alt) < 100 and rec.get("phase") not in ("ground", "taxi", "landing", "takeoff"):
            reasons.append("altitude never moves")
        r = subprocess.run([sys.executable, str(ROOT / "pipeline" / "fdr" / "check_fdr.py"), str(p)], capture_output=True, text=True)
        if r.returncode != 0:
            reasons.append("check_fdr: " + r.stdout.strip().splitlines()[0][:120])
        if reasons:
            bad.append((p, "; ".join(reasons)))
        else:
            kept += 1
    for p, why in bad:
        print(f"REJECT {p.name}: {why}")
        if apply:
            rec_path = REPORTS / f"{p.stem}.json"
            if rec_path.exists():
                rec = json.loads(rec_path.read_text())
                if rec.get("fdr") == p.stem:
                    rec["fdr"] = None
                    rec_path.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
            p.unlink()
    print(f"kept {kept}, rejected {len(bad)}{' (applied)' if apply else ''}")


if __name__ == "__main__":
    main()
