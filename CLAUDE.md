# Keele Arboretum — cherry (and campus tree) mapping project

This folder holds source material and (eventually) the build pipeline for a **maintainable, web-based campus map** aligned with Keele’s National Collection of Flowering Cherries and related arboretum content.

## Background and goals (from correspondence)

- **Problem:** Paper/Illustrator maps are hard to share; tree labels go missing and identification is difficult; arboretum leaflets need replacing and a **single base map with swappable layers** (cherries, woodland walks, heritage, open day, etc.) is desirable long term.
- **Near-term win:** A **zoomable base map** with cherries (and optionally other trees) plotted from a **single data source** so edits propagate automatically.
- **Website integration:** Each cherry has an A–Z page under  
  [National Collection of Flowering Cherries](https://www.keele.ac.uk/arboretum/nationalcollectionoffloweringcherries/collection/). Ideal UX: a **“Locate”** control that opens or deep-links a map centred on that tree.
- **Data gap:** Not all cherries have grid references yet; **What3Words** can be derived from coordinates once those exist.

Primary contact on the content side: **Dave Emley** (arboretum). Project driver in this workspace: **Chris Beard**.

## What is in this directory

| Item | Role |
|------|------|
| `project-notes.txt` | Email thread preserved as plain-text context |
| `prompt.txt` | Working notes / instructions for tooling |
| `Keele trees Dec25.xlsx` | Master spreadsheet (Dec 2025 export) |
| `campus_maps_trees.pdf` | Reference campus map (PDF) |
| `.venv/` | Local Python environment (OpenPyXL installed here for inspection; not committed) |
| `requirements.txt` | Python deps for a future XLSX → GeoJSON build (`openpyxl`, `pyproj`) |
| `.gitignore` | Ignores `.venv/`, Excel lock files, `project-notes.txt`, `prompt.txt` |
| `scripts/xlsx_to_geojson.py` | Build: workbook → `docs/data/*.geojson` |
| `docs/` | GitHub Pages site: map UI + generated GeoJSON |
| `README.md` | Maintainer quick start: install, run export, spreadsheet rules, publishing handoff |

**Do not rely on** `~$Keele trees Dec25.xlsx` if it appears — that is Excel’s temporary lock file.

## Spreadsheet structure — what exists today

Workbook: **`Keele trees Dec25.xlsx`** — **3 sheets**.

### Sheet: `Cherries` (primary for the cherry map)

- **Rows:** 490 total (486 data rows with at least one populated cell).
- **Columns (14):**  
  `photo needed`, `text needed`, `Tag`, `Square`, `Species`, `Latin_Name`, `Planted`, `X`, `Y`, `w3w`, `Comments`, `Memorial, Commemorative`, `Synonymy & old names`, `Source`

**Approximate completeness** (non-empty data rows, Dec 2025 file):

| Column | Filled | Notes |
|--------|--------|--------|
| Tag | ~100% | Strong candidate for **stable ID** in URLs and GeoJSON |
| Square | ~100% | Grid square on existing maps / web pages |
| Species / Latin_Name | ~100% | |
| X / Y | ~82% | Numeric; look like **British National Grid** easting/northing (see below) |
| Planted | ~66% | |
| Source | ~66% | |
| Comments | ~26% | |
| Memorial… | ~17% | |
| text needed | ~13% | Editorial flag |
| Synonymy… | ~8% | |
| photo needed | ~7% | Editorial flag |
| w3w | ~4% | Sparse; can be generated later from XY |

### Sheet: `other trees`

- **Layout:** Rows 1–3 are **notes and a header row**; **row 4** is the real column header (`Tag`, `Square`, `Species`, …). Data starts row 5.
- **Scale:** ~**2953** tree records (non-cherry and broader campus inventory).
- **Columns (11):** same core set as cherries minus some cherry-specific fields; includes `Tag` … `Synonymy & old names`.

**Approximate completeness:**

| Column | Filled | Notes |
|--------|--------|--------|
| Tag / Square / Latin_Name | ~100% | |
| Species | ~99% | |
| X / Y | ~94% | |
| Planted | ~3% | |
| Memorial… | ~4% | |
| Comments / Synonymy / w3w | ~0% | |

Use this sheet when the product grows from “cherry layer only” to **campus-wide tree layer** or multi-layer maps.

### Sheet: `lost trees`

- **Rows:** ~222 records with content.
- **Columns:** Tag, Square, Species, Latin_Name, X, Y, Planted, Comments, Memorial…, Synonymy… (plus unused trailing columns in the file).
- **X/Y:** ~**47%** populated — useful if you want a **historical / removed trees** layer or audit trail.

### Coordinate system

Sample values (e.g. X ≈ `381773`, Y ≈ `345070`) are consistent with **OSGB36 / British National Grid** (EPSG **27700**). For web maps, convert to **WGS84** (EPSG **4326**) for lat/lon — e.g. `pyproj`, GDAL, or QGIS batch export.

## What is possible (technical)

1. **Excel as source of truth**  
   Keep editing `Keele trees Dec25.xlsx` (or a renamed successor). A **build script** reads the workbook and emits **GeoJSON** (or CSV + lat/lon columns). No manual duplication.

2. **Publishing options** (same static output can support both):
   - **GitHub repo + GitHub Pages:** Push triggers a workflow that runs the script and deploys `index.html` + `data/*.geojson`. Free HTTPS, easy previews.
   - **Keele CMS drop-in:** Build a **folder of static files** (HTML/CSS/JS + GeoJSON). Many university sites can host static assets or you embed an iframe pointing at the GitHub Pages URL if policy allows.

3. **“Locate” from A–Z pages**  
   If each page can include a small script or link, use a **query parameter** keyed on `Tag`, e.g. `map.html?tag=4001`, and have the map script pan/zoom and open a popup. Requires **stable Tags** and agreement with whoever edits Keele pages.

4. **Base map**  
   Use tile layers with compatible **licensing** (OpenStreetMap-derived tiles, Ordnance Survey APIs where licensed, or Keele-provided imagery if available). Campus detail may need **custom tiles** or **GeoPDF/GeoTIFF** alignment if OSM is insufficient — the included `campus_maps_trees.pdf` is a visual reference, not yet a georeferenced layer in this repo.

5. **What3Words**  
   Batch generation from coordinates is feasible technically but check **W3W terms/licensing** for your use case before automating.

6. **Long-term layers (Dave’s vision)**  
   The same pattern extends to woodland walks, heritage, etc.: separate **GeoJSON layers** + toggles in one map app.

## Recommended way forward

1. **Normalize the workbook slightly** (low friction):  
   - Consider a **single header row on row 1** for every sheet (move section comments to a “Notes” column or a README tab) so scripts do not need sheet-specific row offsets.  
   - Fill **X/Y** for cherries missing coordinates where possible.  
   - Keep **`Tag`** unique and stable.

2. **Add a small build pipeline** in this folder or a new Git repo:  
   - `requirements.txt` with `openpyxl`, `pyproj` (or equivalent).  
   - Script: XLSX → cleaned **GeoJSON** per layer (`cherries.geojson`, `other_trees.geojson`, optional `lost_trees.geojson`).  
   - Optional: export **CSV** for non-GIS reviewers.

3. **Ship a minimal static map MVP:**  
   - One page, **Leaflet** or **MapLibre GL** (if targeting older browsers, prefer Leaflet and keep JS **ES5-compatible** unless the audience is known to be modern-only).  
   - Toggle: cherries on/off; later, other layers.

4. **Repository / Pages:**  
   - Initialize git, add `.gitignore` (already includes `.venv/`, Excel locks).  
   - Enable GitHub Pages from `/docs` or a `gh-pages` branch / Actions artifact.

5. **Coordinate with Keele web** for the **Locate** button: link pattern and whether iframe vs inline is allowed.

## Build and run (implemented)

Maintainer-oriented steps (spreadsheet rules, column fragility, who to contact for publishing) are in **`README.md`**.

1. **Python environment** (from repo root):

   ```bash
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```

2. **Regenerate GeoJSON** after editing the workbook:

   ```bash
   .venv/bin/python scripts/xlsx_to_geojson.py -i "Keele trees Dec25.xlsx" -o docs/data
   ```

   Outputs: `docs/data/cherries.geojson`, `other_trees.geojson`, `lost_trees.geojson`. Rows without British Grid **X/Y** are skipped (counts printed on stderr). Duplicate **Tag** values within a sheet are reported on stderr.

3. **Preview the map locally** (browsers block `file://` XHR; use a static server):

   ```bash
   cd docs && python3 -m http.server 8765
   ```

   Open `http://127.0.0.1:8765/` — toggles load optional layers; **`?tag=4001`** or **`?square=L7`** deep-link (cherries layer; tag search also enables other/lost layers if needed).

4. **GitHub Pages:** Repository Settings → Pages → deploy from branch **`main`** (or default) with folder **`/docs`**. Commit the generated `.geojson` files so the site works without Actions.

5. **Git:** `project-notes.txt` and `prompt.txt` are listed in `.gitignore` and must not be committed.

| Path | Role |
|------|------|
| `scripts/xlsx_to_geojson.py` | XLSX → GeoJSON (EPSG:27700 → WGS84) |
| `docs/index.html` | Map page (Leaflet) |
| `docs/js/map.js` | Map logic (ES5) |
| `docs/css/map.css` | Layout / header styling |
| `docs/data/*.geojson` | Generated layers (commit after rebuild) |

### Spreadsheet contract (summary)

- Day-to-day editing rules (layout, coordinates, sheet names, column renames) → **`README.md`**.  
- Exact header→property behaviour → **`scripts/xlsx_to_geojson.py`** (`header_to_key` and coordinate keys: `x`, `y`, `easting`, `northing`).  
- Which properties the map displays → **`docs/js/map.js`** (`propsToPopupHtml` and `?tag=` / `?square=` matching).

## Progress log

_Update this section as work proceeds._

| Date | Note |
|------|------|
| 2026-04-03 | Folder assessed; `project-notes.txt` archived; workbook structure and column fill-rates captured; `.venv` created locally with OpenPyXL for analysis; this `CLAUDE.md` added; `.gitignore` and `requirements.txt` (openpyxl, pyproj) added for a future GitHub-based build. |
| 2026-04-03 | Implemented `scripts/xlsx_to_geojson.py`, static Leaflet site under `docs/` (ES5 `map.js`, layer toggles, `?tag=` / `?square=` deep links), generated GeoJSON committed to `docs/data/`; `.gitignore` excludes `project-notes.txt` and `prompt.txt`. |
| 2026-04-03 | Added root `README.md` for maintainers (install, export, spreadsheet rules, column/map fragility, publishing handoff); `CLAUDE.md` cross-links and spreadsheet contract summary. |

## Open questions

- **Canonical filename** for the live spreadsheet (version in filename vs fixed name + git history).
- **Official base map** and **tile licensing** for Keele’s use.
- **Who maintains** Tags and coordinates after handover.
- **CMS constraints** on Keele side (inline JS, iframes, external domains).

---

*This file is for humans and AI assistants: it summarizes intent, data reality, and next steps so work can resume without re-reading the full email thread.*
