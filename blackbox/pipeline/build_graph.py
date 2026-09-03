#!/usr/bin/env python3
"""Merge records, taxonomy and FDR files into the bundle the web app loads.

Usage: python3 blackbox/pipeline/build_graph.py
Writes src/data/blackbox/graph.json and src/data/blackbox/fdr/<id>.json.
Runs the validator first and aborts on errors.
"""
import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
REPORTS = ROOT / "data" / "reports"
FDR = ROOT / "data" / "fdr"
CATALOG = ROOT / "data" / "catalog"
OUT = REPO / "src" / "data" / "blackbox"
PUBLIC = REPO / "public" / "blackbox" / "catalog"

INDEX_FIELDS = ["id", "tier", "depth", "title", "date", "agency", "operator", "phase", "category", "fatalities", "occupants", "interest", "curated_id", "qid", "asn_id", "ntsb_no"]


def build_catalog(records_by_curated_id):
    """Emit the catalog tier: a compact index for search plus per-year shards with full rows."""
    if not CATALOG.exists():
        return {"tiers": {}, "index_bytes": 0}
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for old in PUBLIC.glob("*.json"):
        old.unlink()
    index = []
    shards = defaultdict(list)
    tiers = Counter()
    factor_counts = Counter()
    edge_counts = Counter()
    for path in sorted(CATALOG.glob("*.jsonl")):
        for line in path.read_text().splitlines():
            if not line.strip():
                continue
            rec = json.loads(line)
            tiers[rec["tier"]] += 1
            row = {k: rec.get(k) for k in INDEX_FIELDS if rec.get(k) is not None}
            row["ac"] = rec.get("aircraft", {}).get("type")
            row["mf"] = rec.get("aircraft", {}).get("manufacturer")
            row["cty"] = (rec.get("location") or {}).get("country")
            row["f"] = [f["id"] for f in rec.get("factors", [])]
            row["c"] = rec.get("chain", [])
            row["s"] = (rec.get("summary") or "")[:280]
            row["d"] = bool(rec.get("dissent"))
            row["r"] = bool(rec.get("report_links"))
            loc = rec.get("location") or {}
            if loc.get("lat") is not None and loc.get("lon") is not None:
                row["la"] = round(loc["lat"], 2)
                row["lo"] = round(loc["lon"], 2)
            if rec.get("wikipedia"):
                row["w"] = rec["wikipedia"].replace("https://en.wikipedia.org/wiki/", "")
            index.append(row)
            shards[rec["date"][:4]].append(rec)
            for f in rec.get("factors", []):
                factor_counts[f["id"]] += 1
            for a, b in rec.get("chain", []):
                edge_counts[(a, b)] += 1
    index.sort(key=lambda r: (-(r.get("interest") or 0), r["date"]))
    for year, rows in shards.items():
        (PUBLIC / f"{year}.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    payload = {
        "version": 1,
        "count": len(index),
        "tiers": dict(tiers),
        "shards": sorted(shards.keys()),
        "factor_counts": dict(factor_counts),
        "chain_edges": [{"from": a, "to": b, "n": n} for (a, b), n in sorted(edge_counts.items(), key=lambda kv: -kv[1])],
        "rows": index,
    }
    (PUBLIC / "index.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return {"tiers": dict(tiers), "index_bytes": (PUBLIC / "index.json").stat().st_size, "shards": len(shards)}


def main():
    result = subprocess.run([sys.executable, str(ROOT / "pipeline" / "validate.py")], capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stdout)
        sys.exit("validation failed; fix errors before building")

    taxonomy = json.loads((ROOT / "data" / "taxonomy.json").read_text())
    records = [json.loads(p.read_text()) for p in sorted(REPORTS.glob("*.json"))]
    records.sort(key=lambda r: r["date"])

    factor_counts = Counter()
    edge_counts = Counter()
    agencies = {}
    for rec in records:
        for f in rec["factors"]:
            factor_counts[f["id"]] += 1
        for a, b in rec["chain"]:
            edge_counts[(a, b)] += 1
        for ag in rec["agencies"]:
            agencies.setdefault(ag["code"], {"code": ag["code"], "name": ag.get("name", ag["code"]), "country": ag.get("country", "")})

    successors = defaultdict(Counter)
    predecessors = defaultdict(Counter)
    for (a, b), n in edge_counts.items():
        successors[a][b] += n
        predecessors[b][a] += n

    graph = {
        "version": 1,
        "built_from": {"records": len(records), "fdr": len(list(FDR.glob("*.json")))},
        "taxonomy": taxonomy,
        "agencies": sorted(agencies.values(), key=lambda a: a["code"]),
        "records": records,
        "stats": {
            "factor_counts": dict(factor_counts),
            "chain_edges": [{"from": a, "to": b, "n": n} for (a, b), n in sorted(edge_counts.items(), key=lambda kv: -kv[1])],
            "successors": {k: dict(v) for k, v in successors.items()},
            "predecessors": {k: dict(v) for k, v in predecessors.items()},
            "fatalities": sum(r.get("fatalities") or 0 for r in records),
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "fdr").mkdir(exist_ok=True)
    (OUT / "graph.json").write_text(json.dumps(graph, ensure_ascii=False, separators=(",", ":")))
    for p in FDR.glob("*.json"):
        (OUT / "fdr" / p.name).write_text(json.dumps(json.loads(p.read_text()), separators=(",", ":")))
    size = (OUT / "graph.json").stat().st_size
    print(f"graph.json: {len(records)} records, {len(factor_counts)} factors used, {len(edge_counts)} distinct chain edges, {size // 1024} KB")
    cat = build_catalog({r["id"] for r in records})
    if cat["tiers"]:
        print(f"catalog: {cat['tiers']} -> public/blackbox/catalog/index.json {cat['index_bytes'] // 1024} KB, {cat['shards']} year shards")


if __name__ == "__main__":
    main()
