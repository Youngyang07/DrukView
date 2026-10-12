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
  against it. There is one helper for this — `<EmptyOr>` in `components/ui` — which takes the health of every
  source behind the section and otherwise names the gap; a module fed by two collectors cannot claim an
  absence until both have run. A new module that can render empty uses it rather than writing its own wording.
  A filtered list is a third case: "no match for these filters" says nothing about the data and must not
  borrow either message.
- **A collector that stops is not the same bug as a collector that fails, and only the second one reports
  itself.** `status='stale'` is written by a job that ran; a scheduler that stops firing leaves every source
  `ok` while the data ages. So staleness is measured as the **age of the last success**, independent of status
  (`src/server/alerts.ts`), and an alerting channel that lives inside the app can never report that the app's
  own scheduler is dead — hence `/api/health` answering 503 for an outside monitor as well as the webhook.
  Alert state (`alerted_at`) advances only on actual delivery: a record saying an outage was reported when it
  was not is the same mistake as a fixture that agrees with its author.
- `validate…()` returns a list of problems, never a boolean — the problems are shown to the reader verbatim.
- No dependency for parsing HTML/XML/CSV. Smaller dependency surface beats prettier code on a site that
  publishes government data.
- Configuration overrides (`EGP_BASE`, `PARLIAMENT_API`, …) must never be able to change a **published
  citation**: citation URLs are pinned to the real publisher.
- Migrations are append-only and must be safe on a database that already holds rows.
