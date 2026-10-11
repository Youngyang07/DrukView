import { query } from './db';
import { getAllocations, getDzongkhags, mapMetrics, type Alloc } from './queries';
import { budget, health, population, schools } from '@/lib/reference';

export type ExplorerProject = { id: string; title: string; funder: string; status: string; sector: string | null; agency: string | null; committed: number | null; disbursed: number | null; currency: string;
  start: string | null; end: string | null; basis: string; description: string | null; url: string | null };
export type ExplorerDz = { id: string; slug: string; name: string; col: number; row: number; n: number; usd: number; btn: number; projects: ExplorerProject[]; allocations: Alloc[]; usdAll: number; active: number; completed: number;
  pop: number; hospitals: number; beds: number; phc: number; subpost: number; schools: number; mofBudget: number; mofGewogBudget: Record<string, number> };

export async function getExplorerData() {
  const [dz, metrics, allocs] = await Promise.all([getDzongkhags(), mapMetrics(), getAllocations(null)]);
  const projs = await query<any>(`select distinct on (pl.dzongkhag_id, p.id) pl.dzongkhag_id, p.id, p.title, p.funder, p.status, p.sector, p.implementing_agency agency, p.amount_committed::float8 committed,
      p.amount_disbursed::float8 disbursed, p.currency, p.start_date::text "start", p.end_date::text "end", p.geo_confidence basis, left(p.description,400) description, p.url
    from project_locations pl join projects p on p.id=pl.project_id order by pl.dzongkhag_id, p.id`);
  const byDz = new Map<string, ExplorerProject[]>();
  for (const r of projs) { const { dzongkhag_id, ...p } = r; (byDz.get(dzongkhag_id) ?? byDz.set(dzongkhag_id, []).get(dzongkhag_id)!).push(p); }
  const mById = Object.fromEntries(metrics.map(m => [m.id, m]));
  const out: ExplorerDz[] = dz.map(d => {
    const ps = (byDz.get(d.id) ?? []).sort((a, b) => (b.committed ?? -1) - (a.committed ?? -1));
    return { id: d.id, slug: d.slug, name: d.name, col: d.grid_col, row: d.grid_row, n: mById[d.id]?.n ?? 0, usd: mById[d.id]?.usd ?? 0, btn: mById[d.id]?.btn ?? 0,
      projects: ps.slice(0, 40), allocations: allocs.filter(a => a.dzongkhag === d.name),
      usdAll: ps.filter(p => p.currency === 'USD').reduce((s, p) => s + (p.committed ?? 0), 0), active: ps.filter(p => p.status === 'active').length, completed: ps.filter(p => p.status === 'completed').length,
      pop: population.dzongkhags[d.slug]?.total ?? 0, hospitals: health.dzongkhags[d.slug]?.totals.hospitals ?? 0, beds: health.dzongkhags[d.slug]?.totals.beds ?? 0,
      phc: health.dzongkhags[d.slug]?.totals.phc ?? 0, subpost: health.dzongkhags[d.slug]?.totals.subpost ?? 0, schools: schools.dzongkhags[d.slug]?.total ?? 0,
      mofBudget: budget.dzongkhags[d.slug]?.total ?? 0,
      mofGewogBudget: Object.fromEntries(budget.gewogs.filter(g => g.dz === d.slug && g.mapName).map(g => [g.mapName!.toLowerCase(), g.total])) };
  });
  return { dz: out, hasAlloc: allocs.length > 0 };
}
