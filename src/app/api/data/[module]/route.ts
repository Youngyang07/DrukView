import { toCsv } from '@/lib/csv';
import * as q from '@/server/queries';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ module: string }> }) {
  const { module } = await params; const u = new URL(req.url); const g = (k: string) => u.searchParams.get(k)?.slice(0, 120) || undefined;
  if (!(await q.dbReady())) return Response.json({ error: 'database unavailable' }, { status: 503 });
  if (module === 'map') return Response.json({ generated_at: (await q.freshness()).projects, dzongkhags: await q.mapMetrics() });
  if (module === 'projects') {
    const slug = g('scope'); const dz = slug ? await q.getDzBySlug(slug) : null;
    if (slug && !dz) return Response.json({ error: 'unknown dzongkhag' }, { status: 404 });
    const { rows, total } = await q.listProjects(dz?.id ?? null, { funder: g('funder'), status: g('status'), sector: g('sector'), q: g('q') }, 5000);
    if (g('format') === 'csv') {
      const csv = toCsv(['id', 'title', 'funder', 'status', 'sector', 'where', 'amount_committed', 'amount_disbursed', 'currency', 'start_date', 'end_date', 'implementing_agency', 'url'],
        rows.map(p => [p.id, p.title, p.funder, p.status, p.sector, p.where.join('; '), p.amount_committed, p.amount_disbursed, p.currency, p.start_date, p.end_date, p.implementing_agency, p.url]));
      return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="drukview-projects.csv"' } });
    }
    return Response.json({ total, projects: rows });
  }
  return Response.json({ error: 'unknown module', modules: ['map', 'projects'] }, { status: 404 });
}
