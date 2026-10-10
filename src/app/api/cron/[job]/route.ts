import { timingSafeEqual } from 'node:crypto';
import { JOBS, runJob, type JobName } from '@/server/ingest';
import { migrate } from '../../../../../scripts/migrate';
import { seed } from '../../../../../scripts/seed';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // secure default: no secret configured → endpoint disabled
  const got = Buffer.from(req.headers.get('authorization') ?? ''), want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  if (!authorised(req)) return Response.json({ error: 'unauthorised' }, { status: 401 });
  if (job === 'setup') { // one-time, idempotent: create tables + seed the 20 dzongkhags
    try { const applied = await migrate(); const dzongkhags = await seed(); return Response.json({ job, status: 'ok', applied, dzongkhags }); }
    catch (e) { return Response.json({ job, status: 'error', message: String((e as Error).message).slice(0, 500) }, { status: 500 }); }
  }
  if (!(JOBS as readonly string[]).includes(job)) return Response.json({ error: 'unknown job' }, { status: 404 });
  const r = await runJob(job as JobName);
  return Response.json(r, { status: r.status === 'ok' ? 200 : 502 });
}
