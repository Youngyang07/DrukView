// Ministry of Finance, Home & Cultural Affairs, Agriculture & Livestock and other RGoB budget documents are
// published as PDFs/Excel without an API. They enter DrukView through citation-checked CSVs in data/manual/.
// Every row MUST carry a source_url (https) and document name so each Ngultrum can be traced to a public document.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA, readJson, writeJson, parseAmount, httpsUrl, makeGeoMatcher, loadDzongkhags } from './lib.mjs';

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim() !== '')) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map(h => h.trim());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const CITE = ['source_name', 'source_url', 'document'];
const need = (r, keys, errs, n) => { for (const k of keys) if (!r[k]) errs.push(`row ${n}: missing ${k}`); };

function common(r, n, errs) {
  need(r, ['fiscal_year', 'amount', 'currency', ...CITE], errs, n);
  if (r.fiscal_year && !/^\d{4}(-\d{2,4})?$/.test(r.fiscal_year)) errs.push(`row ${n}: fiscal_year "${r.fiscal_year}" must look like 2024 or 2024-25`);
  if (r.amount && parseAmount(r.amount) === null) errs.push(`row ${n}: amount "${r.amount}" is not a number`);
  if (r.currency && !/^[A-Z]{3}$/.test(r.currency)) errs.push(`row ${n}: currency must be ISO 4217 (e.g. BTN)`);
  if (r.source_url && !httpsUrl(r.source_url)) errs.push(`row ${n}: source_url must be an https URL`);
}

export function buildBudget(rows) {
  const errs = [], out = [];
  rows.forEach((r, i) => {
    const n = i + 2; common(r, n, errs); need(r, ['agency'], errs, n);
    out.push({ fiscal_year: r.fiscal_year, agency: r.agency, budget_type: r.budget_type || 'total', amount: parseAmount(r.amount), currency: r.currency,
      funding_source: r.funding_source || null, source_name: r.source_name, source_url: httpsUrl(r.source_url), document: r.document, page: r.page || null, retrieved_on: r.retrieved_on || null });
  });
  return { errs, out };
}

export function buildAllocations(rows, matcher) {
  const errs = [], out = [];
  rows.forEach((r, i) => {
    const n = i + 2; common(r, n, errs); need(r, ['dzongkhag', 'funding_source'], errs, n);
    const id = r.dzongkhag ? matcher.byName(r.dzongkhag) : null;
    if (r.dzongkhag && !id) errs.push(`row ${n}: unknown dzongkhag "${r.dzongkhag}"`);
    out.push({ fiscal_year: r.fiscal_year, dzongkhag: id, gewog: r.gewog || null, village: r.village || null, sector: r.sector || null, funding_source: r.funding_source,
      amount: parseAmount(r.amount), currency: r.currency, source_name: r.source_name, source_url: httpsUrl(r.source_url), document: r.document, page: r.page || null, retrieved_on: r.retrieved_on || null });
  });
  return { errs, out };
}

export async function ingestManual() {
  const matcher = makeGeoMatcher(await loadDzongkhags());
  const read = async f => parseCsv(await readFile(resolve(DATA, 'manual', f), 'utf8').catch(() => ''));
  const b = buildBudget(await read('budget_by_agency.csv'));
  const a = buildAllocations(await read('allocations_by_location.csv'), matcher);
  const errs = [...b.errs.map(e => `budget_by_agency.csv ${e}`), ...a.errs.map(e => `allocations_by_location.csv ${e}`)];
  if (errs.length) throw new Error('Manual data rejected:\n  ' + errs.join('\n  '));
  const at = new Date().toISOString();
  await writeJson(resolve(DATA, 'budget.json'), { generated_at: at, records: b.out });
  await writeJson(resolve(DATA, 'allocations.json'), { generated_at: at, records: a.out });
  return { budget: b.out.length, allocations: a.out.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ingestManual().then(r => console.log('manual ingest ok', r), e => { console.error(e.message); process.exit(1); });
}
