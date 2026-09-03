#!/usr/bin/env python3
"""Find openly licensed audio (ATC tapes, released CVR recordings) for each record on Wikimedia Commons.

Usage: python3 blackbox/pipeline/catalog/fetch_audio.py [--dry] [--workers N]
For every record in blackbox/data/reports/*.json, searches Commons for audio files
mentioning the accident (Wikipedia title, else the record title), keeps files whose
license is public domain or Creative Commons, and writes them into the record as
  "audio": [{"title", "url", "page", "license", "kind", "description", "duration"}]
kind is "atc" (air traffic control recording), "cvr" (cockpit voice recorder) or "audio".
Existing entries are replaced; records with no matches lose the field.
"""
import json
import re
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "data" / "reports"
API = "https://commons.wikimedia.org/w/api.php"
UA = "blackbox-pipeline/1.0 (https://dhruvramasubban.com; dhruvramasubban@gmail.com)"
AUDIO_EXT = (".ogg", ".oga", ".mp3", ".wav", ".flac", ".opus", ".mid", ".webm")
OK_LICENSE = re.compile(r"public domain|\bpd\b|cc[- ]|creative commons|no restrictions", re.I)
# news clips, interviews and narration are not recordings from the event
NOT_RECORDING = re.compile(r"voice of america|\bvoa\b|\bnews\b|newscast|interview|podcast|documentary|narrat|pronunciation|\bEN-|\bspeech\b|-article-|LL-Q", re.I)


def is_recording(f):
    return not NOT_RECORDING.search(f"{f['title']} {f.get('description', '')}") and classify(f["title"], f.get("description", "")) in ("atc", "cvr")
session = requests.Session()
session.headers["User-Agent"] = UA


def api(params, tries=5):
    for i in range(tries):
        try:
            r = session.get(API, params={**params, "format": "json"}, timeout=30)
            if r.status_code == 200 and r.text.strip().startswith("{"):
                return r.json()
            if r.status_code == 429:
                wait = int(r.headers.get("retry-after", "30") or 30)
                print(f"  rate limited, waiting {wait + 2}s", flush=True)
                time.sleep(wait + 2)
                continue
        except Exception:
            pass
        time.sleep(1 + i)
    return {}


def search_files(query):
    """One round trip: search + image info for the hits."""
    d = api({"action": "query", "generator": "search", "gsrnamespace": 6, "gsrlimit": 10, "gsrsearch": f'"{query}" filetype:audio', "prop": "imageinfo", "iiprop": "url|extmetadata|size"})
    out = []
    for page in d.get("query", {}).get("pages", {}).values():
        title = page.get("title", "")
        if not title.lower().endswith(AUDIO_EXT):
            continue
        ii = (page.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata", {})
        out.append({
            "title": title.replace("File:", ""),
            "url": ii.get("url"),
            "page": ii.get("descriptionurl"),
            "license": (meta.get("LicenseShortName", {}) or {}).get("value", ""),
            "description": re.sub(r"<[^>]+>", "", (meta.get("ImageDescription", {}) or {}).get("value", ""))[:300],
            "duration": ii.get("duration"),
        })
    time.sleep(PACE)
    return out


PACE = 2.0


def classify(title, desc):
    t = f"{title} {desc}".lower()
    if re.search(r"cvr|cockpit voice|voice recorder", t):
        return "cvr"
    if re.search(r"atc|tower|tracon|approach control|controller|air traffic|radio|transmission|mayday", t):
        return "atc"
    return "audio"


def process(p, dry):
    rec = json.loads(p.read_text())
    queries = []
    if rec.get("wikipedia"):
        queries.append(urllib.parse.unquote(rec["wikipedia"].rsplit("/", 1)[-1]).replace("_", " "))
    elif rec.get("title"):
        queries.append(rec["title"])
    files = []
    for q in queries:
        for f in search_files(q):
            if f["url"] and f["title"] not in [x["title"] for x in files]:
                files.append(f)
    audio = [{**f, "kind": classify(f["title"], f["description"])} for f in files if OK_LICENSE.search(f.get("license", "")) and is_recording(f)]
    changed = False
    if audio:
        rec["audio"] = audio
        changed = True
    elif "audio" in rec:
        del rec["audio"]
        changed = True
    if changed and not dry:
        p.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
    return rec["id"], audio


def main():
    dry = "--dry" in sys.argv
    workers = int(sys.argv[sys.argv.index("--workers") + 1]) if "--workers" in sys.argv else 1
    paths = sorted(REPORTS.glob("*.json"))
    found = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for rid, audio in ex.map(lambda p: process(p, dry), paths):
            if audio:
                found += 1
                print(f"{rid}: " + "; ".join(f"[{a['kind']}] {a['title']} ({a['license']})" for a in audio), flush=True)
    print(f"records with audio: {found} of {len(paths)}", flush=True)


if __name__ == "__main__":
    main()
