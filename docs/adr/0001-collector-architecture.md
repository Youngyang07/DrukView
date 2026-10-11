# ADR-0001: One shape for every collector — bundled reference files, rate-limited jobs, stale on failure

**Status:** Accepted
**Date:** 2026-10-11
**Deciders:** repository maintainers
**Supersedes:** nothing (records the architecture as built, now that a sixth collector exists)

## Context

DrukView publishes Bhutanese public money. Its sources are nothing alike: two donor APIs (World Bank, ADB
IATI), a Parliament content API, two newspaper feeds, a weather API, a scraped government procurement portal,
and a pile of ministry PDFs that only a human can transcribe. The constraints that actually shape the design:

- **A wrong figure is worse than a missing one.** This is a transparency site; being caught publishing an
  invented number ends its usefulness.
- **A blank site is also a failure.** If a source is down, readers must still see the last good data, and be
  told it is old.
- **Vercel Hobby**: one cron run per day per path, 60 s per function, no background workers, no queue.
- **One maintainer, volunteer contributors.** Anything that needs an operator on call will not be operated.

Six collectors in, the question is whether they share a shape or each becomes its own special case.

## Decision

Every source goes through the same four-part shape, and nothing else is added to carry data:

1. **A pure parser in `pipeline/<source>.mjs`** — no database, no network in the parsing functions — plus a
   `SOURCE` descriptor and a `validate…()` that returns a *list of problems*, never a boolean.
2. **An all-or-nothing load in `src/server/ingest.ts`.** If `validate…()` returns anything, the job throws
   before touching the database. A failed job leaves the previous rows in place, marks the source `stale`
   (`error` only if it has never succeeded), and writes the reason to `update_log` and the Data sources page.
3. **A per-source rate limit claimed atomically in SQL** (`claimRun`), so the jobs are safe to expose
   publicly: they read only public data, anyone may trigger a refresh, and nobody can use DrukView to hammer a
   government server. `CRON_SECRET` lifts the interval; it is not an authentication boundary.
4. **A 50 s deadline** (`JOB_DEADLINE_MS`) inside the platform's 60 s, so a slow source is recorded as slow
   rather than killed silently.

Alongside that, large published tables that change once a year (census, 566 schools, 310 health facilities,
the whole FY budget down to 205 gewogs) are **bundled cited JSON** in `data/reference/`, checked against the
publication's own totals by `tests/reference.test.ts`, and listed in `STATIC_MODULES` so those pages render
with no database at all.

Schema is hand-written, append-only SQL in `db/migrations.ts`, applied under a Postgres advisory lock on the
first request (`src/server/setup.ts`), so a fresh deployment needs exactly one setting: `DATABASE_URL`.

## Options Considered

### Option A: shared shape — pure parser + all-or-nothing load + SQL rate limit (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Low: ~150 lines per collector, no framework |
| Cost | Zero beyond the database |
| Scalability | Fine: tens of sources, thousands of rows, one request each |
| Team familiarity | High — plain `fetch`, plain SQL |

**Pros:** every source fails the same way, so the failure is already designed; the parser is testable against a
captured fixture with no database; a contributor can add a source by copying one file; the public pages survive
the database being down entirely.
**Cons:** no partial refresh (one bad row rejects a whole batch, by design); regex parsers are ugly; "stale"
only tells the reader data is old, not how old the *source* is.

### Option B: a pipeline framework / queue (Airflow, Inngest, Trigger.dev, or a worker + Redis)

| Dimension | Assessment |
|---|---|
| Complexity | High: a second runtime to deploy and monitor |
| Cost | A paid tier for a site that refreshes six sources a day |
| Scalability | Far beyond anything needed |
| Team familiarity | Low |

**Pros:** retries, backfills, DAGs, per-step observability.
**Cons:** the operational burden lands on one volunteer maintainer; most of its value (fan-out, dependencies,
long jobs) does not exist here — the jobs are independent and finish in seconds.

### Option C: an ETL service writing to the database out of band (GitHub Actions → Postgres)

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | Free on public repositories |
| Scalability | Good |
| Team familiarity | Medium |

**Pros:** no serverless time limit, so slower or multi-page scrapes become possible; CI logs are the job logs.
**Cons:** database credentials have to live in CI secrets as well as in Vercel; the "Load / refresh data now"
button on the Data sources page — the thing that makes the site operable by a non-engineer — would have to go
or be reimplemented against the Actions API; two deployment surfaces instead of one.

## Trade-off Analysis

The real trade-off is **partial freshness versus trust**. A framework with retries and per-row error handling
would keep more data flowing when a source is partly broken; all-or-nothing keeps the site honest at the cost
of sometimes showing yesterday's data with a stale badge. For a site whose entire value is that its figures can
be checked, trust wins, and it is also the cheaper option to operate.

The second trade-off is **time limit versus operability**. Option C removes the 60 s ceiling, which the e-GP
scraper (ADR-0002) comes closest to touching. We keep Vercel-only for now because one deployment surface and a
button a journalist can press are worth more than headroom we do not yet need; the escape hatch is to move a
single job to Actions without changing its parser, because the parser knows nothing about where it runs.

## Consequences

**Easier:** adding a source (one file, one `JOBS` entry, one cron line); testing (parsers are pure and run
against captured fixtures); operating (no infrastructure to debug — the Data sources page says what failed and
why); deploying (one environment variable).

**Harder:** anything that needs more than 50 s, or a source that must be read in many pages; partial updates;
per-row provenance beyond the citation columns already carried.

**To revisit:** if a collector starts needing paging beyond ~3 pages, or a source needs a headless browser,
move that one job to Option C rather than reshaping the others. If a third source needs a session cookie,
factor the session handling out of `pipeline/egp.mjs` into `pipeline/lib.mjs`.

## Action Items

1. [x] Keep `validate…()` returning a list of problems, surfaced verbatim on the Data sources page
2. [x] Keep citation columns (`source_name`, `source_url`/`url`, `document`, `page`, `retrieved_on`) on every
       table a job writes
3. [x] Record the shape in `CONTRIBUTING.md` so a new collector arrives in it
4. [ ] Add a "source last changed" signal, so a stale badge can distinguish "we failed" from "nothing new"
