import { query, dbReady } from './db';

export type Dz = { id: string; slug: string; name: string; lat: number; lon: number; grid_col: number; grid_row: number };
export type Source = { id: string; name: string; url: string | null; kind: string; status: string; last_attempt: string | null; last_success: string | null; records: number; error: string | null; notes: string | null };
export type Project = { id: string; source: string; funder: string; title: string; description: string | null; status: string; sector: string | null; implementing_agency: string | null;
  amount_committed: number | null; amount_disbursed: number | null; currency: string; start_date: string | null; end_date: string | null; geo_confidence: string; url: string | null; where: string[] };
export type Filters = { funder?: string; status?: string; sector?: string; q?: string };

export { dbReady };

export const getDzongkhags = () => query<Dz>('select id,slug,name,lat,lon,grid_col,grid_row from dzongkhags order by name');
export const getDzBySlug = async (slug: string) => (await query<Dz>('select id,slug,name,lat,lon,grid_col,grid_row from dzongkhags where slug=$1', [slug]))[0] ?? null;

export const getSources = () => query<Source>(`select id,name,url,kind,status,last_attempt::text,last_success::text,records,error,notes from sources order by id`);
/** One source's health, so a page can tell "nothing to show" apart from "we could not read it". */
export type SourceHealth = { status: string; last_success: string | null; error: string | null };
export const sourceHealth = async (id: string): Promise<SourceHealth | null> => {
  const [r] = await query<SourceHealth>('select status, last_success::text, error from sources where id=$1', [id]);
  return r ?? null;
};
export const getUpdateLog = (limit = 40) => query<{ at: string; job: string; status: string; records: number; message: string | null }>('select at::text,job,status,records,message from update_log order by id desc limit $1', [limit]);

/** Latest successful refresh time per data domain (used for the per-module "last refreshed" stamp). */
export async function freshness(): Promise<Record<string, string | null>> {
  const rows = await query<{ id: string; last_success: string | null }>('select id, last_success::text from sources');
  const m = Object.fromEntries(rows.map(r => [r.id, r.last_success]));
  const newest = (...ids: string[]) => ids.map(i => m[i]).filter(Boolean).sort().pop() ?? null;
  return { projects: newest('worldbank', 'adb'), weather: m.weather ?? null, manual: m['rgob-manual'] ?? null, tenders: newest('egp', 'rgob-manual'), egp: m.egp ?? null };
}

