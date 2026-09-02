#!/usr/bin/env python3
"""Download and text-extract official reports for deepening candidates ahead of the workers.

Usage: python3 blackbox/pipeline/catalog/prefetch_reports.py [--prefix cand] [--limit 200] [--min-chars 4000]
Reads blackbox/cache/deepen/<prefix>_*.json (from make_deepen_batches.py), tries each
item's report links in order with fetch_url.py until one yields at least --min-chars of
text, and appends one JSON line per item to blackbox/cache/deepen/prefetch.jsonl:
{"id", "url", "chars", "ok"}. Items already listed there are skipped, so the script can
be re-run. Workers are then given only items whose report text is on disk.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEEPEN = ROOT / "cache" / "deepen"
TEXT = ROOT / "cache" / "text"
LOG = DEEPEN / "prefetch.jsonl"
SKIP = re.compile(r"wikipedia|youtube|books\.google|news\.google|registry\.faa\.gov|archive\.org", re.I)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", default="cand")
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--min-chars", type=int, default=4000)
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--nshards", type=int, default=1)
    args = ap.parse_args()
    done = {}
    if LOG.exists():
        for line in LOG.read_text().splitlines():
            if line.strip():
                row = json.loads(line)
                done[row["id"]] = row
    items = []
    for path in sorted(DEEPEN.glob(f"{args.prefix}_*.json")):
        items.extend(json.loads(path.read_text()))
    items = items[: args.limit]
    items = [it for i, it in enumerate(items) if i % args.nshards == args.shard]
    for it in items:
        if it["id"] in done:
            continue
        result = {"id": it["id"], "title": it["title"], "url": None, "chars": 0, "ok": False, "tried": []}
        for url in it["report_links"]:
            if SKIP.search(url):
                continue
            txt = TEXT / f"{it['id']}.txt"
            if txt.exists() and len(txt.read_text()) < args.min_chars:
                txt.unlink()  # a previous attempt produced junk; try again with the next link
            proc = subprocess.run([sys.executable, str(ROOT / "pipeline" / "catalog" / "fetch_url.py"), it["id"], url], capture_output=True, text=True, timeout=1500)
            chars = len(txt.read_text()) if txt.exists() else 0
            result["tried"].append({"url": url, "rc": proc.returncode, "chars": chars})
            if proc.returncode == 0 and chars >= args.min_chars:
                result.update(url=url, chars=chars, ok=True)
                break
            if txt.exists():
                txt.unlink()
        with LOG.open("a") as fh:
            fh.write(json.dumps(result, ensure_ascii=False) + "\n")
        print(f"{it['id']} {it['title'][:40]!r}: {'OK ' + str(result['chars']) + ' chars' if result['ok'] else 'no usable report'}", flush=True)


if __name__ == "__main__":
    main()
