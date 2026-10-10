import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../src/server/db';

export async function migrate(dir = resolve(process.cwd(), 'db/migrations')) {
  const p = pool();
  await p.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await p.query('select name from schema_migrations')).rows.map(r => r.name));
  const applied: string[] = [];
  for (const f of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const c = await p.connect();
    try { await c.query('begin'); await c.query(await readFile(resolve(dir, f), 'utf8')); await c.query('insert into schema_migrations(name) values ($1)', [f]); await c.query('commit'); applied.push(f); }
    catch (e) { await c.query('rollback'); throw new Error(`migration ${f} failed: ${(e as Error).message}`); }
    finally { c.release(); }
  }
  return applied;
}

if (process.argv[1]?.endsWith('migrate.ts')) migrate().then(a => { console.log('applied:', a.join(', ') || '(none)'); return pool().end(); }, e => { console.error(e.message); process.exit(1); });