const WHERE = (f: Filters, scope: string | null, params: unknown[]) => {
  const w: string[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (scope) w.push(`p.id in (select project_id from project_locations where dzongkhag_id=${p(scope)})`);
  if (f.funder) w.push(`p.funder=${p(f.funder)}`);
  if (f.status) w.push(`p.status=${p(f.status)}`);
  if (f.sector) w.push(`p.sector=${p(f.sector)}`);
  if (f.q) w.push(`(p.title ilike ${p('%' + f.q.replace(/[%_]/g, m => '\\' + m) + '%')} or p.implementing_agency ilike $${params.length} or p.sector ilike $${params.length})`);
  return w.length ? 'where ' + w.join(' and ') : '';
};

export async function listProjects(scope: string | null, f: Filters = {}, limit = 300): Promise<{ rows: Project[]; total: number }> {
  const params: unknown[] = [];
  const where = WHERE(f, scope, params);
  const rows = await query<any>(`select p.id,p.source,p.funder,p.title,p.description,p.status,p.sector,p.implementing_agency,p.amount_committed::float8,p.amount_disbursed::float8,p.currency,
      p.start_date::text,p.end_date::text,p.geo_confidence,p.url,
      coalesce((select array_agg(distinct d.name order by d.name) from project_locations pl join dzongkhags d on d.id=pl.dzongkhag_id where pl.project_id=p.id), '{}') as "where"
    from projects p ${where} order by p.amount_committed desc nulls last, p.title limit ${limit}`, params);
  const [{ n }] = await query<{ n: number }>(`select count(*)::int n from projects p ${where}`, params);
  return { rows, total: n };
}

export async function projectFacets() {
  const funders = await query<{ v: string }>('select distinct funder v from projects order by 1');
  const sectors = await query<{ v: string }>('select distinct sector v from projects where sector is not null order by 1');
  return { funders: funders.map(r => r.v), sectors: sectors.map(r => r.v) };
}

export async function projectStats(scope: string | null) {
  const params: unknown[] = []; const w = WHERE({}, scope, params);
  const [r] = await query<{ total: number; active: number; completed: number; usd: number; funders: number }>(`select count(*)::int total,
    count(*) filter (where p.status='active')::int active, count(*) filter (where p.status='completed')::int completed,
    coalesce(sum(p.amount_committed) filter (where p.currency='USD'),0)::float8 usd, count(distinct p.funder)::int funders from projects p ${w}`, params);
  return r;
}

export async function byFunder(scope: string | null) {
  const params: unknown[] = []; const w = WHERE({}, scope, params);
  return query<{ k: string; usd: number; n: number }>(`select p.funder k, coalesce(sum(p.amount_committed) filter (where p.currency='USD'),0)::float8 usd, count(*)::int n from projects p ${w} group by 1 order by usd desc, n desc`, params);
}
export async function bySector(scope: string | null) {
  const params: unknown[] = []; const w = WHERE({}, scope, params);
  return query<{ k: string; usd: number; n: number }>(`select coalesce(p.sector,'Unclassified') k, coalesce(sum(p.amount_committed) filter (where p.currency='USD'),0)::float8 usd, count(*)::int n from projects p ${w} group by 1 order by usd desc, n desc limit 15`, params);
}
export async function byStatus(scope: string | null) {
  const params: unknown[] = []; const w = WHERE({}, scope, params);
  return query<{ k: string; usd: number; n: number }>(`select p.status k, coalesce(sum(p.amount_committed) filter (where p.currency='USD'),0)::float8 usd, count(*)::int n from projects p ${w} group by 1 order by n desc`, params);
}

/** Per-dzongkhag numbers for the map. USD money is attributed only to projects located in exactly ONE dzongkhag. */
export async function mapMetrics() {
  return query<{ id: string; n: number; usd: number; btn: number }>(`
    with loc as (select distinct project_id, dzongkhag_id from project_locations),
         cnt as (select project_id, count(*) c from loc group by 1)
    select d.id,
      coalesce((select count(*) from loc where loc.dzongkhag_id=d.id),0)::int n,
      coalesce((select sum(p.amount_committed) from loc join cnt using(project_id) join projects p on p.id=loc.project_id
                where loc.dzongkhag_id=d.id and cnt.c=1 and p.currency='USD'),0)::float8 usd,
      coalesce((select sum(a.amount) from allocations a where a.dzongkhag_id=d.id and a.currency='BTN'),0)::float8 btn
    from dzongkhags d order by d.id`);
}

export type Alloc = { fiscal_year: string; dzongkhag: string; gewog: string | null; village: string | null; sector: string | null; funding_source: string; amount: number; currency: string; source_name: string; source_url: string; document: string; page: string | null };
export const getAllocations = (scope: string | null) => query<Alloc>(`select a.fiscal_year,d.name dzongkhag,a.gewog,a.village,a.sector,a.funding_source,a.amount::float8,a.currency,a.source_name,a.source_url,a.document,a.page
  from allocations a join dzongkhags d on d.id=a.dzongkhag_id ${scope ? 'where a.dzongkhag_id=$1' : ''} order by a.fiscal_year desc, a.amount desc`, scope ? [scope] : []);

export type BudgetLine = { fiscal_year: string; agency: string; budget_type: string; amount: number; currency: string; funding_source: string | null; source_name: string; source_url: string; document: string; page: string | null };
export const getBudgetLines = () => query<BudgetLine>('select fiscal_year,agency,budget_type,amount::float8,currency,funding_source,source_name,source_url,document,page from budget_lines order by fiscal_year desc, amount desc');

export type Wx = { dzongkhag_id: string; name?: string; date: string; tmax_c: number | null; tmin_c: number | null; precip_mm: number | null; is_forecast: boolean };
export const getWeather = (scope: string) => query<Wx>('select dzongkhag_id,date::text,tmax_c,tmin_c,precip_mm,is_forecast from weather_daily where dzongkhag_id=$1 order by date', [scope]);
export const getWeatherSummary = () => query<{ id: string; name: string; slug: string; precip14: number | null; tmax: number | null; tmin: number | null }>(`
  select d.id,d.name,d.slug, sum(w.precip_mm) filter (where not w.is_forecast)::float8 precip14,
    (select tmax_c from weather_daily x where x.dzongkhag_id=d.id and not x.is_forecast order by date desc limit 1) tmax,
    (select tmin_c from weather_daily x where x.dzongkhag_id=d.id and not x.is_forecast order by date desc limit 1) tmin
  from dzongkhags d left join weather_daily w on w.dzongkhag_id=d.id group by d.id,d.name,d.slug order by d.name`);

export type Tender = { id: string; source: string; tender_id: string | null; reference: string | null; dzongkhag: string | null; title: string; agency: string | null;
  category: string | null; proc_type: string | null; method: string | null; amendments: number; value: number | null; currency: string | null;
  published_on: string | null; closing_on: string | null; status: string | null; url: string; source_name: string };
/** Open notices first (soonest closing date), then the ones that have closed. */
export const getTenders = (scope: string | null) => query<Tender>(`select t.id,t.source,t.tender_id,t.reference,d.name dzongkhag,t.title,t.agency,t.category,t.proc_type,t.method,t.amendments,
    t.value::float8,t.currency,t.published_on::text,t.closing_on::text,t.status,t.url,t.source_name
  from tenders t left join dzongkhags d on d.id=t.dzongkhag_id ${scope ? 'where t.dzongkhag_id=$1' : ''}
  order by (t.closing_on >= current_date) desc nulls last, case when t.closing_on >= current_date then t.closing_on end asc, t.published_on desc nulls last limit 200`, scope ? [scope] : []);

export type Office = { kind: string; dzongkhag: string | null; name: string; role: string | null; contact: string | null; source_name: string; source_url: string; retrieved_on: string | null };
export const getOffices = (scope: string | null) => query<Office>(`select o.kind,d.name dzongkhag,o.name,o.role,o.contact,o.source_name,o.source_url,o.retrieved_on::text
  from offices o left join dzongkhags d on d.id=o.dzongkhag_id ${scope ? 'where o.dzongkhag_id=$1 or o.dzongkhag_id is null' : ''} order by o.kind desc, o.name`, scope ? [scope] : []);

export type LeaderRow = { house: 'na' | 'nc'; name: string; role: string; constituency: string | null;
  dzongkhag_id: string | null; slug: string | null; dzongkhag: string | null; eminent: boolean; parliament: string;
  term_start: string | null; term_end: string | null; source_name: string; source_url: string; fetched_at: string };
export const getLeaders = () => query<LeaderRow>(
  `select l.house, l.name, l.role, l.constituency, l.dzongkhag_id, d.slug, d.name as dzongkhag, l.eminent, l.parliament,
          l.term_start, l.term_end, l.source_name, l.source_url, l.fetched_at::text
     from leaders l left join dzongkhags d on d.id = l.dzongkhag_id
    order by l.house, d.name nulls last, l.name`);

export type NewsFlag = { slug: string; dzongkhag: string; title: string; url: string | null; published: string | null; source_name: string; source_url: string };
export const getNewsFlags = (dzongkhagId: string | null = null) => query<NewsFlag>(
  `select d.slug, d.name as dzongkhag, f.title, f.url, f.published::text, f.source_name, f.source_url
     from news_flags f join dzongkhags d on d.id = f.dzongkhag_id
    where ($1::text is null or f.dzongkhag_id = $1)
    order by f.published desc nulls last limit 40`, [dzongkhagId]);
