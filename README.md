# microcrm

A lightweight, single-file CRM for tracking organizations, pharmacies, and
people around the German **Expopharm** trade fair — built for BAM/Cureous
business development.

There's no backend and no build tooling required to view it: `index.html`
is a fully self-contained page (data included) that runs entirely in the
browser.

## Structure

- **`template.html`** — the app shell: layout, styling, and all JavaScript
  (search, filters, list/detail navigation, breadcrumbs, contact rendering).
  Contains a `__DATA_JSON__` placeholder where the dataset gets injected.
- **`data.json`** — the dataset: `entities` (organizations, pharmacy
  locations) and `people`, with contacts, relationships, cannabis-dispensing
  evidence, SIS marketplace cross-references, and event-attendance notes.
- **`index.html`** — the built, self-contained page (`template.html` +
  `data.json` merged together). This is what you open in a browser or
  publish as a static site.
- **`build.py`** — regenerates `index.html` from `template.html` +
  `data.json`. Run this after editing either source file:

  ```bash
  python3 build.py
  ```

- **`research/`** — the scripts and intermediate data behind how `data.json`
  was built up, kept for provenance/auditability rather than active use:
  - `merged_data.json` — the "Merged Data" sheet from a legacy 2017/2018
    pharmacy contact spreadsheet (838 rows), extracted for matching.
  - `confirmed_matches.json`, `match.py`, `match_results.json`,
    `reverse_match.py` — matching that legacy sheet against SIS (a
    cannabis-marketplace intelligence source) and against people already in
    the CRM.
  - `import_legacy27.py`, `import_pilot2.py` — scripts that added
    SIS-confirmed and web-verified pharmacies from that legacy sheet into
    `data.json`.
  - `old_org_contacts.json` — contact rows recovered from an earlier,
    separate prototype of this project (a paused Next.js app backed by
    SQLite); already merged into `data.json`.
  - `orgs_need_contacts.json`, `org_chunks.json` — the organization-type
    entities still missing public contact info as of the last data pass,
    chunked for a web-research pass (in progress — see below).

## Data model

Each **entity** (`data.json` → `entities`) has an `id`, `type`
(`organization` | `pharmacy_location` | `person`), `lead_tier`
(`high` | `medium` | `watch` | `unscored`), `contacts[]`, `cannabis_status`,
`cannabis_evidence[]`, `sis_identities[]` (cross-references to SIS
marketplace listings), `relationships_out`/`relationships_in[]`, and
`people[]` (roles at that organization).

Each **person** (`data.json` → `people`) has `roles[]` (organizational
affiliations), `contacts[]`, and `event_presence[]` (evidence of attending
or speaking at Expopharm).

## Status / known open work

- 173 `organization`-type entities are missing public contact info. A
  web-research pass (official Impressum/Kontakt pages, the Expopharm
  exhibitor directory, LinkedIn) is in progress — see `research/org_chunks.json`
  for the full worklist and progress so far.
- This repo mirrors a working dataset that has also been published as a
  hosted, interactive page (Claude Artifacts) for day-to-day browsing;
  this repo is the durable, version-controlled home for the underlying
  code and data.
