#!/usr/bin/env python3
"""Merge Haiku batch outputs into blackbox/data/catalog/wikidata.jsonl and link
catalog rows to hand-reviewed full records.

Usage: python3 blackbox/pipeline/catalog/merge_catalog.py
Later batch outputs override earlier rows with the same id. Linking uses the
ASN id, registration, or date plus a title token overlap with a curated record.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCHES = ROOT / "cache" / "batches"
OUT = ROOT / "data" / "catalog" / "wikidata.jsonl"
REPORTS = ROOT / "data" / "reports"


def tokens(s):
    return {t for t in re.findall(r"[a-z0-9]+", (s or "").lower()) if len(t) > 2 and t not in {"flight", "air", "airlines", "airline", "airways", "the", "and"}}


def main():
    curated = [json.loads(p.read_text()) for p in REPORTS.glob("*.json")]
    by_date = {}
    for c in curated:
        by_date.setdefault(c["date"], []).append(c)
    rows = {}
    files = sorted(BATCHES.glob("batch_*.out.jsonl"))
    for path in files:
        for line in path.read_text().splitlines():
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("id"):
                rows[rec["id"]] = rec
    linked = 0
    for rec in rows.values():
        rec.pop("curated_id", None)
        cands = by_date.get(rec.get("date"), [])
        for c in cands:
            reg = (rec.get("aircraft") or {}).get("registration")
            same_reg = reg and c["aircraft"].get("registration") and reg.replace("-", "").upper() == c["aircraft"]["registration"].replace("-", "").upper()
            overlap = len(tokens(rec.get("title")) & tokens(c["title"]))
            if same_reg or overlap >= 2 or (rec.get("flight_number") and c.get("flight_number") and rec["flight_number"].replace(" ", "").upper() == c["flight_number"].replace(" ", "").upper()):
                rec["curated_id"] = c["id"]
                linked += 1
                break
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w") as fh:
        for rec in sorted(rows.values(), key=lambda r: r.get("date", "")):
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"merged {len(files)} batch files -> {len(rows)} records ({linked} linked to curated records) -> {OUT}")


if __name__ == "__main__":
    main()
