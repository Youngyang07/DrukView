// Public tender notices from the Royal Government of Bhutan's e-GP portal (egp.gov.bt).
//
// e-GP publishes no API, no CSV and no feed. The public tender list is a JSP page whose results table is
// filled by a POST of its own search form, so a collector has to do what a browser does: take a session
// cookie from the listing page, then post the search form and read the rows out of the returned table.
//
// Verified against the live portal on 2026-10-11:
//   * GET  /resources/common/AdvTenderListing.jsp?h=t  → the search page, sets JSESSIONID, empty table
//   * POST the same URL with the search form           → the same page with <table id="resultTable"> filled
//   * /resources/common/ViewTenderNotice.jsp?tenderId= → a detail page, but only inside a live session
//     (a cold visit is bounced to SessionTimedOut.jsp), so a row cites the public listing page and carries
//     the e-GP tender ID and reference number, which is what a reader needs to find it there.
//
// Because the shape of that table is the whole contract, the parser is the tested part (tests/egp.test.ts
// runs it against a captured response) and the job is all-or-nothing: if the page comes back without a
// readable row, the run fails, the previous notices stay published and the source is marked stale. A
// layout change therefore shows up as a stale source, never as invented or half-read notices.
import { UA } from './lib.mjs';

export const BASE = process.env.EGP_BASE || 'https://www.egp.gov.bt';
export const LISTING_PATH = '/resources/common/AdvTenderListing.jsp?h=t';
/** What a row cites: the public, searchable tender list. Detail pages need a session of your own. This is
 *  deliberately the real portal and not `BASE`, so a test or staging override can never be published as a
 *  citation. */
export const PUBLIC_LISTING_URL = 'https://www.egp.gov.bt/resources/common/TenderListing.jsp?h=t';

export const SOURCE = {
  id: 'egp',
  name: 'e-GP – Electronic Government Procurement System, Royal Government of Bhutan',
  url: 'https://www.egp.gov.bt/resources/common/TenderListing.jsp?h=t',
  kind: 'scrape',
  notes: 'Live tender notices read from the public tender list of e-GP (Procurement Management and Development Division, Ministry of Finance). e-GP offers no API, so the published search page is read as a browser would; a run that cannot read the table fails and leaves the previous notices in place. Notice values are not published in the list, so no amount is shown.',
};

