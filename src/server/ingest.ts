// Collectors → PostgreSQL. Each job is isolated: failure is recorded on the source row and in update_log,
// and the previous good rows stay in place (the UI marks the source stale). Nothing is ever fabricated.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { pool, query } from './db';
import { makeGeoMatcher } from '../../pipeline/lib.mjs';
import { fetchWorldBank, SOURCE as WB } from '../../pipeline/worldbank.mjs';
import { fetchAdb, SOURCE as ADB } from '../../pipeline/adb.mjs';
import { fetchBoundaries, SOURCE as BND } from '../../pipeline/boundaries.mjs';
import { fetchWeather, SOURCE as WX } from '../../pipeline/weather.mjs';
import { validateProjects } from '../../pipeline/validate.mjs';
import { parseCsv, buildBudget, buildAllocations, buildTenders, buildOffices } from '../../pipeline/ingest-manual.mjs';

export type SourceDef = { id: string; name: string; url: string; kind: string; notes: string };
export const MANUAL: SourceDef = {
  id: 'rgob-manual', name: 'RGoB budget, tender and office documents – curated CSV with per-row citations',
  url: 'https://www.mof.gov.bt/publications/', kind: 'manual',
  notes: 'National budget reports, tender notices and office directories are published as PDFs/web pages without an API. Rows are transcribed into data/manual/*.csv and every row must cite its public document.',
};
export const JOBS = ['worldbank', 'adb', 'boundaries', 'weather', 'manual'] as const;
export type JobName = (typeof JOBS)[number];

type Dz = { id: string; name: string; aliases: string[]; lat: number; lon: number };
const loadDz = () => query<Dz>('select id, name, aliases, lat, lon from dzongkhags order by id');
export const matcherOf = async () => makeGeoMatcher((await loadDz()).map(d => ({ id: d.id, name: d.name, aliases: d.aliases })));

async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; }
  catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}

async function upsertSource(def: SourceDef) {
  await query(`insert into sources(id,name,url,kind,notes) values ($1,$2,$3,$4,$5)
    on conflict (id) do update set name=$2,url=$3,kind=$4,notes=$5`, [def.id, def.name, def.url, def.kind, def.notes]);
}

export async function replaceProjects(source: string, rows: any[]) {
  const errs = validateProjects(rows, new Set((await loadDz()).map(d => d.id)));
  if (errs.length) throw new Error(`${source}: ${errs.length} invalid records, nothing loaded. First: ${errs[0]}`);
  await withTx(async c => {
    await c.query('delete from projects where source=$1', [source]); // cascades to project_locations
    for (const p of rows) {
      await c.query(`insert into projects(id,source,funder,title,description,status,sector,implementing_agency,amount_committed,amount_disbursed,currency,start_date,end_date,geo_confidence,url,fetched_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        on conflict (id) do nothing`,
        [p.id, p.source, p.funder, p.title, p.description, p.status, p.sector, p.implementing_agency, p.amount_committed, p.amount_disbursed, p.currency, p.start_date, p.end_date, p.geo_confidence, p.url, p.fetched_at]);
      for (const l of p.locations) await c.query('insert into project_locations(project_id,dzongkhag_id,gewog,village) values ($1,$2,$3,$4)', [p.id, l.dzongkhag, l.gewog, l.village]);
    }
  });
  return rows.length;
}

export async function saveWeather(rows: any[]) {
  await withTx(async c => {
    for (const r of rows) await c.query(`insert into weather_daily(dzongkhag_id,date,tmax_c,tmin_c,precip_mm,is_forecast,fetched_at) values ($1,$2,$3,$4,$5,$6,$7)
      on conflict (dzongkhag_id,date) do update set tmax_c=$3,tmin_c=$4,precip_mm=$5,is_forecast=$6,fetched_at=$7`, [r.dzongkhag, r.date, r.tmax_c, r.tmin_c, r.precip_mm, r.is_forecast, r.fetched_at]);
  });
  return rows.length;
}

async function saveBoundaries(fc: any, license: string | null) {
  await withTx(async c => {
    for (const f of fc.features) await c.query(`insert into boundaries(dzongkhag_id,geometry,license,retrieved_at) values ($1,$2,$3,now())
      on conflict (dzongkhag_id) do update set geometry=$2,license=$3,retrieved_at=now()`, [f.properties.dzongkhag_id, JSON.stringify(f.geometry), license]);
  });
  return fc.features.length;
}

