# ADR-0002: Collect e-GP tenders by reading the portal's own search page

**Status:** Accepted
**Date:** 2026-10-11
**Deciders:** repository maintainers

## Context

The Tenders module shipped empty. It read only `data/manual/tenders.csv`, and the README listed the gap:
"automated collection from Bhutan's e-GP portal is not built (source not yet verified)". Procurement is where
public money becomes a contract, so an empty tenders page is the weakest part of the site.

What the portal actually offers, checked against the live site on 2026-10-11:

- `https://www.egp.gov.bt/` (e-GP 3.3.6, PMDD / Department of Procurement and Properties, Ministry of Finance)
  publishes **no API, no feed, no CSV, no export**. The "Tender", "Annual Procurement Plan" and "Contract"
  pages are JSP.
- `GET /resources/common/AdvTenderListing.jsp?h=t` returns the search page with an **empty**
  `<table id="resultTable">`; the browser then posts the page's own form back to it and the rows appear.
- `GET /resources/common/TenderListing.jsp?h=t` returns a page with an empty body before scripts run.
- `/resources/common/ViewTenderNotice.jsp?tenderId=<n>` exists but a cold request is bounced to
  `SessionTimedOut.jsp` — detail pages live inside a session of the reader's own.
- The list carries: tender ID, reference number, amendment count, procurement category, title, the procuring
  agency's hierarchy node, type and method, publishing and closing date/time. It carries **no value**, and it
  lists **live** tenders only.

## Decision

Add `pipeline/egp.mjs`, a sixth collector in the shape of ADR-0001, that does what a browser does: `GET` the
search page to take a `JSESSIONID`, then `POST` the search form (up to 3 pages of 20) with that cookie, and
read the rows out of `<table id="resultTable">` with no HTML dependency. It writes `tenders` rows tagged
`source = 'egp'`; the curated CSV job now deletes only its own rows, so the two sources coexist.

Four honesty constraints are part of the decision, not details:

- **No value is shown** for an e-GP notice, because e-GP publishes none. The column reads "not published".
- **A notice is placed in a dzongkhag only when the procuring agency's own hierarchy names exactly one.**
  Never from the title: "farm road at Kanglung" names where the work is, not who is buying. Two names in one
  hierarchy stays national rather than picking one.
- **Each notice cites the public tender list** and carries its e-GP tender ID and reference number, because the
  detail page would be a dead link for a reader without a session.
- **All-or-nothing.** A page with no readable row, a non-numeric tender ID, an unparseable date, a closing date
  before the publishing date, or a duplicate fails the whole run: the previous notices stay published and the
  source goes stale. A redesign at e-GP therefore shows up as a stale source, never as invented notices.

## Options Considered

### Option A: HTTP session + POST the search form, parse the table (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Low — one file, plain `fetch`, no new dependency |
| Cost | Zero |
| Scalability | Three requests a day |
| Team familiarity | High; same shape as the other five collectors |

**Pros:** runs inside the existing 50 s serverless job; the parser is pure and tested against a captured
response, so the fragile part is the part under test; fails loudly and safely.
**Cons:** it is a scraper — any change to that table breaks it (visibly, as a stale source); the search form's
field names are the portal's internals; session handling is extra code the other collectors do not have.

### Option B: headless browser (Playwright) against the rendered page

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Cost | A paid runtime; a Chromium binary does not fit a Hobby function |
| Scalability | Poor for the money |
| Team familiarity | Medium |

**Pros:** survives more front-end change; could click the Archive, Cancelled and Contract-award tabs.
**Cons:** cannot run where this site runs; a browser is also harder to make honest — it is easy to end up
scraping whatever happens to render rather than a table whose shape you have asserted.

### Option C: a third-party scraping API for Bhutan e-GP

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Cost | Per-record pricing, ongoing |
| Scalability | Good |
| Team familiarity | n/a |

**Pros:** no scraper to maintain.
**Cons:** puts a paid intermediary between a transparency site and its government's own publication, and makes
the citation chain "a vendor told us" instead of "the portal says". Fails rule 2 of CONTRIBUTING.md in spirit.

### Option D: keep it manual (curated CSV only)

**Pros:** nothing can break.
**Cons:** it has already been the status quo and the module has stayed empty. Tenders close in weeks; a
transcription workflow cannot keep up with them.

## Trade-off Analysis

The honest comparison is **a fragile scraper that fails visibly** against **no data at all**. Scraping is the
weakest kind of integration, and normally the answer would be to wait for an API — but e-GP's list is the
Royal Government's own publication of these notices, and there is no API to wait for. Making the failure mode
safe (stale source, previous notices kept, loud reason on the Data sources page) converts the fragility from a
correctness risk into a maintenance cost, which is the trade we are willing to make. Option C would be cheaper
to maintain and is rejected on provenance grounds, not technical ones.

## Consequences

**Easier:** the Tenders module is useful on day one; open notices are listed with the soonest closing date
first; a reader can take an e-GP tender ID straight to the portal.

**Harder:** one more thing that can break when a government site is redesigned — it will need re-capturing the
fixture and adjusting the parser. The `tenders` table now has two writers, so any future writer must tag its
`source` and delete only its own rows.

**Known limits, documented on the site and in the README:** live tenders only (a closed notice leaves the
portal, and so leaves DrukView — there is no archive); no estimated value; Archive, Cancelled and
Contract-award tabs are not read; a notice whose agency hierarchy names two dzongkhags shows as national.

**To revisit:** if e-GP ever publishes a feed or an API, delete the scraper. If the Contract-award tab is worth
reading (it is — awards are the other half of procurement), it is a second parser against the same session, and
likely the point at which paging pushes the job past 50 s and towards ADR-0001's Option C.

## Action Items

1. [x] `pipeline/egp.mjs` with a pure parser, `validateTenders()`, and a session fetcher
2. [x] `tests/egp.test.ts` against a captured response (`tests/fixtures/egp-tender-listing.html`)
3. [x] Migration `0004_tenders_egp.sql`: `source`, `tender_id`, `reference`, `hierarchy`, `proc_type`,
       `method`, `amendments`; curated job scoped to its own rows
4. [x] Daily cron `/api/cron/tenders`, 3 h minimum interval; e-GP documented on the Data sources page
5. [ ] Read the Notification-of-Contract-Award list, so awards can be matched to notices
6. [ ] Alert the maintainer when `egp` has been stale for more than 3 days (the whole point is that a break is
       visible, which currently requires someone to look)
