## What this changes

<!-- One or two sentences. One concern per pull request. -->

## Source and verification

<!-- Required for any change that touches published data. -->

- Publisher and document:
- Link (https):
- Table / annexure / page:
- How I checked it: <!-- e.g. "row totals match the Grand Total on p.61"; "parser tested against tests/fixtures/…" -->

## Checklist

- [ ] `npm run typecheck`, `npm test` and `npm run build` all pass locally
- [ ] Every new or changed data row cites a public document (publisher, https URL, table/page)
- [ ] Nu. and US$ are not mixed, added or converted anywhere in this change
- [ ] A new or changed dataset is checked **against the publication's own totals** in a test
- [ ] A loader change is still all-or-nothing: an invalid record loads nothing and marks the source stale
- [ ] No invented, estimated or placeholder values; missing data is shown as missing
- [ ] No secrets, and no personal data about private individuals
- [ ] A new migration is appended (never edited) and is safe on a database that already holds rows

## Anything a reviewer should know

<!-- Known gaps, a quirk in the source, a decision you want challenged. -->