export type ManualFiles = { budget: string; allocations: string; tenders: string; offices: string };
export async function readManualFiles(dir = resolve(process.cwd(), 'data/manual')): Promise<ManualFiles> {
  const r = (f: string) => readFile(resolve(dir, f), 'utf8').catch(() => '');
  return { budget: await r('budget_by_agency.csv'), allocations: await r('allocations_by_location.csv'), tenders: await r('tenders.csv'), offices: await r('offices.csv') };
}

export async function saveManual(files: ManualFiles, matcher: any) {
  const b = buildBudget(parseCsv(files.budget)), a = buildAllocations(parseCsv(files.allocations), matcher);
  const t = buildTenders(parseCsv(files.tenders), matcher), o = buildOffices(parseCsv(files.offices), matcher);
  const errs = [...b.errs.map((e: string) => `budget_by_agency.csv ${e}`), ...a.errs.map((e: string) => `allocations_by_location.csv ${e}`),
    ...t.errs.map((e: string) => `tenders.csv ${e}`), ...o.errs.map((e: string) => `offices.csv ${e}`)];
  if (errs.length) throw new Error('Manual data rejected:\n  ' + errs.join('\n  ')); // all-or-nothing: bad files never half-load
  await withTx(async c => {
    await c.query('delete from budget_lines'); await c.query('delete from allocations'); await c.query('delete from tenders'); await c.query('delete from offices');
    for (const r of b.out) await c.query('insert into budget_lines(fiscal_year,agency,budget_type,amount,currency,funding_source,source_name,source_url,document,page,retrieved_on) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [r.fiscal_year, r.agency, r.budget_type, r.amount, r.currency, r.funding_source, r.source_name, r.source_url, r.document, r.page, r.retrieved_on]);
    for (const r of a.out) await c.query('insert into allocations(fiscal_year,dzongkhag_id,gewog,village,sector,funding_source,amount,currency,source_name,source_url,document,page,retrieved_on) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [r.fiscal_year, r.dzongkhag, r.gewog, r.village, r.sector, r.funding_source, r.amount, r.currency, r.source_name, r.source_url, r.document, r.page, r.retrieved_on]);
    for (const r of t.out) await c.query('insert into tenders(id,dzongkhag_id,title,agency,category,value,currency,published_on,closing_on,status,url,source_name,retrieved_on) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict (id) do nothing',
      [r.id, r.dzongkhag, r.title, r.agency, r.category, r.value, r.currency, r.published_on, r.closing_on, r.status, r.url, r.source_name, r.retrieved_on]);
    for (const r of o.out) await c.query('insert into offices(dzongkhag_id,kind,name,role,contact,source_name,source_url,retrieved_on) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [r.dzongkhag, r.kind, r.name, r.role, r.contact, r.source_name, r.source_url, r.retrieved_on]);
  });
  return b.out.length + a.out.length + t.out.length + o.out.length;
}

export type JobResult = { job: JobName; status: 'ok' | 'error'; records: number; message: string | null };

export async function runJob(job: JobName): Promise<JobResult> {
  const def = { worldbank: WB, adb: ADB, boundaries: BND, weather: WX, manual: MANUAL }[job] as SourceDef;
  await upsertSource(def);
  await query('update sources set last_attempt=now() where id=$1', [def.id]);
  try {
    let n = 0;
    if (job === 'worldbank') n = await replaceProjects('worldbank', await fetchWorldBank(await matcherOf()));
    if (job === 'adb') n = await replaceProjects('adb', await fetchAdb(await matcherOf()));
    if (job === 'boundaries') { const r = await fetchBoundaries(await matcherOf()); n = await saveBoundaries(r.fc, r.license); }
    if (job === 'weather') n = await saveWeather(await fetchWeather(await loadDz()));
    if (job === 'manual') n = await saveManual(await readManualFiles(), await matcherOf());
    await query(`update sources set status='ok', last_success=now(), records=$2, error=null where id=$1`, [def.id, n]);
    await query('insert into update_log(job,status,records) values ($1,$2,$3)', [job, 'ok', n]);
    return { job, status: 'ok', records: n, message: null };
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 800);
    // keep previous good data; flag stale if we ever succeeded, else error
    await query(`update sources set status = case when last_success is null then 'error' else 'stale' end, error=$2 where id=$1`, [def.id, msg]);
    await query('insert into update_log(job,status,records,message) values ($1,$2,0,$3)', [job, 'error', msg]);
    return { job, status: 'error', records: 0, message: msg };
  }
}
