# open-source-governance — contribution rules

**Files:** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/*`,
`.github/pull_request_template.md`, `.github/dependabot.yml`, `src/app/[locale]/contribute/page.tsx`, README.

**Decision:** write the contribution rules around the *data*, not the code. The seven data rules (never invent
a number; cite every row; never mix Nu. and US$; never guess an identity or a place; reject the batch, not the
row; say what you do not know; keep the date) are the review criteria, and most of them already have teeth:
`tests/reference.test.ts` checks each dataset against its publication's own totals, the loaders are
all-or-nothing, and CI now also checks that every curated CSV row cites an `https` document and that no secret
is committed.

**Why templates are forms, not prose:** the single most valuable contribution is "this figure is wrong, here is
the document". The data-correction issue form makes the document link a required field, so the most useful
report cannot be filed in an unusable shape.

**Also decided**
- The PR template's checklist is the data rules restated as checkboxes — a reviewer should be able to reject in
  one pass without re-deriving them.
- Security reports go to a private advisory, never a public issue; a wrong number is explicitly *not* a
  security issue, so the two channels do not get confused.
- No personal data about private individuals, even from a public page. Office-holders in their official
  capacity only.
