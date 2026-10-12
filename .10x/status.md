# Project status

**Phase:** ready to publish.

**Last change set (2026-10-11)**
- `tenders` is no longer an empty module: a sixth collector reads the Royal Government's e-GP tender list daily
  (ADR-0002). Migration `0004` separates e-GP rows from curated ones.
- Open-source contribution rules added: `CONTRIBUTING.md` (seven data rules), `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, issue forms, PR template, Dependabot.
- Publish-readiness: `sitemap.xml` + `robots.txt` pointing at it; CI on Node 20 and 22 with concurrency control
  and a new `data-rules` job (uncited CSV rows, committed secrets).
- Architecture recorded in `docs/adr/0001` and `docs/adr/0002`.

**Checks:** `npm run typecheck` clean · `npm test` 59 passing (including the 10 Postgres integration tests)
· `npm run build` clean · migration `0004` verified applying incrementally to a database already at `0003`
· e-GP job verified end-to-end against a local stub · pages rendered and read.

**Correction landed (2026-10-11, after deploy):** the e-GP collector shipped in #9 fetched nothing — it posted
the tender page's own form instead of the row request the portal actually serves, and its parser expected a
table wrapper the response does not have. Found by running the job in production and reading the error.
Rewritten against the request captured live through a Vercel Sandbox: 203 notices, 0 validation errors, 12.9 s.
The Tenders page's empty state, which had been explaining our own failure as "e-GP lists only live tenders",
now distinguishes a failed read from a genuinely empty register. Written up in docs/adr/0002 (Correction).

**Empty-state audit done (2026-10-11):** every module that can render empty now distinguishes "there is none"
from "we could not read it", through one shared `<EmptyOr>` rather than per-module wording. Projects, Funders,
Overview and Weather were all making the Tenders page's mistake in milder form; the Projects list also showed
a blank box when filters matched nothing, and the Weather copy promised a refresh "every 6 hours" when the
cron is daily. Pinned by tests/empty-states.test.ts.

**Staleness alert built (2026-10-12):** the last open item in ADR-0002. A collector that *stops* leaves every
source reading `ok` while the data ages, so staleness is now measured as the age of the last success rather than
read off the status: `/api/cron/alerts` daily, 72 h limit (`STALE_ALERT_HOURS`), reported on the Data sources
page, to an optional `ALERT_WEBHOOK_URL` (once a day per source, plus a recovery line), and as a 503 from
`/api/health` for an outside uptime monitor — which is the only channel that still works when the scheduler
itself is dead. Verified end-to-end against a real database and a real webhook listener; 78 tests pass.

**Open, with owners' decisions recorded**
1. Point an uptime monitor at `/api/health` and (optionally) set `ALERT_WEBHOOK_URL` — the code is in place but
   a destination is a hosting choice, so until one is set the alert is only visible on the Data sources page.
2. Read e-GP's Notification-of-Contract-Award list (ADR-0002, action 5).
3. A "source last changed" signal, so stale can distinguish "we failed" from "nothing new" (ADR-0001).
4. `CRON_SECRET` must be rotated before/at publish — the historical value is exposed.
5. 31 of 205 gewog names unmatched to map boundaries; Dzongkha translation; e-GP archive — all in README
   "Known gaps".
