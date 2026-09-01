#!/usr/bin/env python3
"""Download final-report PDFs listed in sources.json into blackbox/cache/pdf/.

Usage: python3 blackbox/pipeline/fetch_reports.py [id ...]
Skips files already present. HTML landing pages are saved with .html so a
human can find the real PDF link; the fetch log records what happened.
"""
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
PDF_DIR = CACHE / "pdf"
LOG = CACHE / "fetch-log.json"
SOURCES = json.loads((ROOT / "pipeline" / "sources.json").read_text())["reports"]
HEADERS = {"User-Agent": "blackbox-pipeline/1.0 (+https://github.com/Dhruv123-123/portfolio)"}


def fetch(rec_id, entry, log):
    url = entry["url"]
    target = PDF_DIR / f"{rec_id}.pdf"
    if target.exists():
        log[rec_id] = {"status": "cached", "url": url}
        return
    for attempt in range(3):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=120, allow_redirects=True)
            ctype = resp.headers.get("content-type", "")
            if resp.ok and (b"%PDF" in resp.content[:1024] or "pdf" in ctype):
                target.write_bytes(resp.content)
                log[rec_id] = {"status": "ok", "url": resp.url, "bytes": len(resp.content)}
                print(f"ok      {rec_id} {len(resp.content)} bytes")
            else:
                (PDF_DIR / f"{rec_id}.html").write_bytes(resp.content)
                log[rec_id] = {"status": "not_pdf", "http": resp.status_code, "url": resp.url, "content_type": ctype}
                print(f"notpdf  {rec_id} http={resp.status_code} {ctype}")
            return
        except requests.RequestException as exc:
            log[rec_id] = {"status": "error", "url": url, "error": str(exc)}
            time.sleep(2 ** attempt)
    print(f"error   {rec_id} {log[rec_id]['error']}")


def main():
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    wanted = sys.argv[1:] or list(SOURCES)
    log = json.loads(LOG.read_text()) if LOG.exists() else {}
    for rec_id in wanted:
        if rec_id not in SOURCES:
            print(f"unknown {rec_id}")
            continue
        fetch(rec_id, SOURCES[rec_id], log)
        LOG.write_text(json.dumps(log, indent=2))


if __name__ == "__main__":
    main()
