# DrukView — Every Ngultrum Accounted For

Track projects. Follow funds. Build trust. An open, static web app showing where Bhutan's public money goes: development projects, budgets and allocations by dzongkhag (and gewog/village where data exists), with the **funding source and a link to the original document on every figure**.

## Where the data comes from

| Source | How | Refresh |
|---|---|---|
| World Bank – Projects & Operations API | automated (`pipeline/worldbank.mjs`) | daily |
| Asian Development Bank – IATI file | automated (`pipeline/adb.mjs`, URL overridable via `ADB_IATI_URL`) | daily |
| Dzongkhag boundaries – geoBoundaries | automated (`pipeline/boundaries.mjs`) | daily |
| Ministry of Finance, Home & Cultural Affairs, Agriculture & Livestock, other ministries | **curated CSV** in `data/manual/` (their budgets are PDFs; no API exists). Every row must carry `source_url` (https) and `document` or the build rejects it | on commit |

`.github/workflows/update-data.yml` runs the pipeline daily and commits changed `data/*.json`. If a source fails, its last good data stays visible and is flagged *stale* on the **Data & sources** tab — it is never silently wiped.

## Honesty rules built in
- No sample/estimated data ships. Until the first update runs, the UI says so.
- US$ partner financing and Nu. budgets are never summed or converted.
- Money of a multi-dzongkhag project is not split between districts (counted in each, amount attributed only to single-district projects).
- Locations inferred from text are labelled "inferred from text".
- "Committed" ≠ "spent"; disbursement is shown only if the source reports it.

## Run
```
npm install
npm test            # parser/validator tests
npm run update      # needs network access to the sources
npm run serve       # http://localhost:8080
```

## Known gaps / next steps
- ADB's IATI URL and World Bank field names are written from their public docs but **have not been exercised against the live services yet** (the build sandbox blocked them). Run the "Update data" workflow once and check the *Data & sources* tab.
- Gewog/village granularity depends on curated rows; the schema and UI already support it.
- Adding more partners (JICA, UNDP, IFAD…) = one IATI config like `adb.mjs`.
