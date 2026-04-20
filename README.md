# Keele Arboretum — tree map

This repository turns the **Keele trees** Excel workbook into **GeoJSON** layers and serves a **static Leaflet map** from the `docs/` folder (suitable for **GitHub Pages** or any static web host).

**Maintainer quick path:** install Python dependencies once → edit the spreadsheet → run the export script → preview locally. **Publishing** (which GitHub repo, Pages settings, Keele upload, or credentials) is **not automated here** — contact the **original developer / repository owner** for that.

---

## Prerequisites

- **Python 3.9+** (3.10+ recommended)
- **Git** — only if you will commit changes or push to a remote

---

## One-time setup

From the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

On Windows, use `.venv\Scripts\pip` and `.venv\Scripts\python` instead of `.venv/bin/…`.

---

## Regenerate map data (after spreadsheet changes)

```bash
.venv/bin/python scripts/xlsx_to_geojson.py -i "Keele trees database.xlsx" -o docs/data
```

This overwrites:

- `docs/data/cherries.geojson`
- `docs/data/other_trees.geojson`

**Stderr** reports how many rows were skipped (no **X/Y** coordinates) and warns about **duplicate Tag** values inside a sheet. Rows without both coordinates do **not** appear on the map.

You can point `-i` at another workbook path if your team agrees a different filename.

---

## Preview the map on your computer

Opening `docs/index.html` directly in a browser usually **fails** (browsers block loading `data/*.geojson` from `file://`). Use a tiny local server:

```bash
cd docs && python3 -m http.server 8765
```

Then open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

Try **`?tag=4001`** or **`?square=L7`** on the URL to test deep links.

---

## Visitor location (optional)

The map includes a **Show my location** control. It requests browser permission and then continuously updates your position while you walk.

- Click **Show my location** to start live tracking.
- Click **Stop tracking** to stop updates (recommended to save battery).
- Position display requires geolocation support and user permission.
- In production, geolocation usually requires **HTTPS** (or `localhost` while testing).

If permission is denied or unavailable, the map shows a status message in the location panel.

---

## Editing the spreadsheet (maintainer rules)

1. **Source of truth** — The workbook (by default `Keele trees database.xlsx`) is the master copy. After you change it, run the export command above, then **commit** the updated `.geojson` files (and the `.xlsx`, if your process keeps it in git).

2. **Coordinates** — **X** and **Y** must remain **British National Grid** easting and northing (EPSG:27700). If either is missing, that row is **omitted** from the map. Filling in coordinates is the most common data task.

3. **Tag and Square** — Keep **Tag** values **unique** within each sheet when you can. Duplicates trigger warnings and break **`?tag=`** links (the map uses the **first** match). **Square** is used for **`?square=`** links.

4. **Sheet layout (do not break without developer help)**  
   - **`Cherries`** — Column headers must stay on **row 1**. Do not insert rows above them.  
   - **`other trees`** — The script finds the header row by scanning for the first row whose **first cell** is **`Tag`**. Keep that pattern; notes above the table are fine **only** if column A in those rows is **not** the text `Tag`.  

5. **Worksheet names** — Export currently depends on `Cherries` and `other trees`. Renaming either tab **breaks the export** until `scripts/xlsx_to_geojson.py` is updated.

---

## Column names and the map (easy to break)

The export script reads the **header row** of each sheet and turns each column name into a **snake_case** property on every GeoJSON feature (for example `Latin_Name` → `latin_name`). The map page [`docs/js/map.js`](docs/js/map.js) reads a fixed set of properties for popups and links, including:

`tag`, `square`, `latin_name`, `species`, `planted`, `w3w`, `comments`, `source_sheet`

- **Renaming, merging, or splitting columns** changes property names in the JSON. Popups may **lose fields** or **silently show nothing** for that data until the script and/or map code is updated.  
- **Position columns** — The exporter treats grid coordinates only when the normalised header is **`x`**, **`y`**, **`easting`**, or **`northing`** (so the usual **`X`** and **`Y`** headers work). If you rename them to something that does not normalise to those keys, points will **disappear** or be wrong.  
- **Identity** — The **`Tag`** column must still normalise to **`tag`** for deep links and stable IDs.

If you need structural changes (new columns, renames, new sheets), **contact the original developer** so `scripts/xlsx_to_geojson.py` and `docs/js/map.js` can be updated together with the workbook.

---

## Publishing and endpoints (contact the developer)

There is **no single “publish” command** in this project.

After regenerating GeoJSON, typical **changed files** are `docs/data/*.geojson` and possibly the `.xlsx`.

To go live you usually either:

- **Commit and push** to the agreed Git remote (so GitHub Pages or similar can serve `docs/`), or  
- **Upload** the contents of `docs/` to institutional hosting.

**Contact Chris Beard** (repository owner / original developer) for: which remote to use, GitHub Pages settings, access tokens, or how Keele should host or embed the map.

---

## Further reading

- [`CLAUDE.md`](CLAUDE.md) — Project background, sheet/column inventory, coordinate notes, and GitHub Pages (`/docs`) summary.
