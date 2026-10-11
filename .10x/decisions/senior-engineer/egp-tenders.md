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

## Correction, same day — the first collector fetched nothing

The original implementation posted the tender page's own form back to it and read a `<table id="resultTable">`.
Neither is right: the rows come from `POST /TenderDetailsServlet` (`funName=AllTenders`, with `0` rather than
`""` for `departmentId`/`district`/`procMethod`/`tenderId`), and the response is a bare run of `<tr>` rows with
no table wrapper. The first production run failed with "no readable rows".

The code was not the root cause. The root cause was testing the parser against **a fixture written to match an
assumption**: it encoded the guessed shape, so it passed while the collector could not have worked. Two rules
now hold here:

1. **A fixture must be a capture.** If the request cannot be made from this environment, the collector is not
   finished. (A Vercel Sandbox has outbound network and can make it — that is how the real request was found.)
2. **An empty state must say which kind of empty it is.** The Tenders page showed "e-GP lists only live
   tenders, so nothing here" while the truth was "we failed to read e-GP" — a false explanation for our own
   bug, on a transparency site. It now reads `sourceHealth('egp')` and says which.

Also corrected: notices cite their own e-GP page (`ViewNotice.jsp?id=…`, no session needed — the earlier probe
used the wrong parameter name), and `viewType` decides everything (`Live` = 11 pages/203 open notices; empty =
731 pages of history; `Archive` 685; `Cancelled` 37). The job now reads the whole live register, 13 s.

## Verification performed

- `tests/egp.test.ts` — 7 tests over the captured response: the real date format and four rejections; the real
  three-column-pair row; empty/absent table returns `[]` rather than guessing; dzongkhag claimed for a
  dzongkhag-administration notice, not claimed when the hierarchy names two, never taken from the title; six
  validation failures each produce the right message.
- Migration `0004` applied **incrementally** to a database already at `0003` (not just a fresh one), confirming
  `ADD COLUMN … DEFAULT` is safe on existing rows.
- `saveEgpTenders` run end-to-end against a local stub serving the fixture: session cookie sent on the POST,
  3 rows written, `getTenders` ordering correct, page 2 empty ⇒ loop stops.
- **Live run through a Vercel Sandbox against egp.gov.bt: 11 pages, 203 notices, 0 validation errors, 12.9 s;
  129 placed in a dzongkhag, 74 national; all 203 open; 21 carrying amendments.** This is the check that was
  missing the first time.
- Page rendered (`/en/bhutan/tenders`, `/en/trashigang/tenders`): values read "not published", dzongkhag
  scoping works, caveats visible on the page.
- `npm run typecheck`, `npm test` (59 tests, DB tests included), `npm run build` all pass.

## Known limits (documented on the site, not hidden)

The live register only, so a notice drops out once it closes; no estimated value; Archive (685 pages),
Cancelled (37) and Contract-award views unread; page size fixed at 20 because the servlet drops larger ones;
a ministry's notice is national even where the work is plainly in one dzongkhag. The POST field names are the
portal's internals and remain the thing most likely to break.
