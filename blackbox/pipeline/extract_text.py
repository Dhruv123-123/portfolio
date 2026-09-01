#!/usr/bin/env python3
"""Extract text from cached report PDFs into blackbox/cache/text/<id>.txt.

Usage: python3 blackbox/pipeline/extract_text.py [id ...]
Writes one text file per report with page separators ("\f" plus a page
marker) so extract_graph.py can cite page numbers, and a stats JSON with
page and character counts.
"""
import json
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "cache" / "pdf"
TEXT_DIR = ROOT / "cache" / "text"


def extract(pdf_path: Path) -> dict:
    doc = pymupdf.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text")
        pages.append(f"\n\n<<< page {i + 1} >>>\n{text}")
    joined = "".join(pages)
    out = TEXT_DIR / f"{pdf_path.stem}.txt"
    out.write_text(joined)
    return {"pages": len(doc), "chars": len(joined), "text": str(out)}


def main():
    TEXT_DIR.mkdir(parents=True, exist_ok=True)
    wanted = sys.argv[1:]
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    if wanted:
        pdfs = [p for p in pdfs if p.stem in wanted]
    stats = {}
    for pdf in pdfs:
        stats[pdf.stem] = extract(pdf)
        print(f"{pdf.stem}: {stats[pdf.stem]['pages']} pages, {stats[pdf.stem]['chars']} chars")
    (TEXT_DIR / "_stats.json").write_text(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
