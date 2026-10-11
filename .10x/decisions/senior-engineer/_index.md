# Senior-engineer decisions

| Feature | Status |
|---|---|
| [egp-tenders](egp-tenders.md) | Shipped |
| [open-source-governance](open-source-governance.md) | Shipped |

## Cross-cutting engineering principles

- The fragile part must be the tested part, and **a fixture must be a capture**. A fixture written to match an
  assumption tests the author, not the source: the first e-GP collector passed its tests and fetched nothing,
  because both the parser and the fixture encoded the same wrong guess. If the request cannot be made from
  this environment, the collector is not finished — a Vercel Sandbox has outbound network and can make it.
  Rows added by hand live in a separate file marked synthetic so they can never read as real data.
- **An empty state must distinguish "nothing to report" from "we could not read it."** Saying the first when
  the second is true is a false claim about the subject, and the all-or-nothing loader does not protect
  against it. Read the source's own health and say which.
- `validate…()` returns a list of problems, never a boolean — the problems are shown to the reader verbatim.
- No dependency for parsing HTML/XML/CSV. Smaller dependency surface beats prettier code on a site that
  publishes government data.
- Configuration overrides (`EGP_BASE`, `PARLIAMENT_API`, …) must never be able to change a **published
  citation**: citation URLs are pinned to the real publisher.
- Migrations are append-only and must be safe on a database that already holds rows.
