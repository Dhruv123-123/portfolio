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
OUT = REPO / "src" / "data" / "blackbox"


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


if __name__ == "__main__":
    main()
