// Pure CSV parsing/validation (DB writes live in src/server/ingest.ts).
// Ministry of Finance, Home & Cultural Affairs, Agriculture & Livestock and other RGoB budget documents are
// published as PDFs/Excel without an API. They enter DrukView through citation-checked CSVs in data/manual/.
// Every row MUST carry a source_url (https) and document name so each Ngultrum can be traced to a public document.
import { parseAmount, httpsUrl } from './lib.mjs';

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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const optDate = (v, k, n, errs) => { if (v && !DATE.test(v)) errs.push(`row ${n}: ${k} must be YYYY-MM-DD`); return v || null; };

export function buildTenders(rows, matcher) {
  const errs = [], out = [];
  rows.forEach((r, i) => {
    const n = i + 2; need(r, ['id', 'title', 'url', 'source_name'], errs, n);
    if (r.url && !httpsUrl(r.url)) errs.push(`row ${n}: url must be https`);
    let dz = null; if (r.dzongkhag) { dz = matcher.byName(r.dzongkhag); if (!dz) errs.push(`row ${n}: unknown dzongkhag "${r.dzongkhag}"`); }
    if (r.value && parseAmount(r.value) === null) errs.push(`row ${n}: value is not a number`);
    if (r.value && !/^[A-Z]{3}$/.test(r.currency)) errs.push(`row ${n}: value needs ISO currency`);
    out.push({ id: r.id, dzongkhag: dz, title: r.title, agency: r.agency || null, category: r.category || null, value: parseAmount(r.value), currency: r.currency || null,
      published_on: optDate(r.published_on, 'published_on', n, errs), closing_on: optDate(r.closing_on, 'closing_on', n, errs), status: r.status || null,
      url: httpsUrl(r.url), source_name: r.source_name, retrieved_on: optDate(r.retrieved_on, 'retrieved_on', n, errs) });
  });
  return { errs, out };
}

export function buildOffices(rows, matcher) {
  const errs = [], out = [];
  rows.forEach((r, i) => {
    const n = i + 2; need(r, ['kind', 'name', 'source_name', 'source_url'], errs, n);
    if (r.kind && !['leader', 'office'].includes(r.kind)) errs.push(`row ${n}: kind must be leader or office`);
    if (r.source_url && !httpsUrl(r.source_url)) errs.push(`row ${n}: source_url must be https`);
    let dz = null; if (r.dzongkhag) { dz = matcher.byName(r.dzongkhag); if (!dz) errs.push(`row ${n}: unknown dzongkhag "${r.dzongkhag}"`); }
    out.push({ dzongkhag: dz, kind: r.kind, name: r.name, role: r.role || null, contact: r.contact || null, source_name: r.source_name, source_url: httpsUrl(r.source_url), retrieved_on: optDate(r.retrieved_on, 'retrieved_on', n, errs) });
  });
  return { errs, out };
}
