#!/usr/bin/env python3
"""Carry Wikidata coordinates (P625) and Wikipedia article links into the catalog and report records.

Usage: python3 blackbox/pipeline/catalog/enrich_geo.py
Reads blackbox/cache/wikidata/accidents.jsonl (raw SPARQL rows) and updates in place:
  - blackbox/data/catalog/wikidata.jsonl   location.lat/lon, wikipedia
  - blackbox/data/reports/wd_*.json        location.lat/lon, wikipedia (matched by qid)
  - blackbox/data/reports/<curated>.json   wikipedia (matched through the catalog's curated_id)
Existing values are never overwritten.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "cache" / "wikidata" / "accidents.jsonl"
CATALOG = ROOT / "data" / "catalog" / "wikidata.jsonl"
REPORTS = ROOT / "data" / "reports"


def qid_of(item):
    for k in ("qid", "item", "id", "uri"):
        v = item.get(k)
        if isinstance(v, str):
            m = re.search(r"Q\d+", v)
            if m:
                return m.group(0)
    return None


def parse_point(wkt):
    if not isinstance(wkt, str):
        return None
    m = re.match(r"Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)", wkt)
    if not m:
        return None
    lon, lat = float(m.group(1)), float(m.group(2))
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lat, lon


def main():
    geo = {}
    for line in CACHE.read_text().splitlines():
        if not line.strip():
            continue
        it = json.loads(line)
        q = qid_of(it)
        if not q:
            continue
        pt = parse_point(it.get("coords"))
        art = it.get("article") if isinstance(it.get("article"), str) else None
        geo[q] = (pt, art)
    print(f"cache: {len(geo)} items, {sum(1 for p, _ in geo.values() if p)} with coordinates")

    def apply(rec):
        changed = False
        info = geo.get(rec.get("qid"))
        if not info:
            return False
        pt, art = info
        loc = rec.get("location") or {}
        if pt and loc.get("lat") is None:
            loc["lat"], loc["lon"] = round(pt[0], 4), round(pt[1], 4)
            rec["location"] = loc
            changed = True
        if art and not rec.get("wikipedia"):
            rec["wikipedia"] = art
            changed = True
        return changed

    rows = [json.loads(l) for l in CATALOG.read_text().splitlines() if l.strip()]
    n = sum(apply(r) for r in rows)
    CATALOG.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    print(f"wikidata.jsonl: {n} rows updated; {sum(1 for r in rows if (r.get('location') or {}).get('lat') is not None)} with coordinates, {sum(1 for r in rows if r.get('wikipedia'))} with wikipedia")

    curated_wiki = {r["curated_id"]: r.get("wikipedia") for r in rows if r.get("curated_id") and r.get("wikipedia")}
    n_wd = n_cur = 0
    for p in sorted(REPORTS.glob("*.json")):
        rec = json.loads(p.read_text())
        changed = False
        if rec.get("qid"):
            changed = apply(rec)
            n_wd += changed
        elif not rec.get("wikipedia") and curated_wiki.get(rec["id"]):
            rec["wikipedia"] = curated_wiki[rec["id"]]
            changed = True
            n_cur += 1
        if changed:
            p.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
    print(f"reports: {n_wd} deep-read records updated, {n_cur} curated records given a Wikipedia link")


if __name__ == "__main__":
    main()
