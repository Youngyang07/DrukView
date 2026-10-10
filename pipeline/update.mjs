// Daily refresh. Each source is isolated: a failure is recorded in sources.json and the previous good
// records for that source are kept (marked stale) instead of wiping the site.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA, readJson, writeJson, makeGeoMatcher, loadDzongkhags } from './lib.mjs';
import { fetchWorldBank, SOURCE as WB } from './worldbank.mjs';
import { fetchAdb, SOURCE as ADB } from './adb.mjs';
import { fetchBoundaries, SOURCE as BND } from './boundaries.mjs';
import { ingestManual } from './ingest-manual.mjs';

const MANUAL = {
  id: 'rgob-manual', name: 'RGoB budget documents (MoF, MoHCA, MoAL and other ministries) – curated CSV',
  url: 'https://www.mof.gov.bt/publications/', kind: 'manual',
  notes: 'No public API exists for national budget reports. Rows are transcribed from published PDFs into data/manual/*.csv; each row must cite its document.',
};

export async function runUpdate({ only } = {}) {
  const now = new Date().toISOString();
  const matcher = makeGeoMatcher(await loadDzongkhags());
  const prevProjects = await readJson(resolve(DATA, 'projects.json'), { records: [] });
  const prevSources = await readJson(resolve(DATA, 'sources.json'), { sources: [] });
  const prevById = Object.fromEntries(prevSources.sources.map(s => [s.id, s]));
  let records = [...prevProjects.records];
  const statuses = [];

  const track = async (def, job, onOk) => {
    const prev = prevById[def.id] ?? {};
    if (only && only !== def.id) { statuses.push({ ...def, ...prev, ...{ id: def.id, name: def.name, url: def.url, kind: def.kind, notes: def.notes } }); return; }
    try {
      const res = await job();
      const count = await onOk(res);
      statuses.push({ ...def, status: 'ok', last_attempt: now, last_success: now, records: count, error: null });
      console.log(`✓ ${def.id}: ${count}`);
    } catch (e) {
      console.error(`✗ ${def.id}: ${e.message}`);
      statuses.push({ ...def, status: prev.last_success ? 'stale' : 'error', last_attempt: now, last_success: prev.last_success ?? null, records: prev.records ?? 0, error: String(e.message).slice(0, 500) });
    }
  };

  const replaceSource = (src) => async (rows) => { records = records.filter(r => r.source !== src).concat(rows); return rows.length; };
  await track(WB, () => fetchWorldBank(matcher), replaceSource('worldbank'));
  await track(ADB, () => fetchAdb(matcher), replaceSource('adb'));
  await track(BND, fetchBoundaries, async ({ fc, unmatched, license }) => {
    await writeJson(resolve(DATA, 'bhutan-dzongkhags.geojson'), { ...fc, license, retrieved: now });
    if (unmatched.length) console.warn('  unmatched boundary shapes:', unmatched.join(', '));
    return fc.features.length;
  });
  await track(MANUAL, ingestManual, async (r) => r.budget + r.allocations);

  records.sort((a, b) => a.id.localeCompare(b.id));
  await writeJson(resolve(DATA, 'projects.json'), { generated_at: now, records });
  await writeJson(resolve(DATA, 'sources.json'), { generated_at: now, sources: statuses });
  return statuses;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];
  runUpdate({ only }).then(s => {
    const bad = s.filter(x => x.status === 'error');
    // Fail the job only if NOTHING has ever succeeded; stale data is surfaced in the UI, not hidden by a red build.
    if (bad.length === s.length) process.exit(1);
  });
}
