# DrukView — Every Ngultrum Accounted For

**Your dzongkhag. Your data. Your right.** An open-source civic-transparency platform for Bhutan: where public money goes — development projects, budgets and allocations by dzongkhag (and gewog/village where documents go that deep) — with the **funding source and a link to the original document on every figure**.

Modelled on the district-dashboard approach of [ForThePeople.in](https://github.com/jayanthmb14/forthepeople) (MIT), reimplemented for Bhutan.

## What you get
- **Home:** dzongkhag search + an interactive map of Bhutan (real boundaries, bundled with the app so it always renders): zoom (+ / −, Ctrl + scroll, pinch), drag when zoomed, hover names. Click a dzongkhag → it zooms in, shows its **205-gewog drill-down** (click a gewog to filter its budget lines) and opens the budget explorer (fiscal-year selector, clickable funding-source / sector / gewog bars, expandable projects).
- **Per-dzongkhag dashboard** (`/en/thimphu`) with a module sidebar, and a **national** one (`/en/bhutan`): Overview · Budget & allocations · Projects · Funding sources · Weather & rainfall · Tenders · Leadership & offices.
- **Compare** dzongkhags, **Data sources** (live status per source), **Update log**, CSV export, "Report a problem" links, a "last refreshed" stamp on every module.

## Stack
Next.js 15 (App Router, TypeScript) · PostgreSQL (`pg`, plain SQL migrations) · Vercel Cron collectors · Vitest.

## Data sources
| Source | How | Refresh |
|---|---|---|
| World Bank Projects & Operations API | automated (`pipeline/worldbank.mjs`) | daily |
| Asian Development Bank IATI file | automated (`pipeline/adb.mjs`; override with `ADB_IATI_URL`) | daily |
| Open-Meteo weather | automated (`pipeline/weather.mjs`) | daily (Vercel Hobby allows at most one run/day per cron; on a Pro plan change `vercel.json` to e.g. `37 */6 * * *`) |
| MoF / MoHCA / MoAL & other ministries' budgets, allocations, tenders, offices | **curated CSV** in `data/manual/` — these are PDFs/web pages with no API. Every row must cite its public document | on commit |

Collectors run via `vercel.json` crons → `/api/cron/<job>` (rate-limited per job; a `CRON_SECRET` bearer skips the limit), and from the **Load / refresh data now** button on the Data sources page. Each job is isolated: on failure the previous good rows stay, the source is flagged **stale** on the Data sources page, and the run is written to the update log. A batch with any invalid record loads nothing.

## Honesty rules (enforced in code and tests)
- No sample/estimated data ships. With no data, the UI says so.
- Nu. (government) and US$ (partners) are never summed or converted.
- A multi-dzongkhag project is counted in each dzongkhag but its money is **not split** — only single-dzongkhag projects add to a dzongkhag's US$ total.
- Locations guessed from place names are labelled "inferred from text". "Committed" is never shown as "spent".
- Weather is modelled for each dzongkhag's headquarters town (approximate point), not station-measured.

## Run locally
```bash
cp .env.example .env.local          # set DATABASE_URL (CRON_SECRET optional)
npm install
npm run db:migrate && npm run db:seed   # optional: the app also does this itself on first visit
npm run job -- manual               # load data/manual/*.csv
npm run job -- worldbank            # needs network access to the source
npm run dev                         # http://localhost:3000
```
Tests: `npm test` (unit). Database integration tests run when `TEST_DATABASE_URL` points at a **throwaway** Postgres database (CI does this automatically; the suite drops and recreates the `public` schema there).

## Deploy (Vercel)
1. Import the repo into Vercel and attach a Postgres database (Neon, via the project's **Storage** tab). That sets `DATABASE_URL` — the only required setting.
2. Open the site. **The tables are created automatically on the first visit.**
3. Go to **Data sources → Load / refresh data now** (about a minute). Every source then also refreshes automatically once a day via Vercel Cron.

Optional: `CRON_SECRET`. The data jobs only read public data, so they run without a secret but at most once per interval (World Bank/ADB 6 h, map 12 h, weather 2 h, curated CSVs 10 min; 5 min after a failure). A request carrying `Authorization: Bearer $CRON_SECRET` skips that interval. Every job stops after 50 s and records why, so a slow source can never fail silently.

## Data-source verification (2026-10-10)
The automated sources were checked against their **real responses**, and the parsers' tests use trimmed copies of those (`tests/fixtures/*real*`):
- **World Bank**: 63 Bhutan projects. Handles `project_abstract` = `{"cdata!": …}`, US-style dates (`12/31/2027 12:00:00 AM`), and `totalcommamt "0"` (= *not reported*, shown as such, never "US$0").
- **ADB (IATI)**: `https://www.adb.org/iati/iati-activities-bt.xml` is valid IATI 2.03; 62 activities are merged into 38 projects (e.g. grants 0088 + 0089 → project 39221-022, US$14.30M, matching adb.org). IATI status 3 "Finalisation" = completed (adb.org shows these as Closed). Sector codes are resolved to names from the official IATI codelist (`shared/iati-sectors.json`).
- **Map boundaries** are bundled (`src/geo/bhutan-dzongkhags.json`, `public/geo/bhutan-gewogs.json`) from OCHA ROAP / HDX via geoBoundaries (gbHumanitarian 2019, CC BY 3.0 IGO): 20 dzongkhags + 205 gewogs from one consistent dataset; every gewog's dzongkhag was assigned geometrically and checked against the official count per dzongkhag (tested).
- **Open-Meteo**: multi-location response format matches the parser.

What is still unproven is the *runtime* on your host (network egress, timeouts, database permissions): run the collectors once after deploying and read the **Data sources** page.

## Known gaps
- Tenders: automated collection from Bhutan's e-GP portal is not built (source not yet verified); tenders and leadership/office entries are curated CSV only, so those modules start empty.
- World Bank records carry no sub-national location, so most are "national / unspecified"; ~10% are placed by place names in the text (labelled "inferred").
- Dzongkha: the app is wired for locales (`/en/…`) but ships English only; a Dzongkha translation will be added once a native speaker can review it.
- No population data yet, so Compare shows absolute, not per-person, numbers.
- Gewog/village granularity depends on curated rows.
