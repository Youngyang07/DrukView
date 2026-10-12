# ADR-0002: Collect e-GP tenders by reading the portal's own search page

**Status:** Accepted, amended 2026-10-11 (see **Correction** below — the request in the original decision was
wrong and fetched nothing)
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

> **Superseded in part.** The mechanism in this section is wrong — posting the search page to itself returns
> no rows, and the response carries no `<table>` wrapper. Read the **Correction** at the end for the request
> the portal actually serves. The four constraints below, and the options analysis, still stand.

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

---

## Correction (same day)

**The request described above was wrong, and the collector it produced fetched nothing.** The first
production run failed with *"the tender list came back with no readable rows"*. The error was in this record,
not only in the code: the GET behaviour and the detail-page session behaviour had been checked against the
live portal, but the claim that posting the search form returns the rows was an **inference presented as a
verification**. It was never tested, because this session had no outbound network and the tooling at hand
could only issue GETs.

What the portal actually does, captured through a sandbox with network access:

```
GET  /resources/common/AdvTenderListing.jsp?h=t      → JSESSIONID; the table is empty
POST /TenderDetailsServlet                           → funName=AllTenders + the search form's fields
                                                       (0, not "", for departmentId/district/procMethod/tenderId)
                                                     → a bare run of <tr> rows, no <table> wrapper,
                                                       then <input id="cntTenBrief"> and <input id="totalPages">
```

Three further claims in the original record were also wrong:

| Claimed | Actual |
|---|---|
| Detail pages need a session, so rows must cite the search page | `ViewNotice.jsp?id=<id>&h=t` opens with **no session**. The earlier probe used `tenderId=`, the wrong parameter. Every row now cites its own notice. |
| e-GP "lists live tenders only" | Depends entirely on `viewType`. `Live` is 11 pages / 203 open notices; unfiltered is 731 pages of history including Cancelled; `Archive` 685; `Cancelled` 37. |
| The parser was "the tested part" | It was tested against a fixture **written by hand to match the guessed shape** — a full `<table id="resultTable">`. The real response is a bare row run, so the parser would have returned nothing even from a good response. A fixture that is not a capture tests the author's assumptions, not the source. |

### What changed in the decision

The collector now reads **all 11 pages of the live register** (about 13 s), not a slice: holding every tender
out to bid is the useful thing, and it fits the job deadline. `size` above 20 makes the servlet drop the
connection, so the page size stays at 20. A row keeps e-GP's own status word verbatim, and claims no status
where an amendment notice occupies that cell. Validation now also rejects any citation that is not an
`egp.gov.bt` URL.

### What this cost, and the rule it earns

For one day the live site showed an empty Tenders page under the sentence *"e-GP lists only tenders that are
currently live, so a dzongkhag with nothing out to bid shows nothing here"* — a false explanation for our own
failure, on a site whose purpose is to be checkable. The all-or-nothing guard worked exactly as designed and
still did not help, because the failure was not in the data: it was in what the page said about missing data.

Two rules follow, and both are now in the code:

1. **A fixture must be a capture.** If the request cannot be made, the collector is not finished — do not
   write a fixture to match an assumption and call the parser tested. `tests/fixtures/egp-tender-rows-real.html`
   is portal output; the handful of cases it does not contain live in a separate file marked synthetic.
2. **An empty state must distinguish "nothing to report" from "we could not read it."** The Tenders page now
   checks the source's own health and says which it is. Any module that can render empty needs the same.

### What these failure modes are called

Both rules above were learned the expensive way, and both have standard names. They are recorded here so that
a contributor who hits one of them can look it up, and so that a reviewer has a word for it rather than having
to re-derive the argument.

**1. The test whose oracle is its own author.**

A test needs an *oracle* — an independent statement of what the right answer is. In both of this ADR's
failures the oracle was the author:

- A **tautological test** (also *self-fulfilling test*, or *"testing the mock"*): the assertion restates the
  implementation instead of checking it against anything outside the code. The first e-GP collector is the
  textbook case. The fixture was drawn to match the guessed HTML, the parser was written to read that fixture,
  the two agreed with each other and neither agreed with e-GP. Green suite, zero rows.
- A **change-detector test** is the same defect seen from the other side: it fails when the code changes
  rather than when the behaviour breaks.
- Both are **weak-oracle** failures, from the **test-oracle problem**. The classical statement of the limit is
  Dijkstra's: testing shows the presence of bugs, never their absence.
- The practice that prevents the fixture version is **record-and-replay** — *golden capture*, VCR-style
  cassettes, or **contract testing** against the real provider. Hence the rule: a fixture is a recording, not
  a drawing.
- The empty-state version — the copy read "has been collected yet" with the negation missing, and the test
  asserted that exact broken string — is an **expected-value bug**, or **copy-paste oracle**: the expected
  value was taken from the output instead of derived from the requirement. The counter-practice is to assert
  the *property* (the negation is present) rather than the author's string, which is what
  `tests/empty-states.test.ts` now does.

**2. What the reader saw on the Tenders page.**

The collector returned nothing and the page stated as fact that Bhutan had no open tenders, while 203 were
out to bid:

- **Silent failure** / **error swallowing** — an empty result was accepted as a valid answer.
- Precisely: the page **failed open** instead of **failing closed**. On an unknown state it asserted a fact
  rather than declining to. In reliability terms it broke **fail-safe defaults**; in data terms it is an
  **absence-vs-null conflation**, rendering "we hold no rows" as "there are no rows" — the exact confusion
  that `NULL` exists to keep separate from `0`.
- The result is a **false negative delivered with full confidence**, which on a site whose purpose is to be
  checkable is the worst available outcome: it is indistinguishable from data.

**3. Why the suite did not catch either.**

The broken sentence was caught by rendering the page and reading it, not by the tests. That is a **missing
end-to-end (or snapshot) check over rendered output**: the suite asserted structure, never the text a reader
would actually see. The operating rule: anything a reader will read has to be checked by looking at the
rendered thing.

One sentence for the whole episode, for anyone reviewing a change to a collector or an empty state: **a test
whose oracle is the author's assumption, shipped behind a UI that fails open.**

### Action items

1. [x] Collector rewritten against the observed request; verified live (203 notices, 0 validation errors)
2. [x] Fixture replaced with a real capture; synthetic cases separated and labelled
3. [x] Per-notice citation URLs, enforced by validation
4. [x] Tenders page distinguishes a collector failure from a genuinely empty register
5. [x] Audit the other modules' empty states for the same false-explanation problem — done in
       [#22](https://github.com/Youngyang07/DrukView/pull/22),
       which found the same mistake in Overview, Projects, Funders and Weather and moved all of them onto
       one `<EmptyOr>` helper
6. [ ] Alert when `egp` has been stale for more than 3 days — a scraper that silently stops is the failure
       mode this ADR has now demonstrated twice
