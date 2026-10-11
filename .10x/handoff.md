# Handoff

## Current handoff → whoever deploys and watches this

**What shipped:** the e-GP tender collector, the open-source contribution rules, and the publish-readiness
items listed in `.10x/decisions/devops/publish-readiness.md`. Read that file's **"Before publishing — operator
checklist"** first; it is five steps and includes rotating `CRON_SECRET`.

**Deploy:** push to `main`; Vercel builds. Required setting: `DATABASE_URL`. Also set
`NEXT_PUBLIC_SITE_URL` so `sitemap.xml` and `robots.txt` carry the real host. Leave every source override
(`EGP_BASE`, `PARLIAMENT_API`, `ADB_IATI_URL`, `KUENSEL_FEED`, `BHUTANESE_FEED`) empty.

**First run:** open the site (schema is created automatically), then **Data sources → Load / refresh data now**
(about a minute). After that, six Vercel crons refresh everything daily, 02:17–04:57 UTC.

**How to tell it is healthy:** `GET /api/health` → 200 with a `freshness` entry per source; the Data sources
page shows each source `ok` with a record count. `stale` means the last run failed and the previous data is
still being shown — the reason is printed on that row, verbatim.

**Rollback:** promote the previous Vercel deployment. Migration `0004` is additive, so the old app version runs
against the new schema unchanged — no schema rollback is needed or provided. To undo a bad data load, re-run
that one job; each job replaces only its own rows.

**The one thing most likely to break:** e-GP is scraped, because the portal publishes no API. If its tender
table changes shape, the `egp` source goes stale (and only that source). Fix: re-capture
`tests/fixtures/egp-tender-listing.html` from the live page and adjust `parseTenderRows()` until
`tests/egp.test.ts` passes again. Do not relax the validation to make the job green.

**Decisions to read before changing anything:** `docs/adr/0001-collector-architecture.md` (why every collector
has the same shape and why failures are all-or-nothing), `docs/adr/0002-egp-tender-collection.md` (why the
scraper exists and the four honesty constraints that are not negotiable detail).

## Handoff history

- *(2026-10-11, earlier)* Daily Parliament refresh with a newspaper **watch** that may raise a flag but never
  supplies a name; see `pipeline/leaders.mjs`, `pipeline/news.mjs` and the README section "How the leaders list
  stays current".
