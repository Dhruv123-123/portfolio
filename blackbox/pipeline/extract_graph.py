#!/usr/bin/env python3
"""Extract a structured accident record from a final report with Claude.

Usage:
  python3 blackbox/pipeline/extract_graph.py <id> [--model claude-opus-5] [--force]

Reads blackbox/cache/text/<id>.txt (run fetch_reports.py and extract_text.py
first), sends the whole report with the taxonomy and schema to Claude using
structured outputs, validates the result against the taxonomy, and writes
blackbox/data/reports/<id>.json. Existing hand-reviewed records are not
overwritten unless --force is given.

Credentials: the Anthropic SDK reads ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or
an `ant auth login` profile. Nothing is sent anywhere else.
"""
import argparse
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT_DIR = ROOT / "cache" / "text"
REPORTS = ROOT / "data" / "reports"
TAXONOMY = ROOT / "data" / "taxonomy.json"
SCHEMA = ROOT / "pipeline" / "schema" / "report.schema.json"
PROMPT = ROOT / "pipeline" / "prompts" / "extract.md"

UNSUPPORTED_KEYS = {"pattern", "minItems", "maxItems", "$schema", "title"}


def strict_schema(node):
    """Copy of the record schema in the subset structured outputs accepts."""
    if isinstance(node, dict):
        out = {}
        for key, value in node.items():
            if key in UNSUPPORTED_KEYS:
                continue
            out[key] = strict_schema(value)
        if out.get("type") == "object" or "properties" in out:
            out.setdefault("properties", {})
            out["additionalProperties"] = False
            out["required"] = list(out["properties"].keys())
        return out
    if isinstance(node, list):
        return [strict_schema(v) for v in node]
    return node


def build_messages(rec_id, report_text, taxonomy, schema):
    taxonomy_block = json.dumps({
        "factors": [{"id": f["id"], "label": f["label"], "category": f["category"], "description": f["description"]} for f in taxonomy["factors"]],
        "phases": taxonomy["phases"],
        "actors": taxonomy["actors"],
    }, indent=1)
    return [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "FACTOR TAXONOMY (the only allowed ids):\n" + taxonomy_block, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": "RECORD SCHEMA:\n" + json.dumps(schema, indent=1)},
                {"type": "text", "text": f"FINAL REPORT TEXT for record id '{rec_id}':\n" + report_text, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": f"Produce the record for id '{rec_id}'."},
            ],
        }
    ]


def extract(rec_id, model, force):
    import anthropic

    text_path = TEXT_DIR / f"{rec_id}.txt"
    if not text_path.exists():
        sys.exit(f"no extracted text at {text_path}; run fetch_reports.py and extract_text.py first")
    target = REPORTS / f"{rec_id}.json"
    if target.exists() and not force:
        existing = json.loads(target.read_text())
        if existing.get("extraction", {}).get("reviewed"):
            sys.exit(f"{target} is hand-reviewed; pass --force to overwrite")

    taxonomy = json.loads(TAXONOMY.read_text())
    schema = strict_schema(json.loads(SCHEMA.read_text()))
    report_text = text_path.read_text()
    client = anthropic.Anthropic()

    with client.messages.stream(
        model=model,
        max_tokens=64000,
        system=PROMPT.read_text(),
        thinking={"type": "adaptive"},
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": schema}},
        messages=build_messages(rec_id, report_text, taxonomy, schema),
    ) as stream:
        response = stream.get_final_message()

    if response.stop_reason == "refusal":
        sys.exit(f"model declined: {response.stop_details}")
    if response.stop_reason == "max_tokens":
        sys.exit("output truncated; raise max_tokens")
    text = next(block.text for block in response.content if block.type == "text")
    record = json.loads(text)
    record["id"] = rec_id
    record.setdefault("extraction", {})
    record["extraction"].update({"method": "llm", "model": model, "reviewed": False})

    valid_ids = {f["id"] for f in taxonomy["factors"]}
    record["factors"] = [f for f in record.get("factors", []) if f.get("id") in valid_ids]
    kept = {f["id"] for f in record["factors"]}
    record["chain"] = [e for e in record.get("chain", []) if e[0] in kept and e[1] in kept and e[0] != e[1]]

    target.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    usage = response.usage
    print(f"wrote {target} ({len(record['factors'])} factors, {len(record['events'])} events); "
          f"input {usage.input_tokens} cached {usage.cache_read_input_tokens} output {usage.output_tokens}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("id")
    parser.add_argument("--model", default="claude-opus-5")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    extract(args.id, args.model, args.force)


if __name__ == "__main__":
    main()
