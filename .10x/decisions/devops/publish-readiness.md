# publish-readiness

## Current infrastructure (mapped 2026-10-11)

| Piece | How |
|---|---|
| App | Next.js 15 App Router on Vercel; `maxDuration = 60` on the cron route; `poweredByHeader` off |
| Database | Postgres (Neon via Vercel Storage). Append-only SQL migrations in `db/migrations.ts`, applied under a Postgres advisory lock on the first request (`src/server/setup.ts`) |
| Collectors | 6 jobs — `worldbank`, `adb`, `weather`, `leaders` (+ news watch), `tenders` (e-GP), `manual` — each a daily `vercel.json` cron hitting `/api/cron/<job>`, staggered 02:17–04:57 UTC |
| Rate limiting | `claimRun()` — a single atomic `UPDATE … RETURNING` per source. 6 h donors/Parliament, 3 h e-GP, 2 h weather, 10 min curated; 5 min retry after a failure |
| Deadline | 50 s per job (`JOB_DEADLINE_MS`), inside the platform's 60 s, so a slow source is *recorded* as slow |
| CI | GitHub Actions: typecheck + tests + production build on Node 20 and 22, Postgres 16 service for the DB tests; a second job checks curated-CSV citations and scans for committed secrets. Concurrency cancels superseded branch runs but never `main` |
| Dependencies | Dependabot, monthly, grouped (framework / everything else) + github-actions |
| Health | `GET /api/health` → `{ok, db, freshness}` per source |
| Observability for humans | Data sources page: per-source status (`ok` / `stale` / `error`), last success, record count, last error verbatim; Update log page |

## Gaps found in this review, and what was done

| Gap | Decision |
|---|---|
| No `sitemap.xml`, and `robots.txt` pointed at none — a public transparency site that search engines cannot enumerate | **Fixed.** `src/app/sitemap.ts` generates every locale, page, dzongkhag and module from the same lists the router uses, so a new module needs no second edit; `robots.ts` now advertises it |
| CI ran a single Node version while `package.json` says `>=20` | **Fixed.** Matrix on 20 and 22, `fail-fast: false`, 15-minute timeout |
| A long CI queue on a busy branch | **Fixed.** `concurrency` cancels superseded runs except on `main` |
| Dependency updates arriving one PR per package | **Fixed.** Dependabot grouped, monthly |
| The data rules were documented but only partly enforced | **Fixed.** A `data-rules` CI job checks every curated CSV row cites an `https` document and greps for a committed `CRON_SECRET`/`DATABASE_URL` value. Both scripts were verified locally, including a positive control (an uncited row fails the job) |
| Nothing notices a source that has been stale for days | **Open.** Deliberately not solved with new infrastructure: a cheap option is a job that posts to a webhook when any source has `status <> 'ok'` and `last_success < now() - 3 days`. Needs a destination the maintainer actually reads |
| No error tracking (Sentry etc.) | **Open, and deliberately deferred.** Vercel's own function logs plus `update_log` cover the failure modes that matter; a paid APM for a site with six daily jobs is cost without a reader-visible benefit. Revisit if the site gets real traffic |

## Rollback

- **App:** Vercel keeps previous deployments — promote the last good one. No build-time data, so a rollback is
  instant and cannot lose data.
- **Schema:** migrations are additive (`0004` is `ADD COLUMN … DEFAULT`), so the previous app version runs
  unchanged against the new schema. Rolling the app back therefore needs **no** schema change. There is no
  `down` migration and that is intentional: a destructive rollback on a live database is a worse risk than a
  stray column.
- **Data:** a collector failure is already its own rollback — nothing is written, the previous rows stay, the
  source shows stale. To undo a bad load, re-run the job (`/api/cron/<job>` with the secret to skip the
  interval); each job replaces only its own rows.
- **Blast radius of this change set:** the e-GP job writes only `tenders` rows tagged `source='egp'`. Worst
  case it fails daily and the Tenders module shows what the curated CSV holds, which is the status quo.

## Before publishing — operator checklist

1. Set `DATABASE_URL` (required) and `NEXT_PUBLIC_SITE_URL` (so `sitemap.xml`/`robots.txt` carry the real
   host). Leave the source overrides (`EGP_BASE`, `PARLIAMENT_API`, `ADB_IATI_URL`, `KUENSEL_FEED`,
   `BHUTANESE_FEED`) **empty** in production.
2. **Rotate `CRON_SECRET`.** The value used earlier in this project's history was pasted into a chat and must
   be treated as exposed. It only lifts a rate limit, but rotate it anyway.
3. Open the site once (creates the schema), then press **Data sources → Load / refresh data now**.
4. Read the Data sources page: every source `ok` with a record count. A `stale` e-GP row on day one means the
   portal's table shape has moved — re-capture `tests/fixtures/egp-tender-listing.html` and fix the parser.
5. Confirm `GET /api/health` returns 200 and that the six cron entries appear under the Vercel project's Cron
   Jobs tab.
