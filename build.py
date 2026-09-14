#!/usr/bin/env python3
"""
Build script for microcrm.

Merges template.html (the app shell — layout, CSS, and all JS logic) with
data.json (the entities/people dataset) into a single self-contained
index.html that can be opened directly in a browser or published as a
static page (e.g. GitHub Pages).

Usage:
    python3 build.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent
TEMPLATE_PATH = ROOT / "template.html"
DATA_PATH = ROOT / "data.json"
OUTPUT_PATH = ROOT / "index.html"


def main():
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

    output = template.replace("__DATA_JSON__", json.dumps(data, ensure_ascii=False))
    OUTPUT_PATH.write_text(output, encoding="utf-8")

    print(f"Built {OUTPUT_PATH} ({len(output):,} bytes) from "
          f"{len(data.get('entities', []))} entities and "
          f"{len(data.get('people', []))} people.")


if __name__ == "__main__":
    main()
