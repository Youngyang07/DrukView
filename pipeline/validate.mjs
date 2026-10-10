import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA, readJson, loadDzongkhags, httpsUrl } from './lib.mjs';

const STATUSES = new Set(['active', 'completed', 'pipeline', 'cancelled', 'suspended', 'unknown']);

export function validateProjects(records, dzIds) {
  const errs = [], seen = new Set();
  records.forEach((r, i) => {
    const w = `projects[${i}] ${r.id ?? '?'}`;
    if (!r.id) errs.push(`${w}: missing id`);
    if (seen.has(r.id)) errs.push(`${w}: duplicate id`); seen.add(r.id);
    if (!r.title) errs.push(`${w}: missing title`);
    if (!STATUSES.has(r.status)) errs.push(`${w}: bad status ${r.status}`);
    if (r.amount_committed !== null && !(Number.isFinite(r.amount_committed) && r.amount_committed >= 0)) errs.push(`${w}: bad amount_committed`);
    if (r.amount_committed !== null && !/^[A-Z]{3}$/.test(r.currency ?? '')) errs.push(`${w}: amount without currency`);
    if (r.url && !httpsUrl(r.url)) errs.push(`${w}: url must be https`);
    if (!r.source) errs.push(`${w}: missing source`);
    for (const l of r.locations ?? []) if (!dzIds.has(l.dzongkhag)) errs.push(`${w}: unknown dzongkhag ${l.dzongkhag}`);
  });
  return errs;
}

export async function validateAll() {
  const dz = new Set((await loadDzongkhags()).map(d => d.id));
  const errs = validateProjects((await readJson(resolve(DATA, 'projects.json'))).records, dz);
  for (const r of (await readJson(resolve(DATA, 'allocations.json'))).records) if (!dz.has(r.dzongkhag)) errs.push(`allocation: unknown dzongkhag ${r.dzongkhag}`);
  return errs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateAll().then(e => { if (e.length) { console.error(e.join('\n')); process.exit(1); } console.log('data valid'); });
}
