#!/usr/bin/env python3
"""Find openly licensed audio (ATC tapes, released CVR recordings) for each record on Wikimedia Commons.

Usage: python3 blackbox/pipeline/catalog/fetch_audio.py [--dry]
For every record in blackbox/data/reports/*.json, searches Commons for audio files
mentioning the accident (Wikipedia title and record title), keeps files whose license
is public domain or Creative Commons, and writes them into the record as
  "audio": [{"title", "url", "page", "license", "kind", "description", "duration"}]
kind is "atc" (air traffic control recording), "cvr" (cockpit voice recorder) or "audio".
Existing entries are replaced; records with no matches keep no field.
"""
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "data" / "reports"
API = "https://commons.wikimedia.org/w/api.php"
UA = "blackbox-pipeline/1.0 (https://dhruvramasubban.com; dhruvramasubban@gmail.com)"
AUDIO_EXT = (".ogg", ".oga", ".mp3", ".wav", ".flac", ".opus", ".mid", ".webm")
OK_LICENSE = re.compile(r"public domain|\bpd\b|cc[- ]|creative commons|no restrictions", re.I)


def get(params, tries=4):
    for i in range(tries):
        try:
            r = requests.get(API, params={**params, "format": "json"}, headers={"User-Agent": UA}, timeout=30)
            if r.status_code == 200 and r.text.strip():
                return r.json()
        except Exception:
            pass
        time.sleep(1.5 * (i + 1))
    return {}


def search(query):
    d = get({"action": "query", "list": "search", "srnamespace": 6, "srlimit": 10, "srsearch": f'"{query}" filetype:audio'})
    return [x["title"] for x in d.get("query", {}).get("search", []) if x["title"].lower().endswith(AUDIO_EXT)]


def info(titles):
    if not titles:
        return {}
    d = get({"action": "query", "prop": "imageinfo", "iiprop": "url|extmetadata|size", "titles": "|".join(titles)})
    out = {}
    for page in d.get("query", {}).get("pages", {}).values():
        ii = (page.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata", {})
        out[page.get("title")] = {
            "url": ii.get("url"),
            "page": ii.get("descriptionurl"),
            "license": (meta.get("LicenseShortName", {}) or {}).get("value", ""),
            "description": re.sub(r"<[^>]+>", "", (meta.get("ImageDescription", {}) or {}).get("value", ""))[:300],
            "duration": ii.get("duration"),
        }
    return out


def classify(title, desc):
    t = f"{title} {desc}".lower()
    if re.search(r"cvr|cockpit voice|voice recorder", t):
        return "cvr"
    if re.search(r"atc|tower|tracon|approach control|controller|air traffic|radio|transmission|mayday", t):
        return "atc"
    return "audio"


def main():
    dry = "--dry" in sys.argv
    found_total = 0
    for p in sorted(REPORTS.glob("*.json")):
        rec = json.loads(p.read_text())
        queries = []
        if rec.get("wikipedia"):
            queries.append(urllib.parse.unquote(rec["wikipedia"].rsplit("/", 1)[-1]).replace("_", " "))
        if rec.get("title") and rec["title"] not in queries:
            queries.append(rec["title"])
        titles = []
        for q in queries:
            for t in search(q):
                if t not in titles:
                    titles.append(t)
            time.sleep(0.4)
        if not titles:
            if "audio" in rec and not dry:
                del rec["audio"]
                p.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
            continue
        meta = info(titles[:10])
        audio = []
        for t in titles:
            m = meta.get(t)
            if not m or not m.get("url") or not OK_LICENSE.search(m.get("license", "")):
                continue
            audio.append({"title": t.replace("File:", ""), "url": m["url"], "page": m["page"], "license": m["license"], "kind": classify(t, m["description"]), "description": m["description"], "duration": m["duration"]})
        if audio:
            found_total += 1
            print(f"{rec['id']}: {len(audio)} file(s): " + "; ".join(f"[{a['kind']}] {a['title']} ({a['license']})" for a in audio))
            if not dry:
                rec["audio"] = audio
                p.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
        elif "audio" in rec and not dry:
            del rec["audio"]
            p.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
        time.sleep(0.4)
    print(f"records with audio: {found_total}")


if __name__ == "__main__":
    main()
