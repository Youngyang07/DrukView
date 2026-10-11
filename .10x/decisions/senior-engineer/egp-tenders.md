# egp-tenders — implementation

**Files:** `pipeline/egp.mjs`, `src/server/ingest.ts` (`saveEgpTenders`, `JOBS`, `MIN_INTERVAL_MIN`,
`fetchAndSave`), `src/server/queries.ts` (`getTenders`, `freshness`), `src/components/ModuleView.tsx`
(`Tenders`), `db/migrations.ts` (`0004_tenders_egp.sql`), `vercel.json`, `tests/egp.test.ts`,
`tests/fixtures/egp-tender-listing.html`.

## Decisions made while building

- **Parse with regular expressions, not a DOM library.** `parseTenderRows()` returns raw cell text only and
  does no interpretation, so a change in the portal's wording cannot quietly become a wrong record.
- **`egpDate()` accepts only e-GP's own `26-Oct-2026` form** and returns `null` for anything else, including
  ISO. A date we cannot read fails the run rather than becoming `null` in a published row.
- **`PUBLIC_LISTING_URL` is a constant on the real portal, not derived from `EGP_BASE`.** A staging override
  must not be able to publish itself as a citation. (Caught by running the job against a local stub: the
  citation came out pointing at `127.0.0.1`.)
- **Ordering is by "still open, soonest closing first", then newest published** — a reader's question about a
  tender is almost always "can I still bid?".
- **`amendments` is surfaced** ("1 amendment issued") because e-GP flags corrigenda in red on its own list and
  a bidder reading a notice without that is being misled by omission.
- **Hierarchy: `Root` is dropped** (a tree artefact, not an agency); `agency` is the most specific node; the
  whole path is kept in `hierarchy` for the dzongkhag match and for display later.

## Verification performed

- `tests/egp.test.ts` — 5 tests over the captured response: the real date format and four rejections; the real
  three-column-pair row; empty/absent table returns `[]` rather than guessing; dzongkhag claimed for a
  dzongkhag-administration notice, not claimed when the hierarchy names two, never taken from the title; six
  validation failures each produce the right message.
- Migration `0004` applied **incrementally** to a database already at `0003` (not just a fresh one), confirming
  `ADD COLUMN … DEFAULT` is safe on existing rows.
- `saveEgpTenders` run end-to-end against a local stub serving the fixture: session cookie sent on the POST,
  3 rows written, `getTenders` ordering correct, page 2 empty ⇒ loop stops.
- Page rendered (`/en/bhutan/tenders`, `/en/trashigang/tenders`): values read "not published", dzongkhag
  scoping works, caveats visible on the page.
- `npm run typecheck`, `npm test` (59 tests, DB tests included), `npm run build` all pass.

## Known limits (documented on the site, not hidden)

Live tenders only; no estimated value; Archive/Cancelled/Contract-award tabs unread; 3 pages × 20 maximum per
run; the POST field names are the portal's internals and are the thing most likely to break.
