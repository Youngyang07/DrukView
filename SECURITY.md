# Security Policy

## Reporting a vulnerability

**Please do not open a public issue.** Report it privately through
[GitHub's private vulnerability reporting](https://github.com/Youngyang07/DrukView/security/advisories/new),
which notifies the maintainers without disclosing anything.

Tell us what you found, how to reproduce it, and what an attacker could do with it. We will acknowledge within
a few days, tell you what we found, and credit you when the fix ships — unless you would rather not be named.

Please do not run load tests, scans or automated exploitation against the live site or against any Royal
Government of Bhutan source. Those sources are public services; the collectors here identify themselves and
rate-limit for that reason.

## What is in scope

The application in this repository and its deployment:

- anything that lets a request write, change or delete published data;
- anything that reads the database beyond what the public pages show;
- injection (SQL, HTML/script, header), path traversal through the module and locale routes, or SSRF through a
  collector's configurable base URL (`EGP_BASE`, `PARLIAMENT_API`, `ADB_IATI_URL`, `KUENSEL_FEED`,
  `BHUTANESE_FEED`);
- a leaked `CRON_SECRET`, `DATABASE_URL` or other credential in the repository, the build output, a log or an
  error page.

**Out of scope:** the government portals DrukView reads (report those to the publisher, not to us); the fact
that the data jobs can be triggered without a secret — that is deliberate, they only read public data and are
rate-limited per source; and missing hardening headers with no demonstrated impact.

## A wrong number is not a security issue

If a published figure is wrong, that is a [data correction](CONTRIBUTING.md#1-report-a-wrong-number-most-valuable-no-code-needed)
— open a normal issue with the document that proves it. It is the most useful report this project receives.

## Secrets

- `CRON_SECRET` only lifts the per-job rate limit; it is not an authentication boundary for reading anything.
- `DATABASE_URL` is the one that matters. If it is ever exposed, rotate the database credentials first and ask
  questions afterwards.
- Never paste a secret into an issue, a pull request, a commit or a chat with an assistant. If one is exposed,
  treat it as burned and rotate it; maintainers will not ask you for one.
