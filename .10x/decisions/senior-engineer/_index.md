# Senior-engineer decisions

| Feature | Status |
|---|---|
| [egp-tenders](egp-tenders.md) | Shipped |
| [open-source-governance](open-source-governance.md) | Shipped |

## Cross-cutting engineering principles

- The fragile part must be the tested part. For a scraper that means a pure parser and a **captured** response
  under `tests/fixtures/`; a fixture row added by hand is marked synthetic so it can never read as real data.
- `validate…()` returns a list of problems, never a boolean — the problems are shown to the reader verbatim.
- No dependency for parsing HTML/XML/CSV. Smaller dependency surface beats prettier code on a site that
  publishes government data.
- Configuration overrides (`EGP_BASE`, `PARLIAMENT_API`, …) must never be able to change a **published
  citation**: citation URLs are pinned to the real publisher.
- Migrations are append-only and must be safe on a database that already holds rows.
