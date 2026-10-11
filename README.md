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
| Parliament of Bhutan member records (National Assembly + National Council) | automated (`pipeline/leaders.mjs`; override with `PARLIAMENT_API`) | daily |
| Kuensel and The Bhutanese feeds — leadership-change watch | automated (`pipeline/news.mjs`; override with `KUENSEL_FEED` / `BHUTANESE_FEED`) | daily, with the members |
| Open-Meteo weather | automated (`pipeline/weather.mjs`) | daily (Vercel Hobby allows at most one run/day per cron; on a Pro plan change `vercel.json` to e.g. `37 */6 * * *`) |
| **Ministry of Finance, National Budget Report FY 2026-27** — national summary, sector allocation, and the allocation of every dzongkhag, thromde and all 205 gewogs | **reference file** `data/reference/budget-2026-27.json` | yearly (new budget each May) |
| NSB 2017 Population & Housing Census (Table 2.1) | **reference file** `data/reference/population-2017.json` | per census |
| Ministry of Health, Annual Health Bulletin 2025 (Table 6.1) — all hospitals, PHCs, sub-posts, HISCs with beds | **reference file** `data/reference/health-facilities.json` | yearly |
| MoESD Annual Education Statistics 2024 (Annexure IV) — all 566 schools by name and level | **reference file** `data/reference/schools-2024.json` | yearly |
| Parliament member records, as shipped | **reference file** `data/reference/leaders.json` — the fallback shown until the daily refresh above has run | on change |
| MoICE Annual Industry Report FY 2025-26 (Annexure 3) and National Employment Report 2024-25 — industry licences and jobs filled per dzongkhag | **reference file** `data/reference/economy.json` | yearly |
| Dzongkhag administration websites and dated appointment notices — Dzongdags and office contacts | **reference file** `data/reference/dzongdags.json`, each entry graded by how well it is confirmed | on change |
| MoF / MoHCA / MoAL & other ministries' budgets, allocations, tenders, offices | **curated CSV** in `data/manual/` — these are PDFs/web pages with no API. Every row must cite its public document | on commit |

Reference files ship with the code and work even without a database. `tests/reference.test.ts` checks each against the publication's own totals (census sums, the Health Bulletin's per-dzongkhag totals rows, MoESD Table A, 47 NA seats with the constitutional split), so a transcription slip fails CI.

Collectors run via `vercel.json` crons → `/api/cron/<job>` (rate-limited per job; a `CRON_SECRET` bearer skips the limit), and from the **Load / refresh data now** button on the Data sources page. Each job is isolated: on failure the previous good rows stay, the source is flagged **stale** on the Data sources page, and the run is written to the update log. A batch with any invalid record loads nothing.

### How the leaders list stays current
The daily `leaders` job reads Parliament's own member records and replaces the list — but only if the response is a **complete** Parliament: 47 National Assembly seats with the constitutional split per dzongkhag, and one elected National Council member per dzongkhag. Anything less is rejected, the previous list stays, and the source is marked stale, so a half-written or broken response can never leave a gap on the site. The job finds the current term itself (the highest-numbered Parliament that is fully seated), so it keeps working after the next election without a code change. Until the job has run, the bundled `data/reference/leaders.json` is shown instead.

**Newspapers are a watch, never a source.** The same job reads the Kuensel and The Bhutanese feeds and flags articles that read like a change of office-holder in a named dzongkhag. A flag is a dated link inviting someone to re-check that entry against the official source — no name on DrukView is ever taken from a newspaper, because a headline such as "Dasho takes charge in Trongsa" cannot be parsed into a correct name, and a wrong name on a transparency site is worse than a late one. A feed that fails never fails the members refresh.

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
- Tenders: automated collection from Bhutan's e-GP portal is not built (source not yet verified), so tenders are curated CSV only and that module starts empty.
- World Bank records carry no sub-national location, so most are "national / unspecified"; ~10% are placed by place names in the text (labelled "inferred").
- Dzongkha: the app is wired for locales (`/en/…`) but ships English only; a Dzongkha translation will be added once a native speaker can review it.
- Population is the 2017 census (the next census is due 2027); per-person ratios that divide newer counts by 2017 population are labelled indicative.
- Health: Trongsa's totals row in the Bulletin reports 4 sub-posts but names only 3.
- Schools: names come from PDF text extraction (a few spellings may be off); the middle- vs higher-secondary split per dzongkhag is approximate (combined figure is exact).
- Dzongdags: there is no single official machine-readable list, so each name is read from the dzongkhag's own site or a dated appointment notice and is published with a confidence grade (4 confirmed by a dated notice, 14 from an undated website page, 2 unconfirmed). Re-check them against RCSC appointment notifications when they can be reached.
- MoICE publishes no unemployment rate by dzongkhag; its labour-force figures come from the NSB Labour Force Survey and are national only. Industry figures are licences in force, not businesses known to be trading.
- Village-level allocations depend on curated rows; the Ministry of Finance budget goes down to gewog level only.
- 31 of the 205 gewog names in the budget could not be matched to a map boundary with confidence, so those gewogs are listed in the tables but left unshaded on the map rather than attached to the wrong shape.
