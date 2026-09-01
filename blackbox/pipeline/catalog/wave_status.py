#!/usr/bin/env python3
"""Show progress of the Haiku extraction waves and validate finished batches.

Usage: python3 blackbox/pipeline/catalog/wave_status.py [prefix]
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCHES = ROOT / "cache" / "batches"
prefix = sys.argv[1] if len(sys.argv) > 1 else "w1"
inputs = sorted(p for p in BATCHES.glob(f"{prefix}_[0-9]*.json") if not p.name.endswith(".out.jsonl"))
done, bad, todo = [], [], []
for p in inputs:
    out = p.with_name(p.stem + ".out.jsonl")
    if not out.exists():
        todo.append(p.stem)
        continue
    res = subprocess.run([sys.executable, str(ROOT / "pipeline" / "catalog" / "validate_catalog.py"), str(out)], capture_output=True, text=True)
    (done if res.returncode == 0 else bad).append(p.stem)
print(f"{prefix}: {len(done)} valid, {len(bad)} invalid {bad}, {len(todo)} pending; next: {todo[:12]}")
