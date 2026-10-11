# egp-tenders — architecture

See [ADR-0002](../../../docs/adr/0002-egp-tender-collection.md) for the full record (context, four options,
trade-off analysis, consequences).

**Decision in one line:** read Bhutan's e-GP tender list the way a browser does (session cookie → POST the
portal's own search form → parse `<table id="resultTable">`), because e-GP publishes no API and the alternative
was an empty module.

**Load-bearing constraints**
- No estimated value is published by e-GP, so none is shown.
- A dzongkhag is claimed only when the procuring agency's hierarchy names exactly one — never from a title.
- Notices cite the public tender list, not the detail page, which needs a session of the reader's own.
- All-or-nothing: unreadable table ⇒ failed run ⇒ previous notices kept ⇒ source stale, with the reason shown.

**Boundary this creates:** `tenders` now has two writers. Any writer must tag `source` and delete only its own
rows. `0004_tenders_egp.sql` adds that column with a default, so it is safe on a database that already holds
curated rows.

**Next architectural decision point:** the Notification-of-Contract-Award list. A second parser on the same
session, and probably where paging pushes the job past the 50 s serverless deadline — at which point move this
one job to GitHub Actions (ADR-0001, Option C) rather than reshaping the other five collectors.
