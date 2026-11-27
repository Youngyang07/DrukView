# ADR-0003: Live vacancy collectors: BLMIS counts and the RCSC civil-service list

**Status:** Accepted
**Date:** 2026-11-27
**Deciders:** repository maintainers
**Builds on:** ADR-0001 (collector shape), ADR-0002 (a fixture must be a capture; render and read the page)

## Context

Industry & jobs showed a hand-read snapshot of the national job portal (762 listings on 27 November 2026).
A snapshot ages silently, and civil-service vacancies, which the Royal Civil Service Commission posts on a
separate system, were linked but not shown. The previous attempt was blocked on two things: no raw capture
to test a parser against, and an RCSC list that is built in the browser.

Both were unblocked by giving the session's cloud environment network access to the two hosts and
observing the real requests, as ADR-0002 requires.

## What the sources actually do (observed 2026-11-27)

**BLMIS** (`www.blmis.gov.bt`, Ministry of Industry, Commerce and Employment) is a Laravel Livewire page. One
`GET /jobseeker_page/mispage` carries an HTML-escaped `wire:initial-data` attribute whose
`serverMemo.data` holds four "find a job by …" panels: by location (17 rows), by qualification (17), by
occupation (170) and by employer (378). Each row is one representative listing plus `count_no`. The four
panels group the same listings, and each sums to 762.

- The individual listings sit behind a Livewire POST (`/livewire/message/frontpage.jobseeker`). A small
  body got HTTP 405; the real 1.1 MB body got a connection reset. That route was not pursued, so **only
  counts are collected**.
- A plain request works from a datacenter address. The earlier note that BLMIS needed a stealth proxy was
  wrong for this endpoint.
- The server took **19–30 s before its first byte**. The transfer itself is about 0.3 MB compressed. There
  is therefore room for exactly one attempt inside the 50 s job deadline (45 s timeout, no retry).
- Representative rows carry posting dates from 2022 and deadlines years out. The portal does not say how
  long a listing stays up, so the figure is presented as "listed on BLMIS that day", never as "open today".

**Zhiyog** (`jobs.rcsc.gov.bt`, Royal Civil Service Commission) is an ASP.NET page. After a `GET` of
`/Application/Vacancy` for cookies, the page fetches its filter lists from `/AgencyCommon/Get…Data` and then
`POST /Application/GetVacancyAnnouncement`. That returns a JSON array whose rows each repeat
`totaL_ROW_COUNT`. Two details cost a failed attempt each:

- **Blank filters return `[]`, not everything.** The page sends every option of every dropdown as a
  comma-terminated list, and so does the collector. The lists are re-read every run, so an option the
  Commission adds is included rather than silently filtered out.
- **The fields are nested.** jQuery posts `{ Condition: data }`, which it encodes as `Condition[Condition02]=…`.
  Bare `Condition02=…` gets HTTP 500. A test pins this.

Each announcement's own page, `/Application/VacancyDetail/<agencyID>/<recruitmentID>`, opens without
logging in and is what the site's own "detail" button links to, so it is the citation. 16 announcements
(68 posts) were open on the day; reading them takes about 6 s.

## Decision

Two collectors in the ADR-0001 shape, as separate sources (`blmis`, `rcsc`), so that each has its own
staleness and alerting:

| | BLMIS | Zhiyog |
|---|---|---|
| Parser | `parseBlmis(html)` → four breakdowns, same-named groups merged | `parseRcscPage(json)`, `toVacancies(...)` |
| Rejected unless | all four breakdowns sum to the same total; every dzongkhag matches | rows read = the list's own total; each row is dated, cited and has posts; every location flag matches a dzongkhag |
| Stored | `job_portal_counts` (dimension, label, dzongkhag, count) | `civil_service_vacancies` plus one location row per dzongkhag flag |
| Cron | daily 05:17 UTC | daily 05:27 UTC |

What the data must respect:

- **Pay** is the position's monthly pay scale in ngultrum as printed (`pay_currency = 'BTN'`). It is never
  converted or summed. An announcement with no pay scale shows "not printed".
- **Place** comes only from the Commission's location flags, or BLMIS's own dzongkhag panel. It is never
  inferred from a title. An announcement open in nine dzongkhags is listed under each of them and counted
  once nationally.
- **"na"** in the qualification field is the form's blank and is stored as null.

### On the page

A **Vacancies now** card follows Industry & jobs on the national and dzongkhag pages. It holds the
civil-service table and the BLMIS counts. Each half distinguishes three states:

- a fresh read;
- an older read kept because the last refresh failed (it says so, with the date and the error);
- never collected (`EmptyOr`: "a gap in DrukView, not a statement about Bhutan").

Only a fresh read may say "none in this dzongkhag". While BLMIS is healthy, the dated snapshot's charts give
way to the live ones. Its column in the dzongkhag table stays, labelled with its date, because it is a
reference. If BLMIS fails, the snapshot charts come back.

### Fixtures

- `tests/fixtures/rcsc-vacancies-real.json` is the full list response, verbatim.
- `tests/fixtures/blmis-jobseeker-real.html` is a **projection** of the 2.2 MB page, made by
  `scripts/trim-blmis-capture.mjs`. It keeps all four panels and every row, but only the fields the parser
  reads plus ids, re-escaped as the portal escapes them. No value is changed. The parse of the projection
  was checked identical to the parse of the full page, and a test ties it to the hand-read snapshot from the
  same day.

## Consequences

- The vacancy figure now refreshes daily, and a stopped or failing collector shows up through the existing
  staleness alert and `/api/health` (ADR-0002, action 6).
- BLMIS is close to the deadline. If its first byte starts taking more than about 45 s, the job will fail
  every day. That will show as an overdue source, not as wrong numbers.
- Whether either site answers Vercel's network the way it answered this sandbox is **not yet proven**. The
  first production cron run settles it. Check the Data sources page the day after deploying.
- The hand-read notices from companies, UN agencies, NGOs and foundations
  (`data/reference/vacancy-notices.json`) are unchanged and still need re-checking by hand.

## Actions

1. [x] Both collectors, migration `0006_vacancies.sql`, jobs, crons, page, tests (unit + real-database).
2. [ ] After the first production run: confirm both sources read `ok` on the Data sources page.
3. [ ] Revisit BLMIS individual listings only if the Livewire request can be made reliably. Until then,
   counts only.
