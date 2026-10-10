import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../src/server/db';

export async function seed() {
  const { dzongkhags } = JSON.parse(await readFile(resolve(process.cwd(), 'shared/dzongkhags.json'), 'utf8'));
  const p = pool();
  for (const d of dzongkhags) {
    await p.query(
      `insert into dzongkhags(id,slug,name,aliases,lat,lon,grid_col,grid_row) values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set slug=$2,name=$3,aliases=$4,lat=$5,lon=$6,grid_col=$7,grid_row=$8`,
      [d.id, d.slug, d.name, d.aliases, d.lat, d.lon, d.grid_col, d.grid_row]);
  }
  return dzongkhags.length;
}
if (process.argv[1]?.endsWith('seed.ts')) seed().then(n => { console.log('seeded dzongkhags:', n); return pool().end(); }, e => { console.error(e.message); process.exit(1); });
