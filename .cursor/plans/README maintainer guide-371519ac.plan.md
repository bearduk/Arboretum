<!-- 371519ac-050a-43c0-8b46-e2425fe7ee83 -->
---
todos:
  - id: "add-readme"
    content: "Create README.md: prerequisites, venv+pip, export command, local preview, spreadsheet rules + column fragility, publish handoff to developer, link CLAUDE.md"
    status: completed
  - id: "crosslink-claude"
    content: "Add one sentence in CLAUDE.md Build section pointing to README.md"
    status: completed
isProject: false
---
# README for handover

## Goal

Add [`README.md`](README.md) at the repo root (none exists today) so a new person can follow **install → run → updated data** without guessing. **Publishing / endpoints / GitHub access** are called out as “contact the developer” rather than fully documented credentials.

## Content outline (what to write)

1. **Title + one paragraph** — What the repo is: Keele arboretum map, source Excel → GeoJSON → static Leaflet site in `docs/`.

2. **Prerequisites** — Python 3 (version note: match what `scripts/xlsx_to_geojson.py` needs; 3.9+ is safe), `git` only if they will push later.

3. **One-time setup** (copy-paste friendly):
   - `python3 -m venv .venv`
   - `.venv/bin/pip install -r requirements.txt`  
   (Windows note optional: `\.venv\Scripts\pip` — only if you want cross-platform; can keep macOS/Linux primary to stay short.)

4. **Regenerate map data** — Command using the real default workbook name:
   - `.venv/bin/python scripts/xlsx_to_geojson.py -i "Keele trees Dec25.xlsx" -o docs/data`  
   - Brief note: stderr shows skip counts and duplicate-tag warnings; rows without X/Y are omitted.

5. **Preview locally** — `cd docs && python3 -m http.server 8765` and open the URL; remind that `file://` will not load GeoJSON.

6. **Editing the spreadsheet (maintainer rules)** — New README section, practical and explicit:
   - **Source of truth:** Keep using the workbook tracked in the repo (or the agreed filename); after edits, re-run the export script and commit changed `.geojson` (and the `.xlsx` if policy is to version it).
   - **Coordinates:** **X** and **Y** must stay **British National Grid** (easting/northing, EPSG:27700). Rows missing either value **do not appear on the map**. Adding or correcting coordinates is the main routine edit.
   - **Stable identifiers:** **Tag** values should stay **unique** within a sheet where possible; duplicates produce warnings and break **`?tag=`** deep links (first match wins). **Square** is used for **`?square=`** links.
   - **Sheet layout (fragile):**
     - **`Cherries`:** Header row must remain **row 1**; do not insert blank rows above the headers.
     - **`other trees`:** The export finds the header row by locating the first row whose **first cell** is **`Tag`**. Do not remove that row or put unrelated content in column A above the real table; section notes above that row are OK only if column A there is not `Tag`.
     - **`lost trees`:** Treat like Cherries: **row 1 = headers**.
   - **Do not rename the worksheets** unless a developer updates `scripts/xlsx_to_geojson.py` (expected names: `Cherries`, `other trees`, `lost trees`).

7. **Column names and the map (will break if changed carelessly)** — Explain at a high level how [`scripts/xlsx_to_geojson.py`](scripts/xlsx_to_geojson.py) works: Excel headers are normalised to **snake_case** property names on each GeoJSON feature (e.g. `Latin_Name` → `latin_name`). The **front-end** ([`docs/js/map.js`](docs/js/map.js)) reads specific properties (`tag`, `square`, `latin_name`, `species`, `planted`, `w3w`, `comments`, `source_sheet`, etc.).
   - **Renaming, merging, or splitting columns** in Excel changes those JSON keys; the map popups and deep links can **silently break** or **omit fields** until code is updated.
   - **Critical columns** to treat as stable contracts: anything used for position (**`X`**, **`Y`** — the script maps these to easting/northing for projection) and identity (**`Tag`**). Renaming **`X`/`Y`** only works if the new header still normalises to something the script recognises (`x`, `y`, `easting`, `northing` per current code); otherwise points vanish or end up in the wrong place.
   - **Action if they need structural changes:** Contact the developer to update the export script and/or `map.js` together with the spreadsheet.

8. **Publishing / endpoint (explicit handoff)** — Short subsection, e.g.:
   - After regenerating, the **changed files** are typically `docs/data/*.geojson` and possibly the `.xlsx` if updated.
   - **Do not expect a single “publish” command in this repo** — to go live they need **git commit + push** to the agreed remote, or upload `docs/` to institutional hosting.
   - **Contact [you — use placeholder or “repository owner / original developer”]** for: GitHub repo URL, Pages settings, who has push access, or Keele upload process.

9. **Further reading** — Link to [`CLAUDE.md`](CLAUDE.md) for sheet layouts, column completeness, deep-link URLs (`?tag=`), and GitHub Pages folder (`/docs`). Optionally add a short **“Spreadsheet contract”** bullet list there pointing at README for day-to-day rules and script for exact header handling (avoid duplicating long prose in two places).

10. **Optional one-line cross-link** — In [`CLAUDE.md`](CLAUDE.md) “Build and run” section, add a single sentence: “Maintainer quick start: see `README.md`.” Avoid duplicating long command blocks in both files (README = primary for humans; CLAUDE keeps technical depth).

## Files to touch

| File | Action |
|------|--------|
| `README.md` | **Create** with the sections above |
| `CLAUDE.md` | **Optional** one-line pointer to README under Build and run |

## Out of scope

- GitHub Actions or shell scripts (user asked for README clarity only).
- Replacing `CLAUDE.md` content with README (keep both; different audiences).
