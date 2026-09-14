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
ARTIFACT_PATH = ROOT / "artifact.html"


def main():
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

    fragment = template.replace("__DATA_JSON__", json.dumps(data, ensure_ascii=False))

    # artifact.html: bare fragment, no <!DOCTYPE>/<html>/<head>/<body>. This is
    # the source for Claude Artifact publishing, which wraps the file in its
    # own <!doctype html><head><meta charset>...<body> skeleton at publish
    # time -- adding one here would nest two <head>/<body> pairs.
    ARTIFACT_PATH.write_text(fragment, encoding="utf-8")

    # index.html: a real standalone document. Nothing wraps this when it's
    # opened directly (double-clicked, file://) or hosted as a static site
    # (e.g. GitHub Pages), so without its own charset declaration the browser
    # has to guess the text encoding -- and gets it wrong for the non-ASCII
    # (German) names in the data, rendering them as mojibake.
    standalone = (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        "</head>\n<body>\n" + fragment + "\n</body>\n</html>\n"
    )
    OUTPUT_PATH.write_text(standalone, encoding="utf-8")

    print(f"Built {OUTPUT_PATH} and {ARTIFACT_PATH} ({len(standalone):,} bytes) from "
          f"{len(data.get('entities', []))} entities and "
          f"{len(data.get('people', []))} people.")


if __name__ == "__main__":
    main()
