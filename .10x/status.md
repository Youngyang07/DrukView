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

**Open, with owners' decisions recorded**
1. Nothing alerts when a source has been stale for days (devops/publish-readiness — needs a destination).
2. Read e-GP's Notification-of-Contract-Award list (ADR-0002, action 5).
3. A "source last changed" signal, so stale can distinguish "we failed" from "nothing new" (ADR-0001).
4. `CRON_SECRET` must be rotated before/at publish — the historical value is exposed.
5. Audit the other modules' empty states for the same false-explanation problem the Tenders page had.
6. 31 of 205 gewog names unmatched to map boundaries; Dzongkha translation; e-GP archive — all in README
   "Known gaps".
