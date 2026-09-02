#!/usr/bin/env python3
"""Cross-check deep-read records (data/reports/wd_*.json) against the catalog row they came from.

Flags records whose date differs from the catalog date by more than one day (the linked
report was about a different accident) or that are still depth "summary".
"""
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
cat = {}
for line in (ROOT / "data" / "catalog" / "wikidata.jsonl").read_text().splitlines():
    if line.strip():
        r = json.loads(line)
        cat[r["id"]] = r
bad = 0
for p in sorted((ROOT / "data" / "reports").glob("wd_*.json")):
    r = json.loads(p.read_text())
    c = cat.get(r["id"])
    if not c:
        print(f"{p.name}: not in catalog"); bad += 1; continue
    try:
        d1, d2 = date.fromisoformat(r["date"][:10]), date.fromisoformat(c["date"][:10])
        if abs((d1 - d2).days) > 1:
            print(f"{p.name}: date {r['date']} vs catalog {c['date']} ({c['title']}) -> wrong report?"); bad += 1
    except Exception as exc:
        print(f"{p.name}: bad date {exc}"); bad += 1
    if r.get("depth") == "summary":
        print(f"{p.name}: depth summary"); bad += 1
print(f"{bad} problems")
