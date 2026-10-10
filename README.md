# DrukView — Every Ngultrum Accounted For

**Your dzongkhag. Your data. Your right.** An open-source civic-transparency platform for Bhutan: where public money goes — development projects, budgets and allocations by dzongkhag (and gewog/village where documents go that deep) — with the **funding source and a link to the original document on every figure**.

Modelled on the district-dashboard approach of [ForThePeople.in](https://github.com/jayanthmb14/forthepeople) (MIT), reimplemented for Bhutan.

## What you get
- **Home:** dzongkhag search + interactive map. Click a dzongkhag → budget explorer (fiscal-year selector, clickable funding-source / sector / gewog bars, expandable projects).
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
| geoBoundaries (map shapes) | automated (`pipeline/boundaries.mjs`) | weekly |
| MoF / MoHCA / MoAL & other ministries' budgets, allocations, tenders, offices | **curated CSV** in `data/manual/` — these are PDFs/web pages with no API. Every row must cite its public document | on commit |

Collectors run via `vercel.json` crons → `/api/cron/<job>` (protected by `CRON_SECRET`; disabled if unset). Each job is isolated: on failure the previous good rows stay, the source is flagged **stale** on the Data sources page, and the run is written to the update log. A batch with any invalid record loads nothing.

## Honesty rules (enforced in code and tests)
- No sample/estimated data ships. With no data, the UI says so.
- Nu. (government) and US$ (partners) are never summed or converted.
- A multi-dzongkhag project is counted in each dzongkhag but its money is **not split** — only single-dzongkhag projects add to a dzongkhag's US$ total.
- Locations guessed from place names are labelled "inferred from text". "Committed" is never shown as "spent".
- Weather is modelled for each dzongkhag's headquarters town (approximate point), not station-measured.

## Run locally
```bash
cp .env.example .env.local          # set DATABASE_URL, CRON_SECRET
npm install
npm run db:migrate && npm run db:seed
npm run job -- manual               # load data/manual/*.csv
npm run job -- worldbank            # needs network access to the source
npm run dev                         # http://localhost:3000
```
Tests: `npm test` (unit). Database integration tests run when `TEST_DATABASE_URL` points at a **throwaway** Postgres database (CI does this automatically; the suite drops and recreates the `public` schema there).

## Deploy (Vercel)
1. Import the repo into Vercel and attach a Postgres database (Neon via the Storage tab). Set `CRON_SECRET` (any long random string) and `NEXT_PUBLIC_SITE_URL`, then redeploy.
2. **One-time setup (creates the tables and seeds the 20 dzongkhags)** — no local tools needed:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/setup
   ```
   It is idempotent; running it again is harmless. (Alternative from a terminal: `npm run db:migrate && npm run db:seed`.)
3. Load data by calling each collector once (Vercel Cron then repeats them on schedule):
   ```bash
   for j in manual worldbank adb weather boundaries; do curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/$j; echo; done
   ```
   Then check the **Data sources** page: any failing job shows its exact error.

Until step 2 the site shows "The database needs one-time setup" rather than data.

## Known gaps
- World Bank field names, the ADB IATI URL and the geoBoundaries response were written from public docs and **have not yet been exercised against the live services** (the build sandbox blocked them). After deploying, check **Data sources** — any failing job shows its exact error.
- Tenders: automated collection from Bhutan's e-GP portal is not built (source not yet verified); tenders and leadership/office entries are curated CSV only, so those modules start empty.
- Dzongkha: the app is wired for locales (`/en/…`) but ships English only; a Dzongkha translation will be added once a native speaker can review it.
- No population figures yet, so Compare shows absolute, not per-person, numbers.
- Gewog/village granularity depends on curated rows.
