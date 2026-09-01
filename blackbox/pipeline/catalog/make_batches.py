#!/usr/bin/env python3
"""Rank Wikidata accidents by interest and write extraction batches for the
Haiku subagents.

Usage: python3 blackbox/pipeline/catalog/make_batches.py [--size 20] [--only-missing]
Writes blackbox/cache/batches/batch_NNN.json (input) and batches/manifest.json.
Each batch item carries the Wikidata fields plus a trimmed Wikipedia text (lead
and the accident/investigation/cause sections, capped) and candidate report links.
"""
import argparse
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WD = ROOT / "cache" / "wikidata" / "accidents.jsonl"
WP = ROOT / "cache" / "wikipedia"
OUT = ROOT / "cache" / "batches"
CATALOG = ROOT / "data" / "catalog" / "wikidata.jsonl"

AIRLINER = re.compile(r"\b(boeing|airbus|mcdonnell|douglas dc|douglas|lockheed|tupolev|ilyushin|antonov|yakovlev|atr|embraer|bombardier|fokker|bae|british aerospace|de havilland|dash 8|comac|concorde|convair|vickers|sud aviation|caravelle|hawker siddeley|trident|saab|dornier|beechcraft 1900|let l-410|sukhoi superjet|il-|tu-|an-|yak-|md-|dc-|a3\d\d|7\d7|crj|erj|e-jet|bac one-eleven)\b", re.I)
SECTION_RE = re.compile(r"^==+\s*(.*?)\s*==+$", re.M)
WANTED = re.compile(r"accident|crash|incident|flight|investigation|cause|findings|aftermath|sequence|background|aircraft|crew|conclusion|report|analysis|response|recommendation", re.I)
SKIP = re.compile(r"see also|references|external links|notes|bibliography|further reading|in popular culture|dramatization|media|gallery", re.I)
REPORT_DOMAINS = ("ntsb.gov", "bea.aero", "aaib", "tsb.gc.ca", "atsb.gov.au", "skybrary.aero", "faa.gov", "fss.aero", "aaiu.ie", "bfu-web.de", "onderzoeksraad.nl", "ansv.it", "jtsb.mlit.go.jp", "ciaiac", "mak-iac.org", "knkt", "aaib.gov", "aviation-safety.net", "gov.uk/aaib", "caa.", "dgac", "gcaa.gov.ae", "aib.gov", "safety board", "mlit.go.jp", "bea-fr", "sust.admin.ch", "havarikommisjonen", "ecaa", "airaccident")


def trim_text(extract, cap=6500):
    if not extract:
        return ""
    parts = SECTION_RE.split(extract)
    lead = parts[0].strip()
    out = [lead[:1800]]
    total = len(out[0])
    i = 1
    while i < len(parts) - 1 and total < cap:
        heading, body = parts[i].strip(), parts[i + 1].strip()
        i += 2
        if not body or SKIP.search(heading):
            continue
        if not WANTED.search(heading) and total > 2500:
            continue
        chunk = body[: min(2200, cap - total)]
        out.append(f"[{heading}] {chunk}")
        total += len(chunk)
    return "\n\n".join(out)


def report_links(extlinks):
    links = []
    for l in extlinks or []:
        low = l.lower()
        if "wikipedia" in low or "wikimedia" in low or "youtube" in low or "books.google" in low:
            continue
        if low.endswith(".pdf") or any(d in low for d in REPORT_DOMAINS) or "report" in low:
            links.append(l)
    # de-duplicate archived copies of the same file
    seen = set()
    uniq = []
    for l in links:
        key = l.split("web.archive.org/web/")[-1].split("/", 1)[-1] if "web.archive.org" in l else l
        key = key.lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(l)
    return uniq[:8]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def interest(it, wp):
    deaths = num(it.get("deaths"))
    score = 2.0 * math.log1p(deaths)
    if wp and wp.get("extract"):
        score += 2.0 + min(2.0, len(wp["extract"]) / 15000)
    if wp and report_links(wp.get("extlinks")):
        score += 3.0
    aircraft = " ".join(it.get("aircraftLabel", []))
    if AIRLINER.search(aircraft):
        score += 2.0
    if it.get("investigatorLabel"):
        score += 1.0
    if it.get("asn"):
        score += 0.5
    return round(score, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=20)
    ap.add_argument("--only-missing", action="store_true", help="skip accidents already present in data/catalog/wikidata.jsonl")
    ap.add_argument("--prefix", default="batch", help="batch file prefix, e.g. wave2 -> wave2_000.json")
    ap.add_argument("--limit", type=int, default=0, help="only write the top N accidents")
    ap.add_argument("--require-text", action="store_true", help="only accidents whose Wikipedia text has been fetched")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    done = set()
    if args.only_missing and CATALOG.exists():
        for line in CATALOG.read_text().splitlines():
            if line.strip():
                done.add(json.loads(line).get("qid"))
    items = [json.loads(l) for l in WD.read_text().splitlines()]
    rows = []
    for it in items:
        if it["qid"] in done:
            continue
        wp_path = WP / f"{it['qid']}.json"
        wp = json.loads(wp_path.read_text()) if wp_path.exists() else None
        rows.append({
            "qid": it["qid"],
            "id": f"wd_{it['qid'].lower()}",
            "label": it.get("itemLabel"),
            "description": it.get("itemDescription"),
            "date": (it.get("date") or "")[:10],
            "deaths": int(num(it.get("deaths"))) if num(it.get("deaths")) else None,
            "injured": int(num(it.get("injured"))) if num(it.get("injured")) else None,
            "survivors": int(num(it.get("survivors"))) if num(it.get("survivors")) else None,
            "country": it.get("countryLabel"),
            "operators": it.get("operatorLabel", []),
            "aircraft": it.get("aircraftLabel", []),
            "registration": it.get("registration"),
            "asn_id": it.get("asn"),
            "investigators": it.get("investigatorLabel", []),
            "coords": it.get("coords"),
            "from": it.get("fromLabel", []),
            "to": it.get("toLabel", []),
            "location": it.get("locationLabel", []),
            "wikipedia": it.get("article"),
            "report_links": report_links(wp.get("extlinks")) if wp else [],
            "interest": interest(it, wp),
            "text": trim_text(wp.get("extract")) if wp else (it.get("itemDescription") or "")
        })
    if args.require_text:
        rows = [r for r in rows if len(r["text"]) > 300]
    rows.sort(key=lambda r: (-r["interest"], r["date"]))
    if args.limit:
        rows = rows[: args.limit]
    for old in OUT.glob(f"{args.prefix}_*.json"):
        if not old.name.endswith(".out.jsonl"):
            old.unlink()
    manifest = []
    for i in range(0, len(rows), args.size):
        batch = rows[i : i + args.size]
        name = f"{args.prefix}_{i // args.size:03d}"
        (OUT / f"{name}.json").write_text(json.dumps(batch, ensure_ascii=False, indent=1))
        manifest.append({"name": name, "n": len(batch), "min_interest": batch[-1]["interest"], "max_interest": batch[0]["interest"], "ids": [r["id"] for r in batch]})
    (OUT / f"{args.prefix}_manifest.json").write_text(json.dumps(manifest, indent=1))
    with_text = sum(1 for r in rows if len(r["text"]) > 300)
    with_reports = sum(1 for r in rows if r["report_links"])
    print(f"{len(rows)} accidents -> {len(manifest)} batches of {args.size}; {with_text} with article text, {with_reports} with report links")
    print("top 10:", [(r['label'], r['interest']) for r in rows[:10]])


if __name__ == "__main__":
    main()
