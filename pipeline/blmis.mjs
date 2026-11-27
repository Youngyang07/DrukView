// Vacancy counts from the Bhutan Labour Market Information System (BLMIS), the national job portal run by
// the Ministry of Industry, Commerce and Employment (www.blmis.gov.bt).
//
// The job-seeker page is a Laravel Livewire component. Observed against the live portal on 2026-11-27:
//
//   GET /jobseeker_page/mispage  →  one element carries wire:initial-data="…", HTML-escaped JSON whose
//   serverMemo.data holds the page's "find a job by …" panels:
//
//     job_by_location       one row per dzongkhag with a listing
//     job_by_qualification  one row per minimum qualification
//     job_by_categories     one row per occupation
//     job_by_company        one row per employer
//
//   Each row is ONE representative listing plus `count_no`, the number of listings in that group. The four
//   panels group the same listings four ways, so their counts must sum to the same total (762 on the day
//   this was written). That agreement is what the validator checks.
//
// What this collector deliberately does NOT do:
//   * It does not read individual listings. They are behind a Livewire POST that this collector cannot make
//     reliably, and a count is what the portal publishes on the page itself.
//   * It does not claim the count is "open vacancies today". The portal does not say how it decides what to
//     list, and listings with old posting dates appear in it. The count is "listed on BLMIS on <date>".
//   * It does not read the overseas panel (job_by_oversea): those are jobs abroad, not in a dzongkhag.
//
// The parser is pure and tested against a captured page (tests/blmis.test.ts); the job is all-or-nothing.
import { UA } from './lib.mjs';

export const BASE = process.env.BLMIS_BASE || 'https://www.blmis.gov.bt';
export const PAGE_PATH = '/jobseeker_page/mispage';
/** Pinned to the real portal so a test or staging override can never be published as a citation. */
export const PUBLIC_URL = 'https://www.blmis.gov.bt/jobseeker_page/mispage';

export const SOURCE = {
  id: 'blmis',
  name: 'Bhutan Labour Market Information System (BLMIS) – Ministry of Industry, Commerce and Employment',
  url: PUBLIC_URL,
  kind: 'scrape',
  notes: 'How many vacancies the national job portal lists, by dzongkhag, minimum qualification, occupation and employer, read from the counts the portal\'s job-seeker page publishes. These are counts of listings, not a list of them, and the portal does not say how long a listing stays up, so the figure is "listed on BLMIS that day", not "open today". A run is rejected unless the four breakdowns add up to the same total.',
};

/** Panel → the dimension stored, and the field that names each row. */
export const PANELS = {
  job_by_location: ['dzongkhag', 'dzongkhag_name'],
  job_by_qualification: ['qualification', 'qualification'],
  job_by_categories: ['occupation', 'job_category'],
  job_by_company: ['employer', 'business_name'],
};

