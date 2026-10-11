# Contributing to DrukView

DrukView is open source and open to anyone. It publishes public money, so the bar is not "nice code" — it is
**every figure traceable to a public document**. These rules exist so a reader in any dzongkhag can check us,
and so a reviewer can tell in one minute whether a change is safe to publish.

By contributing you agree your work is released under the repository's [MIT licence](LICENSE), and you follow
the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## The seven data rules

These are not style preferences. A pull request that breaks one of them will be asked for changes, however
good the code is — and most of them are enforced by tests, so CI will tell you first.

1. **Never invent a number.** No samples, no estimates, no placeholders, no "roughly". If a figure is not in
   a public document, it does not ship. Where data is missing the site must say so.
2. **Cite every row.** A publisher, a document title, an `https` URL and — for a PDF — the table or page it
   came from. No citation, no row.
3. **Never mix currencies.** Nu. (government budgets) and US$ (development-partner financing) are never
   added, converted or shown in one total.
4. **Never guess an identity or a place.** A person's name comes only from the body that appointed them. A
   dzongkhag comes from the source's own location field or the procuring agency's own hierarchy — never from a
   place name in a title, where it is usually the subject of the work and not its owner. If two readings are
   possible, publish neither and say it is unresolved.
5. **Reject the batch, not the row.** Loaders are all-or-nothing: if any record in a refresh is invalid,
   nothing loads, the previous good data stays published and the source is marked **stale**. A gap on a
   transparency site is a bug; a wrong figure is a much worse one.
6. **Say what you do not know.** Confidence grades, "not reported", "inferred from text", known quirks in a
   source — they belong on the page, not in a comment. See `data/reference/*.json` `notes` for the pattern.
7. **Keep the date.** Every dataset records when it was published and when we read it, and every module shows
   a "last refreshed" stamp.

---

## Ways to contribute

### 1. Report a wrong number (most valuable, no code needed)

Open a **Data correction** issue. Tell us the page, the figure as shown, the figure you believe is right, and
a link to the public document that proves it. We will not change a figure on the strength of a disagreement —
only on the strength of a document.

### 2. Add or correct curated rows

Some ministries publish only PDFs. Those are transcribed into CSV in `data/manual/`:

| File | What goes in it |
|---|---|
| `budget_by_agency.csv` | ministry / agency budgets by fiscal year |
| `allocations_by_location.csv` | allocations by dzongkhag, gewog or village, with funding source |
| `tenders.csv` | tender notices that are **not** on e-GP (e-GP notices are collected automatically) |
| `offices.csv` | office contacts and leadership |

Every row needs `source_name`, `source_url` (https) and `document`, plus `page` wherever the source is a PDF.
`npm run job -- manual` validates the files locally and prints the row number of anything it rejects.

### 3. Add or correct a reference dataset

Larger transcriptions (a census table, all 566 schools) live in `data/reference/*.json`, ship with the code and
render without a database. A new reference file must:

- carry a `source` block (`publisher`, `title`, `table`, `url`, `checked`) and a `notes` array;
- come with a test in `tests/reference.test.ts` that checks it **against the publication's own totals** — the
  grand total row, the per-dzongkhag totals, the national count. If the publication's own figures do not add
  up, say so in `notes` and allow it explicitly in the test; never silently "fix" a published number;
- keep the source's spelling in `nameInSource` when you correct a garbled name.

### 4. Add a collector

One file in `pipeline/`, exporting a `SOURCE` descriptor, a pure parser, a `validate…()` that returns a list of
problems, and a fetcher. Then wire it into `src/server/ingest.ts` (`JOBS`, `MIN_INTERVAL_MIN`, `fetchAndSave`)
and add a cron entry in `vercel.json`.

- **The parser is the tested part.** Save a real response under `tests/fixtures/` and test against it. If you
  add a row to a fixture by hand, mark it synthetic in a comment. Never let a test fixture become published data.
- **Fail loudly, never partially.** Return problems from `validate…()` and let the job throw; the previous data
  then stays and the source goes stale.
- Respect the sources: identify yourself with the `UA` from `pipeline/lib.mjs`, set a timeout, retry at most a
  couple of times, and stay inside the 50 s job deadline (`JOB_DEADLINE_MS`).
- Do not add a dependency to parse HTML, XML or CSV. The existing collectors do it with regular expressions on
  purpose: a smaller dependency surface on a site that publishes government data is worth some ugliness.

### 5. Code, design and accessibility

Match the surrounding code: server components by default, a client component only where there is interaction,
no CSS framework (plain CSS in `src/app/globals.css`), no state library. Keep pages usable on a phone and on a
slow connection — this site is read in places where both matter.

### 6. Translate

Dzongkha is wired up (`/en/…` locale routes) but not written. We will only ship a translation a native speaker
has reviewed. Open an issue before starting so the work is not duplicated.

---

## Working on it

```bash
npm install
cp .env.example .env.local      # DATABASE_URL optional: most pages render without a database
npm run dev                     # http://localhost:3000
npm run typecheck && npm test   # both must pass before you push
npm run build
```

Database integration tests run only when `TEST_DATABASE_URL` points at a **throwaway** database — the suite
drops and recreates its `public` schema, so never point it at anything you care about.

Migrations are append-only SQL in `db/migrations.ts`. Add a new numbered entry; never edit one that has
shipped, because it has already run on live databases. Write them so they are safe on a database that already
holds rows (`ADD COLUMN … DEFAULT`, not a rewrite).

## Pull requests

- Branch from `main`, one concern per pull request.
- Say what source you used and how you verified it. For a data change, link the document and name the table or
  page. For a parser, say which fixture it was tested against.
- `npm run typecheck`, `npm test` and `npm run build` must pass. CI runs all three on every push.
- Add the test with the change, not after it. A data file with no check against its publication's totals is
  not finished.
- Commits in the imperative mood ("Add the e-GP tender collector"), explaining *why* where it is not obvious.
- Review is about the data first and the code second. Expect to be asked for the document.

## Security and private data

Report a vulnerability privately — see [SECURITY.md](SECURITY.md). Never open a public issue for one, and never
put a secret (a `CRON_SECRET`, a database URL, a token) in an issue, a pull request or a commit. DrukView
publishes institutional information only: budgets, projects, tenders, and office-holders in their official
capacity. Do not add personal data about private individuals — home addresses, personal phone numbers,
identity numbers, photographs — even from a public page.
