import { classify, OVERDUE_AFTER_H, readSourceAges } from '@/server/alerts';
import { dbReady, freshness } from '@/server/queries';
export const dynamic = 'force-dynamic';

/**
 * The machine-readable status of the site, meant to be watched by an external uptime monitor — that is the
 * alert channel that still works when this app's own cron has stopped firing, which is the case nothing
 * inside the app can report on. 503 therefore means either the database is unreachable OR a source has not
 * refreshed within STALE_ALERT_HOURS (72 h by default); `degraded` says which.
 */
export async function GET() {
  const ok = await dbReady();
  const overdue = ok ? classify(await readSourceAges()).overdue : [];
  const healthy = ok && overdue.length === 0;
  return Response.json({
    ok: healthy,
    db: ok,
    degraded: !ok ? 'database' : overdue.length ? 'stale-sources' : null,
    overdue_after_hours: OVERDUE_AFTER_H(),
    overdue: overdue.map(s => ({ id: s.id, hours_late: s.hours === null ? null : Math.round(s.hours), status: s.status, last_success: s.last_success })),
    freshness: ok ? await freshness() : null,
  }, { status: healthy ? 200 : 503 });
}