const ENT = { '&quot;': '"', '&#34;': '"', '&#039;': "'", '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' };
const unescapeAttr = s => s.replace(/&(?:quot|#34|#039|#39|apos|lt|gt|amp);/g, m => ENT[m]);

/** The job-seeker component's data, or null when the page does not carry it. */
export function livewireData(html) {
  for (const m of String(html ?? '').matchAll(/wire:initial-data="([^"]*)"/g)) {
    let d;
    try { d = JSON.parse(unescapeAttr(m[1])); } catch { continue; }
    const data = d?.serverMemo?.data;
    if (data && Object.keys(PANELS).every(k => k in data)) return data;
  }
  return null;
}

const label = v => (v == null || String(v).trim() === '' ? null : String(v).replace(/\s+/g, ' ').trim());

/**
 * The four breakdowns, each as [{label, count}] with rows of the same name merged (the portal groups by id,
 * and a few employers and occupations share a name). A row with no name is kept as label null, so its count
 * still adds up; the page shows it as "Not stated".
 */
export function parseBlmis(html) {
  const data = livewireData(html);
  if (!data) return null;
  const out = {};
  for (const [panel, [dim, field]] of Object.entries(PANELS)) {
    const rows = Array.isArray(data[panel]) ? data[panel] : [];
    const merged = new Map();
    for (const r of rows) {
      const k = label(r?.[field]);
      const n = Number(r?.count_no);
      merged.set(k, (merged.get(k) ?? 0) + (Number.isInteger(n) ? n : NaN));
    }
    out[dim] = [...merged].map(([l, count]) => ({ label: l, count })).sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
  }
  return out;
}

/** Attach dzongkhag ids to the dzongkhag breakdown and flatten everything into rows for storage. */
export function toCountRows(parsed, matcher, { fetchedAt = new Date().toISOString() } = {}) {
  const rows = [];
  for (const [dimension, list] of Object.entries(parsed)) {
    for (const { label: l, count } of list) {
      rows.push({ dimension, label: l, dzongkhag: dimension === 'dzongkhag' ? (matcher?.byName(l ?? '') ?? null) : null, count, fetched_at: fetchedAt });
    }
  }
  return rows;
}

/** Reject anything that does not look like the portal's panels, so a broken page never replaces good counts. */
export function validateBlmis(rows) {
  const errs = [];
  const dims = Object.values(PANELS).map(([d]) => d);
  const totals = {};
  for (const d of dims) {
    const list = rows.filter(r => r.dimension === d);
    if (!list.length) { errs.push(`the ${d} breakdown is missing`); continue; }
    for (const r of list) if (!Number.isInteger(r.count) || r.count < 0) errs.push(`${d} "${r.label}": count is not a whole number (${r.count})`);
    totals[d] = list.reduce((s, r) => s + r.count, 0);
  }
  const vals = Object.values(totals);
  if (vals.length === dims.length && new Set(vals).size !== 1) {
    errs.push(`the breakdowns disagree on the total (${dims.map(d => `${d} ${totals[d]}`).join(', ')})`);
  }
  if (vals.length && vals.every(v => v === 0)) errs.push('every breakdown is zero');
  for (const r of rows.filter(r => r.dimension === 'dzongkhag')) {
    if (!r.dzongkhag) errs.push(`dzongkhag "${r.label}" matches no dzongkhag`);
  }
  const ids = rows.filter(r => r.dimension === 'dzongkhag').map(r => r.dzongkhag).filter(Boolean);
  if (new Set(ids).size !== ids.length) errs.push('a dzongkhag appears twice');
  return errs;
}

/**
 * One GET of the job-seeker page. Measured on 2026-11-27, the portal took 19–30 s before sending its first
 * byte (the transfer itself is about 0.3 MB compressed and quick), so a retry cannot fit inside the job's
 * 50 s deadline: one attempt gets almost all of it. A miss leaves the previous counts and marks the source
 * stale, and the next daily run tries again.
 */
export async function fetchBlmis(matcher, { fetchedAt = new Date().toISOString(), timeoutMs = 45000, tries = 1 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}${PAGE_PATH}`, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseBlmis(await res.text());
      if (!parsed) throw new Error('the job-seeker page carried no vacancy panels (the page layout may have changed)');
      return { rows: toCountRows(parsed, matcher, { fetchedAt }), fetchedAt };
    } catch (e) {
      last = e;
      if (/vacancy panels/.test(e.message)) break; // a layout change will not fix itself on retry
      if (i < tries - 1) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error(`BLMIS job-seeker page: ${last?.message ?? last}${last?.cause?.code ? ` (${last.cause.code})` : ''}`);
}

/**
 * Whether a fresh read says exactly what is already stored. The portal's counts often stand still for hours,
 * and an hourly refresh should not rewrite an identical set.
 * @param {{ dimension: string, label: string | null, count: number }[]} a
 * @param {{ dimension: string, label: string | null, count: number }[]} b
 */
export function sameCounts(a, b) {
  const key = rows => rows.map(r => `${r.dimension}\u0000${r.label ?? ''}\u0000${r.count}`).sort().join('\n');
  return a.length === b.length && key(a) === key(b);
}
