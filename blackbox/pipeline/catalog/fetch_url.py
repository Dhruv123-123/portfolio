#!/usr/bin/env python3
"""Download one report URL (PDF or HTML) and extract its text for deepening.

Usage: python3 blackbox/pipeline/catalog/fetch_url.py <id> <url> [--max-pages 400]
Writes blackbox/cache/pdf/<id>.pdf (or .html) and blackbox/cache/text/<id>.txt
with "<<< page N >>>" markers, then prints a section map (heading -> line
numbers) so a reader can jump to Synopsis / Findings / Probable Cause /
Recommendations without reading the whole file.
"""
import argparse
import os
import re
import sys
from pathlib import Path

import requests

os.environ.setdefault("TESSDATA_PREFIX", "/usr/share/tesseract-ocr/5/tessdata")
ROOT = Path(__file__).resolve().parents[2]
PDF_DIR = ROOT / "cache" / "pdf"
TEXT_DIR = ROOT / "cache" / "text"
HEADINGS = re.compile(r"^\s*(?:\d+(?:\.\d+)*\.?\s+)?(synopsis|summary|executive summary|abstract|history of (the )?flight|sequence of events|factual information|analysis|conclusions?|findings|causes?|probable cause|contributing factors|safety recommendations?|recommendations?|flight recorders?|cockpit voice recorder|wreckage)\b.{0,60}$", re.I | re.M)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("url")
    ap.add_argument("--max-pages", type=int, default=400)
    ap.add_argument("--ocr-pages", type=int, default=160, help="OCR at most this many scanned pages (about 3 s per page)")
    args = ap.parse_args()
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    TEXT_DIR.mkdir(parents=True, exist_ok=True)
    out_txt = TEXT_DIR / f"{args.id}.txt"
    if not out_txt.exists():
        headers = {"User-Agent": "blackbox-pipeline/1.0 (+https://dhruvramasubban.com)"}
        resp = None
        for url in (args.url, f"https://web.archive.org/web/2024id_/{args.url}"):
            try:
                r = requests.get(url, headers=headers, timeout=(20, 90) if url == args.url else (10, 30), allow_redirects=True)
                if r.ok and len(r.content) > 2000:
                    resp = r
                    if url != args.url:
                        print(f"fetched via Wayback Machine: {url}")
                    break
                print(f"{url}: HTTP {r.status_code}, {len(r.content)} bytes", file=sys.stderr)
            except Exception as exc:
                print(f"{url}: {exc.__class__.__name__}: {str(exc)[:120]}", file=sys.stderr)
        if resp is None:
            raise SystemExit("download failed on the original URL and the Wayback Machine")
        is_pdf = resp.content[:5] == b"%PDF-" or "pdf" in resp.headers.get("content-type", "")
        if not is_pdf:
            # an agency landing page (gov.uk AAIB, ATSB, BEA) usually links the actual report PDF: follow the first one
            from urllib.parse import urljoin
            m = re.search(r'href=["\']([^"\']+\.pdf(?:\?[^"\']*)?)["\']', resp.text, re.I)
            if m:
                pdf_url = urljoin(resp.url, m.group(1))
                try:
                    r2 = requests.get(pdf_url, headers=headers, timeout=(20, 120), allow_redirects=True)
                    if r2.ok and r2.content[:5] == b"%PDF-":
                        print(f"followed report link on landing page: {pdf_url}")
                        resp, is_pdf = r2, True
                except Exception as exc:
                    print(f"{pdf_url}: {exc.__class__.__name__}", file=sys.stderr)
        if is_pdf:
            import pymupdf
            path = PDF_DIR / f"{args.id}.pdf"
            path.write_bytes(resp.content)
            doc = pymupdf.open(path)
            pages = []
            for i, page in enumerate(doc):
                if i >= args.max_pages:
                    break
                txt = page.get_text("text")
                if len(txt.strip()) < 40 and i < args.ocr_pages:
                    # scanned page (older NTSB / CAB reports): OCR it with tesseract via pymupdf
                    try:
                        txt = page.get_text("text", textpage=page.get_textpage_ocr(language="eng", dpi=200, full=True))
                    except Exception as exc:  # tesseract missing or page unreadable
                        txt = f"[ocr failed: {exc}]"
                pages.append(f"\n\n<<< page {i + 1} >>>\n{txt}")
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
