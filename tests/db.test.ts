// Integration tests against a REAL PostgreSQL. Set TEST_DATABASE_URL (a throwaway database) to run; skipped otherwise.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('database layer', () => {
  let q: typeof import('../src/server/queries'); let ing: typeof import('../src/server/ingest'); let db: typeof import('../src/server/db');
  const proj = (id: string, funder: string, dzs: string[], amt: number | null, over: Record<string, unknown> = {}) => ({
    id, source: 'worldbank', funder, title: `Project ${id}`, description: null, status: 'active', sector: 'Health', implementing_agency: 'Agency', amount_committed: amt, amount_disbursed: null, currency: 'USD',
    start_date: '2020-01-01', end_date: null, geo_confidence: 'text-match', url: 'https://example.org/' + id, fetched_at: new Date().toISOString(), locations: dzs.map(dzongkhag => ({ dzongkhag, gewog: null, village: null })), ...over });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('../src/server/db'); ing = await import('../src/server/ingest'); q = await import('../src/server/queries');
    const { migrate } = await import('../scripts/migrate'); const { seed } = await import('../scripts/seed');
    await db.query('drop schema public cascade; create schema public;'); await migrate(); await seed();
    await db.query(`insert into sources(id,name,kind) values ('worldbank','WB','api'),('adb','ADB','iati'),('weather','WX','api')`);
  });
  afterAll(async () => { await db.pool().end(); });

  test('seed: 20 dzongkhags with slugs', async () => {
    const dz = await q.getDzongkhags(); expect(dz).toHaveLength(20); expect((await q.getDzBySlug('thimphu'))?.id).toBe('BT-15'); expect(await q.getDzBySlug('narnia')).toBeNull();
  });

  test('money attribution: only single-dzongkhag USD projects add to a dzongkhag; multi-district counted but not split', async () => {
    await ing.replaceProjects('worldbank', [
      proj('a', 'World Bank', ['BT-15'], 10_000_000), proj('b', 'World Bank', ['BT-15', 'BT-11'], 50_000_000), proj('c', 'World Bank', [], 7_000_000), proj('d', 'World Bank', ['BT-11'], null, { status: 'completed', sector: 'Roads' }),
    ]);
    const m = Object.fromEntries((await q.mapMetrics()).map(r => [r.id, r]));
    expect(m['BT-15']).toMatchObject({ n: 2, usd: 10_000_000 }); // b counted, but its 50M is NOT added
    expect(m['BT-11']).toMatchObject({ n: 2, usd: 0 });
    expect(m['BT-45']).toMatchObject({ n: 0, usd: 0 });
    const st = await q.projectStats(null); expect(st).toMatchObject({ total: 4, active: 3, completed: 1, funders: 1, usd: 67_000_000 });
    expect((await q.projectStats('BT-11')).total).toBe(2);
  });

  test('filters, search, scope, wildcard escaping', async () => {
    expect((await q.listProjects(null, { status: 'completed' })).total).toBe(1);
    expect((await q.listProjects('BT-15', { sector: 'Health' })).total).toBe(2);
    expect((await q.listProjects(null, { q: 'Project a' })).rows.map(r => r.id)).toEqual(['a']);
    expect((await q.listProjects(null, { q: '%' })).total).toBe(0); // a literal % must not match everything
    const b = (await q.listProjects(null)).rows.find(r => r.id === 'b')!; expect(b.where).toEqual(['Paro', 'Thimphu']);
    expect((await q.listProjects(null)).rows[0].id).toBe('b'); // biggest first, nulls last
  });

  test('a failed/invalid batch leaves previous good data untouched', async () => {
    await expect(ing.replaceProjects('worldbank', [proj('bad', 'World Bank', ['BT-15'], 1, { status: 'weird' })])).rejects.toThrow(/invalid records, nothing loaded/);
    expect((await q.projectStats(null)).total).toBe(4);
    await expect(ing.replaceProjects('worldbank', [proj('x', 'W', ['BT-ZZ'], 1)])).rejects.toThrow(/unknown dzongkhag/);
    expect((await q.projectStats(null)).total).toBe(4);
  });

  test('manual CSV: all-or-nothing, cited rows load, bad file rejected without touching old rows', async () => {
    const matcher = await ing.matcherOf();
    const head = 'fiscal_year,dzongkhag,gewog,village,sector,funding_source,amount,currency,source_name,source_url,document,page,retrieved_on\n';
    const bud = 'fiscal_year,agency,budget_type,amount,currency,funding_source,source_name,source_url,document,page,retrieved_on\n';
    const files = { budget: bud + '2024-25,Ministry X,capital,1000,BTN,RGoB,MoF,https://example.org/b.pdf,Budget Report,4,2026-01-01\n',
      allocations: head + '2024-25,Thimphu,Gewog A,,Health,RGoB,500,BTN,MoF,https://example.org/a.pdf,Budget Report,9,\n', tenders: 'id,dzongkhag,title,agency,category,value,currency,published_on,closing_on,status,url,source_name,retrieved_on\n', offices: 'dzongkhag,kind,name,role,contact,source_name,source_url,retrieved_on\n' };
    expect(await ing.saveManual(files, matcher)).toBe(2);
    expect((await q.getAllocations('BT-15'))[0]).toMatchObject({ gewog: 'Gewog A', amount: 500, funding_source: 'RGoB' });
    expect((await q.mapMetrics()).find(r => r.id === 'BT-15')!.btn).toBe(500);
    expect(await q.getBudgetLines()).toHaveLength(1);
    await expect(ing.saveManual({ ...files, allocations: head + '2024-25,Thimphu,,,Health,RGoB,500,BTN,MoF,http://insecure,,,\n' }, matcher)).rejects.toThrow(/Manual data rejected/);
    expect(await q.getBudgetLines()).toHaveLength(1); expect(await q.getAllocations(null)).toHaveLength(1); // untouched
  });

  test('weather upsert + summary; funders/sector aggregates', async () => {
    const day = (date: string, p: number, f = false) => ({ dzongkhag: 'BT-15', date, tmax_c: 20, tmin_c: 8, precip_mm: p, is_forecast: f, fetched_at: new Date().toISOString() });
    await ing.saveWeather([day('2026-10-08', 2), day('2026-10-09', 3), day('2026-10-11', 9, true)]);
    await ing.saveWeather([day('2026-10-09', 4)]); // upsert, not duplicate
    expect((await q.getWeather('BT-15')).map(w => w.precip_mm)).toEqual([2, 4, 9]);
    expect((await q.getWeatherSummary()).find(w => w.id === 'BT-15')!.precip14).toBe(6);
    expect((await q.getWeatherSummary()).find(w => w.id === 'BT-45')!.precip14).toBeNull();
    expect((await q.byFunder(null))[0]).toMatchObject({ k: 'World Bank', usd: 67_000_000, n: 4 });
    expect((await q.bySector(null)).find(s => s.k === 'Roads')!.n).toBe(1);
  });

  test('freshness reflects sources; update_log writes', async () => {
    await db.query(`update sources set last_success=now(), status='ok' where id='worldbank'`);
    const fr = await q.freshness(); expect(fr.projects).toBeTruthy(); expect(fr.manual).toBeNull();
    expect(await q.getBoundaries()).toBeNull();
  });
});
