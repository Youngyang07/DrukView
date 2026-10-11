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
| **e-GP — Electronic Government Procurement System (PMDD, Ministry of Finance)** — live tender notices | automated (`pipeline/egp.mjs`; override with `EGP_BASE`) | daily |
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

### How the tender list is collected
Bhutan's [e-GP portal](https://www.egp.gov.bt/resources/common/TenderListing.jsp?h=t) publishes no API, feed or export: its tender list is a JSP page whose results table is filled in by posting its own search form. The daily `tenders` job therefore does what a browser does — take a session cookie from the search page, post the form, and read the rows out of `<table id="resultTable">` — and then replaces **only e-GP's own rows**, so curated notices are untouched.

Because that table's shape is the whole agreement, the parser is the tested part (`tests/egp.test.ts` runs it against a captured response) and the job is all-or-nothing: a page that comes back without a readable row fails the run, the previous notices stay published and the source is marked stale. A redesign at e-GP therefore shows up as a **stale source**, never as missing or invented notices. Two further honesty constraints: e-GP prints no estimated value in its tender list, so DrukView shows none rather than a guess; and a notice is placed in a dzongkhag only when the **procuring agency's own hierarchy** names exactly one — never from a place name in the title, where it is usually the subject of the work and not its owner. e-GP's detail pages open only inside a session of the reader's own, so each notice cites the public tender list and carries its e-GP tender ID and reference number.

## Contributing
DrukView is open source (MIT) and open to anyone. Start with **[CONTRIBUTING.md](CONTRIBUTING.md)** — it sets out the seven data rules (never invent a number; cite every row; never mix Nu. and US$; never guess an identity or a place; reject the batch, not the row; say what you do not know; keep the date), how to add cited CSV rows or a reference dataset, and how to write a collector.

The most valuable contribution needs no code: if a figure here is wrong, open a **Data correction** issue with a link to the public document that proves it. Also see the [Code of Conduct](CODE_OF_CONDUCT.md) and, for anything security-related, [SECURITY.md](SECURITY.md) — report privately, never in a public issue. CI runs typecheck, tests and a production build on Node 20 and 22 for every push, plus a check that every curated row cites an https document and that no secret is committed.

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

Optional: `CRON_SECRET`. The data jobs only read public data, so they run without a secret but at most once per interval (World Bank/ADB and Parliament 6 h, e-GP tenders 3 h, weather 2 h, curated CSVs 10 min; 5 min after a failure). A request carrying `Authorization: Bearer $CRON_SECRET` skips that interval. Every job stops after 50 s and records why, so a slow source can never fail silently.

## Data-source verification (2026-10-10)
The automated sources were checked against their **real responses**, and the parsers' tests use trimmed copies of those (`tests/fixtures/*real*`):
- **World Bank**: 63 Bhutan projects. Handles `project_abstract` = `{"cdata!": …}`, US-style dates (`12/31/2027 12:00:00 AM`), and `totalcommamt "0"` (= *not reported*, shown as such, never "US$0").
- **ADB (IATI)**: `https://www.adb.org/iati/iati-activities-bt.xml` is valid IATI 2.03; 62 activities are merged into 38 projects (e.g. grants 0088 + 0089 → project 39221-022, US$14.30M, matching adb.org). IATI status 3 "Finalisation" = completed (adb.org shows these as Closed). Sector codes are resolved to names from the official IATI codelist (`shared/iati-sectors.json`).
- **Map boundaries** are bundled (`src/geo/bhutan-dzongkhags.json`, `public/geo/bhutan-gewogs.json`) from OCHA ROAP / HDX via geoBoundaries (gbHumanitarian 2019, CC BY 3.0 IGO): 20 dzongkhags + 205 gewogs from one consistent dataset; every gewog's dzongkhag was assigned geometrically and checked against the official count per dzongkhag (tested).
- **Open-Meteo**: multi-location response format matches the parser.

What is still unproven is the *runtime* on your host (network egress, timeouts, database permissions): run the collectors once after deploying and read the **Data sources** page.

## Known gaps
- Tenders: e-GP lists **live** tenders only, so a dzongkhag with nothing out to bid shows nothing, and a closed notice disappears from the portal (and so from DrukView) rather than becoming an archive. The portal's Archive, Cancelled and Contract-award tabs are not read yet. e-GP publishes no estimated value, so the Value column is empty for its notices.
- World Bank records carry no sub-national location, so most are "national / unspecified"; ~10% are placed by place names in the text (labelled "inferred").
- Dzongkha: the app is wired for locales (`/en/…`) but ships English only; a Dzongkha translation will be added once a native speaker can review it.
- Population is the 2017 census (the next census is due 2027); per-person ratios that divide newer counts by 2017 population are labelled indicative.
- Health: Trongsa's totals row in the Bulletin reports 4 sub-posts but names only 3.
- Schools: names come from PDF text extraction (a few spellings may be off); the middle- vs higher-secondary split per dzongkhag is approximate (combined figure is exact).
- Dzongdags: there is no single official machine-readable list, so each name is read from the dzongkhag's own site or a dated appointment notice and is published with a confidence grade (4 confirmed by a dated notice, 14 from an undated website page, 2 unconfirmed). Re-check them against RCSC appointment notifications when they can be reached.
- MoICE publishes no unemployment rate by dzongkhag; its labour-force figures come from the NSB Labour Force Survey and are national only. Industry figures are licences in force, not businesses known to be trading.
- Village-level allocations depend on curated rows; the Ministry of Finance budget goes down to gewog level only.
- 31 of the 205 gewog names in the budget could not be matched to a map boundary with confidence, so those gewogs are listed in the tables but left unshaded on the map rather than attached to the wrong shape.
