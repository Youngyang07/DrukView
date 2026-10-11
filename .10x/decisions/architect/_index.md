# Architecture decisions

Full records live in `docs/adr/` (they are part of the published repository, not just team state).

| Feature | ADR | Status |
|---|---|---|
| collector-architecture | [ADR-0001](../../../docs/adr/0001-collector-architecture.md) | Accepted |
| egp-tenders | [ADR-0002](../../../docs/adr/0002-egp-tender-collection.md) | Accepted |

## Cross-cutting principles

1. A wrong figure is worse than a missing one; a blank site is also a failure. Hence: all-or-nothing loads,
   previous data kept, source marked stale, reason shown to the reader.
2. Every source has the same four-part shape (pure parser → `validate…()` returning problems → atomic SQL
   rate-limit claim → 50 s deadline). No source gets a bespoke pipeline.
3. Published tables that change yearly ship as cited JSON in `data/reference/`, so the public pages survive the
   database being unavailable.
4. One deployment surface (Vercel + Postgres) and one required setting (`DATABASE_URL`). Operability by a
   non-engineer outranks headroom we do not need.
5. Citations are columns, not comments: `source_name`, `source_url`, `document`, `page`, `retrieved_on`.
