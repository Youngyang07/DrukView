# DevOps decisions

| Feature | Status |
|---|---|
| [publish-readiness](publish-readiness.md) | Shipped (two items open, listed there) |

## Cross-cutting principles

- **One deployment surface.** Vercel + a Postgres database; one required setting (`DATABASE_URL`). Schema is
  applied by the app itself under an advisory lock on the first request, so a deploy needs no operator step.
- **The jobs are public by design.** They read only public data, so anyone may trigger a refresh; abuse is
  bounded by an atomic per-source SQL rate-limit claim, not by a secret. `CRON_SECRET` only lifts the interval.
- **Every job records why it failed, in the product.** The Data sources page is the monitoring dashboard a
  non-engineer can read; `update_log` is the history.
- **CI gates what review keeps catching**, not everything imaginable: typecheck, tests, a real production
  build, an uncited-CSV-row check and a committed-secret check.
- **Boring and operable by one volunteer.** No queue, no container orchestration, no second runtime.