/** The search form's own fields, with the defaults the portal itself posts. Empty means "no filter". */
export const SEARCH_FIELDS = {
  txtdepartment: '', office: '', procNature: '', procType: '', procMethod: '', devpartner: '',
  tenderId: '', refNo: '', pubDtFrm: '', pubDtTo: '', closeDtFrm: '', closeDtTo: '', state: '', cpvCat: '',
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** e-GP prints "26-Oct-2026 14:00". → "2026-10-26" | null */
export function egpDate(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[2].toLowerCase()];
  if (!mo) return null;
  const d = Number(m[1]);
  if (d < 1 || d > 31) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const strip = s => String(s ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' }[m.toLowerCase()] ?? ' '))
  .replace(/\s+/g, ' ').trim();

/** Split a cell on its <br>s, which is how e-GP stacks two or three values into one column. */
const lines = html => String(html ?? '').split(/<br\s*\/?>/i).map(strip).filter(Boolean);

/**
 * Pull the data rows out of <table id="resultTable">. Returns raw cell text only — no interpretation —
 * so a change in the portal's wording cannot quietly become a wrong record.
 */
export function parseTenderRows(html) {
  const table = String(html ?? '').match(/<table[^>]*\bid=["']resultTable["'][\s\S]*?<\/table>/i);
  if (!table) return [];
  const rows = [];
  for (const m of table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1]);
    if (cells.length < 6) continue; // the header row has <th> only
    const [, idCell, titleCell, nodeCell, typeCell, dateCell] = cells;
    const ids = lines(idCell), cat = lines(titleCell), dates = lines(dateCell).join(' ').split('|');
    rows.push({
      tenderId: (ids[0] ?? '').replace(/,$/, '').trim(),
      reference: (ids[1] ?? '').replace(/,$/, '').trim() || null,
      amendments: Number(/issued\s*:\s*(\d+)/i.exec(ids.slice(2).join(' '))?.[1] ?? 0),
      category: (cat[0] ?? '').replace(/,$/, '').trim() || null,
      title: cat.slice(1).join(' ').trim(),
      hierarchy: lines(nodeCell).map(s => s.replace(/,$/, '')).filter(s => s && s.toLowerCase() !== 'root'),
      type: (lines(typeCell)[0] ?? '').replace(/,$/, '').trim() || null,
      method: (lines(typeCell)[1] ?? '').replace(/,$/, '').trim() || null,
      publishedText: (dates[0] ?? '').trim(),
      closingText: (dates[1] ?? '').trim(),
    });
  }
  return rows;
}

/**
 * Turn parsed cells into tender records. The dzongkhag is taken from the procuring agency's hierarchy
 * only — never from the title, where a place name may be the subject of the work rather than its owner —
 * and only when the hierarchy names exactly one dzongkhag; anything else stays national.
 */
export function toTenders(parsed, matcher, { fetchedAt = new Date().toISOString(), status = 'live' } = {}) {
  const retrieved = fetchedAt.slice(0, 10);
  return parsed.map(r => {
    const hierarchy = r.hierarchy.join(' · ');
    const hits = matcher ? matcher.findAll(hierarchy) : [];
    return {
      id: `egp-${r.tenderId}`,
      source: SOURCE.id,
      tender_id: r.tenderId,
      reference: r.reference,
      dzongkhag: hits.length === 1 ? hits[0] : null,
      title: r.title,
      agency: r.hierarchy[r.hierarchy.length - 1] ?? null,
      hierarchy: hierarchy || null,
      category: r.category,
      type: r.type,
      method: r.method,
      amendments: Number.isFinite(r.amendments) ? r.amendments : 0,
      value: null, currency: null, // e-GP does not publish an estimated value in the tender list
      published_on: egpDate(r.publishedText),
      closing_on: egpDate(r.closingText),
      status,
      url: PUBLIC_LISTING_URL,
      source_name: SOURCE.name,
      retrieved_on: retrieved,
    };
  });
}

/** Reject anything that does not look like a tender list, so a broken page can never overwrite good rows. */
export function validateTenders(rows) {
  const errs = [];
  if (!rows.length) errs.push('the tender list came back with no readable rows');
  const seen = new Set();
  for (const r of rows) {
    const who = r.tender_id ? `tender ${r.tender_id}` : 'a row';
    if (!/^\d+$/.test(r.tender_id ?? '')) errs.push(`${who}: no numeric e-GP tender ID`);
    if (!r.title) errs.push(`${who}: no title`);
    if (!r.published_on) errs.push(`${who}: publishing date could not be read`);
    if (!r.closing_on) errs.push(`${who}: closing date could not be read`);
    if (r.published_on && r.closing_on && r.closing_on < r.published_on) errs.push(`${who}: closes (${r.closing_on}) before it was published (${r.published_on})`);
    if (seen.has(r.id)) errs.push(`${who}: appears twice`);
    seen.add(r.id);
  }
  return errs;
}

const cookiesFrom = res => (res.headers.getSetCookie?.() ?? [])
  .map(c => c.split(';')[0]).filter(Boolean).join('; ');

/**
 * Read the live tender list. One session, then one POST per page, stopping at `maxPages` so the job stays
 * well inside a serverless time limit. The POST is what the portal's own Search button sends; if it comes
 * back without a table (a redesign, or a session that was refused) the caller's validation fails the run.
 */
export async function fetchEgpTenders(matcher, { fetchedAt = new Date().toISOString(), pageSize = 20, maxPages = 3, timeoutMs = 15000 } = {}) {
  const url = `${BASE}${LISTING_PATH}`;
  const headers = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' };
  const first = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!first.ok) throw new Error(`HTTP ${first.status} for the e-GP tender list`);
  const cookie = cookiesFrom(first);

  const parsed = [];
  for (let page = 1; page <= maxPages; page++) {
    const body = new URLSearchParams({ ...SEARCH_FIELDS, size: String(pageSize), dispPage: String(page), pageNo: String(page) });
    const res = await fetch(url, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}), referer: url },
      body, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for e-GP tender list page ${page}`);
    const rows = parseTenderRows(await res.text());
    if (!rows.length) break;
    const before = parsed.length;
    for (const r of rows) if (!parsed.some(p => p.tenderId === r.tenderId)) parsed.push(r);
    if (parsed.length === before || rows.length < pageSize) break; // last page, or the portal ignored our paging
  }
  const rows = toTenders(parsed, matcher, { fetchedAt });
  return { rows, fetchedAt };
}

/** Does the portal answer at all? Used by the Data sources page diagnostics. */
export const pingEgp = () => fetch(`${BASE}${LISTING_PATH}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) })
  .then(r => r.ok, () => false);
