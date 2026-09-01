#!/usr/bin/env python3
"""Fetch the worldwide aviation accident index from Wikidata.

Usage: python3 blackbox/pipeline/catalog/wikidata_fetch.py [--since 1900]
Writes blackbox/cache/wikidata/accidents.jsonl, one merged item per accident:
qid, label, description, date, deaths, injured, survivors, country, operator,
aircraft, registration, asn_id, investigators, coords, from, to, location, article.

Queries are split by year range because Wikidata's public endpoint times out
(and truncates output) on a single query with many OPTIONAL clauses.
"""
import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "cache" / "wikidata"
ENDPOINT = "https://query.wikidata.org/sparql"
UA = "blackbox-pipeline/1.0 (https://dhruvramasubban.com; dhruvramasubban@gmail.com)"

QUERY = """
SELECT ?item ?itemLabel ?itemDescription ?date ?deaths ?injured ?survivors ?countryLabel ?operatorLabel
       ?aircraftLabel ?registration ?asn ?investigatorLabel ?coords ?fromLabel ?toLabel ?locationLabel ?article WHERE {
  ?item wdt:P31/wdt:P279* wd:Q744913 .
  ?item wdt:P585 ?date .
  FILTER(YEAR(?date) >= %d && YEAR(?date) <= %d)
  OPTIONAL { ?item wdt:P1120 ?deaths } OPTIONAL { ?item wdt:P1339 ?injured } OPTIONAL { ?item wdt:P1561 ?survivors }
  OPTIONAL { ?item wdt:P17 ?country } OPTIONAL { ?item wdt:P137 ?operator } OPTIONAL { ?item wdt:P1876 ?aircraft }
  OPTIONAL { ?item wdt:P426 ?registration } OPTIONAL { ?item wdt:P1755 ?asn } OPTIONAL { ?item wdt:P1840 ?investigator }
  OPTIONAL { ?item wdt:P625 ?coords } OPTIONAL { ?item wdt:P1427 ?from } OPTIONAL { ?item wdt:P1444 ?to } OPTIONAL { ?item wdt:P276 ?location }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""

SINGLE = ["itemLabel", "itemDescription", "date", "deaths", "injured", "survivors", "countryLabel", "registration", "asn", "coords", "article"]
MULTI = ["operatorLabel", "aircraftLabel", "investigatorLabel", "fromLabel", "toLabel", "locationLabel"]


def run_query(y0, y1):
    for attempt in range(4):
        try:
            resp = requests.get(ENDPOINT, params={"query": QUERY % (y0, y1)}, headers={"Accept": "application/sparql-results+json", "User-Agent": UA}, timeout=180)
            if resp.status_code == 429:
                time.sleep(10 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp.json()["results"]["bindings"]
        except (requests.RequestException, ValueError) as exc:
            print(f"  retry {y0}-{y1}: {exc}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f"giving up on {y0}-{y1}")


def merge(bindings):
    items = {}
    for b in bindings:
        qid = b["item"]["value"].rsplit("/", 1)[-1]
        it = items.setdefault(qid, {"qid": qid, **{k: set() for k in MULTI}})
        for k in SINGLE:
            if k in b and k not in it:
                it[k] = b[k]["value"]
        for k in MULTI:
            if k in b:
                it[k].add(b[k]["value"])
    out = []
    for it in items.values():
        for k in MULTI:
            it[k] = sorted(it[k])
        out.append(it)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", type=int, default=1900)
    ap.add_argument("--until", type=int, default=2030)
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_items = {}
    ranges = []
    y = args.since
    while y <= args.until:
        span = 20 if y < 1960 else 5 if y < 2000 else 3
        ranges.append((y, min(args.until, y + span - 1)))
        y += span
    for y0, y1 in ranges:
        bindings = run_query(y0, y1)
        merged = merge(bindings)
        for it in merged:
            all_items[it["qid"]] = it
        print(f"{y0}-{y1}: {len(merged)} items ({len(all_items)} total)")
        time.sleep(1.5)
    with (OUT_DIR / "accidents.jsonl").open("w") as fh:
        for it in sorted(all_items.values(), key=lambda x: x.get("date", "")):
            fh.write(json.dumps(it, ensure_ascii=False) + "\n")
    print(f"wrote {len(all_items)} accidents to {OUT_DIR / 'accidents.jsonl'}")


if __name__ == "__main__":
    main()
