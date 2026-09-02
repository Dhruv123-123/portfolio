#!/usr/bin/env python3
"""Select catalog records worth a deep read of their official report and write
batches for the deepening workers.

Usage: python3 blackbox/pipeline/catalog/make_deepen_batches.py [--size 4] [--limit 200] [--prefix deepen]
Picks Wikidata catalog rows (data/catalog/wikidata.jsonl) that have a report
link on an investigation-agency domain, are not already covered by a
hand-reviewed record, and ranks them by interest. Writes
blackbox/cache/deepen/<prefix>_NNN.json.
"""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "data" / "catalog" / "wikidata.jsonl"
REPORTS = ROOT / "data" / "reports"
OUT = ROOT / "cache" / "deepen"
OFFICIAL = re.compile(r"ntsb\.gov|bea\.aero|bea-fr|gov\.uk/(aaib|government)|aaib\.gov|\.aaib\.|/aaib/|tsb\.gc\.ca|atsb\.gov\.au|bfu-web|onderzoeksraad|ansv\.it|jtsb|mlit\.go\.jp|ciaiac|fomento\.gob|mitma|mak-iac|knkt|dephub|aaiu\.ie|sust\.admin\.ch|havarikommisjonen|aibn|gcaa\.gov\.ae|caa\.|dgac|aib\.gov|ecaa|faa\.gov|bst-tsb|taic\.org\.nz|aaiasb|cenipa|fab\.mil\.br|jiaac|ecaa\.gov|ntsb\.gov|libraryonline\.erau\.edu|lessonslearned\.faa\.gov|rvs-bi\.de|bfu|enac|sia\.gov\.it|bfu\.admin\.ch|luftfahrt-bundesamt|ib\.gov|dgca|aaib\.gov|aaiu", re.I)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=4)
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--prefix", default="deepen")
    ap.add_argument("--only-fetched", action="store_true", help="only items whose report text is already in cache/text (see prefetch_reports.py)")
    ap.add_argument("--exclude-prefixes", default="", help="comma-separated batch prefixes whose items are already assigned")
    args = ap.parse_args()
    if not CATALOG.exists():
        raise SystemExit("run merge_catalog.py first")
    existing = {p.stem for p in REPORTS.glob("*.json")}
    for pref in [x for x in args.exclude_prefixes.split(",") if x]:
        for path in OUT.glob(f"{pref}_*.json"):
            existing.update(it["id"] for it in json.loads(path.read_text()))
    fetched = {}
    if args.only_fetched:
        log = OUT / "prefetch.jsonl"
        for line in log.read_text().splitlines() if log.exists() else []:
            row = json.loads(line)
            if row.get("ok"):
                fetched[row["id"]] = row["url"]
    rows = []
    for line in CATALOG.read_text().splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        if rec["id"] in existing or rec.get("curated_id") in existing:
            continue
        links = [l for l in rec.get("report_links", []) if OFFICIAL.search(urlparse(l).netloc + "/" + urlparse(l).path.strip("/").split("/")[0]) and not re.search(r"registry\.faa\.gov|news\.google|youtube|books\.google", l, re.I)]
        if not links:
            continue
        if args.only_fetched:
            if rec["id"] not in fetched:
                continue
            links = [fetched[rec["id"]]] + [l for l in links if l != fetched[rec["id"]]]
        rows.append({"id": rec["id"], "qid": rec.get("qid"), "title": rec["title"], "date": rec["date"], "interest": rec.get("interest", 0), "report_links": links[:5], "text_path": str(ROOT / "cache" / "text" / f"{rec['id']}.txt") if rec["id"] in fetched else None, "summary_record": rec})
    rows.sort(key=lambda r: -r["interest"])
    rows = rows[: args.limit]
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob(f"{args.prefix}_*.json"):
        old.unlink()
    n = 0
    for i in range(0, len(rows), args.size):
        (OUT / f"{args.prefix}_{i // args.size:03d}.json").write_text(json.dumps(rows[i : i + args.size], ensure_ascii=False, indent=1))
        n += 1
    print(f"{len(rows)} candidates -> {n} deepen batches of {args.size} in {OUT}")
    print("top:", [(r["title"], r["interest"]) for r in rows[:8]])


if __name__ == "__main__":
    main()
