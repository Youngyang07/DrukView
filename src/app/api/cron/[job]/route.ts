import { timingSafeEqual } from 'node:crypto';
import { dbReady, dbStatus } from '@/server/db';
import { JOBS, runJob, type JobName } from '@/server/ingest';
import { ensureSchema, lastSetupError } from '@/server/setup';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** A valid CRON_SECRET only lifts the rate limit; without it the (public-data) jobs still run, at most once per interval. */
function hasSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get('authorization') ?? ''), want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  if (job !== 'setup' && !(JOBS as readonly string[]).includes(job)) return Response.json({ error: 'unknown job', jobs: ['setup', ...JOBS] }, { status: 404 });
  if (!(await dbReady())) {
    const st = await dbStatus();
    const message = st === 'no-url' ? 'DATABASE_URL is not set in the hosting environment variables.'
      : st === 'unreachable' ? 'The database cannot be reached; check DATABASE_URL.'
      : `Automatic database setup failed: ${lastSetupError ?? 'unknown error'}`;
    return Response.json({ job, status: 'error', message }, { status: 503 });
  }
  if (job === 'setup') { // kept for compatibility: setup now also happens automatically on first visit
    try { return Response.json({ job, status: 'ok', ...(await ensureSchema()) }); }
    catch (e) { return Response.json({ job, status: 'error', message: String((e as Error).message).slice(0, 500) }, { status: 500 }); }
  }
  const r = await runJob(job as JobName, { force: hasSecret(req) });
  if (r.status === 'skipped') return Response.json(r, { status: 429, headers: { 'retry-after': String(r.retry_after_s ?? 60) } });
  return Response.json(r, { status: r.status === 'ok' ? 200 : 502 });
}
