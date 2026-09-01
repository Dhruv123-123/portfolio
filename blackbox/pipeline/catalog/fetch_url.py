#!/usr/bin/env python3
"""Download one report URL (PDF or HTML) and extract its text for deepening.

Usage: python3 blackbox/pipeline/catalog/fetch_url.py <id> <url> [--max-pages 400]
Writes blackbox/cache/pdf/<id>.pdf (or .html) and blackbox/cache/text/<id>.txt
with "<<< page N >>>" markers, then prints a section map (heading -> line
numbers) so a reader can jump to Synopsis / Findings / Probable Cause /
Recommendations without reading the whole file.
"""
import argparse
import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
PDF_DIR = ROOT / "cache" / "pdf"
TEXT_DIR = ROOT / "cache" / "text"
HEADINGS = re.compile(r"^\s*(?:\d+(?:\.\d+)*\.?\s+)?(synopsis|summary|executive summary|abstract|history of (the )?flight|sequence of events|factual information|analysis|conclusions?|findings|causes?|probable cause|contributing factors|safety recommendations?|recommendations?|flight recorders?|cockpit voice recorder|wreckage)\b.{0,60}$", re.I | re.M)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("url")
    ap.add_argument("--max-pages", type=int, default=400)
    args = ap.parse_args()
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    TEXT_DIR.mkdir(parents=True, exist_ok=True)
    out_txt = TEXT_DIR / f"{args.id}.txt"
    if not out_txt.exists():
        resp = requests.get(args.url, headers={"User-Agent": "blackbox-pipeline/1.0 (+https://dhruvramasubban.com)"}, timeout=180, allow_redirects=True)
        resp.raise_for_status()
        is_pdf = resp.content[:5] == b"%PDF-" or "pdf" in resp.headers.get("content-type", "")
        if is_pdf:
            import pymupdf
            path = PDF_DIR / f"{args.id}.pdf"
            path.write_bytes(resp.content)
            doc = pymupdf.open(path)
            pages = [f"\n\n<<< page {i + 1} >>>\n{page.get_text('text')}" for i, page in enumerate(doc) if i < args.max_pages]
            out_txt.write_text("".join(pages))
        else:
            path = PDF_DIR / f"{args.id}.html"
            path.write_bytes(resp.content)
            html = resp.text
            html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.S | re.I)
            text = re.sub(r"<[^>]+>", "\n", html)
            text = re.sub(r"\n\s*\n+", "\n\n", text)
            out_txt.write_text("<<< page 1 >>>\n" + text)
    text = out_txt.read_text()
    lines = text.splitlines()
    print(f"{out_txt}: {len(lines)} lines, {len(text)} chars")
    print("section map (line: heading):")
    shown = 0
    for i, line in enumerate(lines, 1):
        if HEADINGS.match(line) and len(line) < 90:
            print(f"  {i}: {line.strip()}")
            shown += 1
            if shown > 80:
                print("  ...")
                break


if __name__ == "__main__":
    main()
