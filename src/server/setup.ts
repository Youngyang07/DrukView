// One-time database setup: create tables and seed the 20 dzongkhags. Idempotent and safe to call concurrently
// (a Postgres advisory lock serialises callers), so the app can run it automatically on first use.
import { pool } from './db';
import { MIGRATIONS } from '../../db/migrations';
import ref from '../../shared/dzongkhags.json';

const LOCK_ID = 726_190_001; // arbitrary constant identifying "DrukView schema setup"

export let lastSetupError: string | null = null;

export async function migrate(): Promise<string[]> {
  const c = await pool().connect();
  const applied: string[] = [];
  try {
    await c.query('select pg_advisory_lock($1)', [LOCK_ID]);
    await c.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await c.query('select name from schema_migrations')).rows.map(r => r.name));
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      try { await c.query('begin'); await c.query(m.sql); await c.query('insert into schema_migrations(name) values ($1)', [m.name]); await c.query('commit'); applied.push(m.name); }
      catch (e) { await c.query('rollback'); throw new Error(`migration ${m.name} failed: ${(e as Error).message}`); }
    }
  } finally {
    await c.query('select pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    c.release();
  }
  return applied;
}

type RefDz = { id: string; slug: string; name: string; aliases: string[]; lat: number; lon: number; grid_col: number; grid_row: number };

export async function seed(): Promise<number> {
  const list = (ref as { dzongkhags: RefDz[] }).dzongkhags;
  for (const d of list) {
    await pool().query(
      `insert into dzongkhags(id,slug,name,aliases,lat,lon,grid_col,grid_row) values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set slug=$2,name=$3,aliases=$4,lat=$5,lon=$6,grid_col=$7,grid_row=$8`,
      [d.id, d.slug, d.name, d.aliases, d.lat, d.lon, d.grid_col, d.grid_row]);
  }
  return list.length;
}

/** Create tables + seed. Returns what was applied; records the error (for the setup banner) instead of hiding it. */
export async function ensureSchema(): Promise<{ applied: string[]; dzongkhags: number }> {
  try { const applied = await migrate(); const dzongkhags = await seed(); lastSetupError = null; return { applied, dzongkhags }; }
  catch (e) { lastSetupError = String((e as Error).message).slice(0, 300); throw e; }
}
