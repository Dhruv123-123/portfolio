#!/usr/bin/env python3
"""Fetch English Wikipedia article text and external links for every Wikidata
accident that has an article, as plain text derived from the raw wikitext.

Usage: python3 blackbox/pipeline/catalog/wikipedia_fetch.py [--limit N] [--workers 3]
Writes blackbox/cache/wikipedia/<qid>.json = {qid, title, extract, extlinks, fetched}.
Resumable (existing files are skipped). Uses `action=raw` because the extracts
API is rate-limited for shared egress addresses; the wikitext is converted to
plain text with section headings kept as "== Heading ==" lines so downstream
trimming can pick the accident / investigation sections.
"""
import argparse
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote

import requests

ROOT = Path(__file__).resolve().parents[2]
IN = ROOT / "cache" / "wikidata" / "accidents.jsonl"
OUT_DIR = ROOT / "cache" / "wikipedia"
UA = "blackbox-pipeline/1.0 (https://dhruvramasubban.com; dhruvramasubban@gmail.com)"
_lock = threading.Lock()
_last = [0.0]


def polite_pause(min_interval=0.6):
    with _lock:
        now = time.time()
        wait = _last[0] + min_interval - now
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()


def strip_wikitext(wt):
    """Best-effort wikitext -> plain text. Keeps == headings ==."""
    text = wt
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<ref[^>]*/>", "", text)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S | re.I)
    text = re.sub(r"<(gallery|timeline|math|score|imagemap|syntaxhighlight)[^>]*>.*?</\1>", "", text, flags=re.S | re.I)
    text = re.sub(r"\{\{(?:convert|cvt)\|([^|}]+)\|([^|}]+)[^}]*\}\}", r"\1 \2", text, flags=re.I)
    text = re.sub(r"\{\{(?:lang|nowrap|transl|IPA[^|]*)\|(?:[^|}]*\|)?([^|}]*)\}\}", r"\1", text, flags=re.I)
    for _ in range(12):
        new = re.sub(r"\{\{[^{}]*\}\}", "", text)
        if new == text:
            break
        text = new
    text = re.sub(r"\{\|.*?\|\}", "", text, flags=re.S)
    text = re.sub(r"\[\[(?:File|Image|Category|Media):[^\]]*\]\]", "", text, flags=re.I)
    for _ in range(3):
        text = re.sub(r"\[\[([^\[\]|]*)\|([^\[\]]*)\]\]", r"\2", text)
        text = re.sub(r"\[\[([^\[\]]*)\]\]", r"\1", text)
    text = re.sub(r"\[(?:https?|ftp)://[^\s\]]+\s?([^\]]*)\]", r"\1", text)
    text = re.sub(r"'{2,5}", "", text)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"^\s*[*#:;]+\s*", "", text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_links(wt):
    links = re.findall(r"(?<![\w/])((?:https?)://[^\s|\]}<>\"]+)", wt)
    seen = set()
    out = []
    for l in links:
        l = l.rstrip(".,;)")
        if l not in seen:
            seen.add(l)
            out.append(l)
    return out


def fetch(title, session):
    for attempt in range(5):
        polite_pause()
        try:
            resp = session.get("https://en.wikipedia.org/w/index.php", params={"title": title, "action": "raw"}, headers={"User-Agent": UA}, timeout=60, allow_redirects=True)
            if resp.status_code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            wt = resp.text
            m = re.match(r"#REDIRECT\s*\[\[([^\]|]+)", wt, re.I)
            if m and attempt < 4:
                title = m.group(1)
                continue
            return {"title": title.replace("_", " "), "extract": strip_wikitext(wt), "extlinks": extract_links(wt)}
        except requests.RequestException as exc:
            print(f"  retry {title}: {exc}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=3)
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    items = [json.loads(l) for l in IN.read_text().splitlines()]
    todo = [it for it in items if it.get("article") and not (OUT_DIR / f"{it['qid']}.json").exists()]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(items)} accidents, {sum(1 for i in items if i.get('article'))} with articles, {len(todo)} to fetch", flush=True)
    session = requests.Session()
    done = [0]

    def work(it):
        title = unquote(it["article"].rsplit("/", 1)[-1])
        data = fetch(title, session)
        if data is None:
            return
        data["fetched"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        data["qid"] = it["qid"]
        (OUT_DIR / f"{it['qid']}.json").write_text(json.dumps(data, ensure_ascii=False))
        with _lock:
            done[0] += 1
            if done[0] % 100 == 0:
                print(f"  {done[0]}/{len(todo)}", flush=True)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(work, todo))
    print(f"fetched {done[0]}")


if __name__ == "__main__":
    main()
