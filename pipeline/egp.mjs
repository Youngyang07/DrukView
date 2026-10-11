// Public tender notices from the Royal Government of Bhutan's e-GP portal (egp.gov.bt).
//
// e-GP publishes no API, no CSV and no feed. Its tender page is a shell: the rows are fetched by the page's
// own script and inserted into the results table. The request was observed against the live portal on
// 2026-10-11 (an earlier version of this file guessed at it and fetched nothing — see docs/adr/0002):
//
//   1. GET  /resources/common/AdvTenderListing.jsp?h=t   → sets JSESSIONID; the table is empty at this point
//   2. POST /TenderDetailsServlet                        → funName=AllTenders + the search form's fields,
//      with that cookie, returns a bare run of <tr> rows (no <table> wrapper), then
//      <input id="cntTenBrief"> (rows in this page) and <input id="totalPages">
//   3. /resources/common/ViewNotice.jsp?id=<tenderId>&h=t is each notice's own page, and it opens with no
//      session at all — so every row can cite the notice itself rather than a search page.
//
// Two things the portal does that the data must respect:
//   * `viewType=Live` is only the name of the default tab. The response is the whole register, newest first
//     (731 pages of 20 on 2026-10-11, so ~14,600 notices), and it includes rows the portal itself labels
//     Cancelled. So this reads the newest few pages, and each row keeps the portal's own status word
//     verbatim instead of a status inferred from which tab it came from.
//   * The list carries no estimated value, so no amount is recorded.
//
// The parser is the tested part (tests/egp.test.ts runs it against a captured response) and the job is
// all-or-nothing: a response without a readable row fails the run, the previous notices stay published and
// the source is marked stale. A layout change therefore shows up as a stale source, never as invented rows.
import { UA } from './lib.mjs';

export const BASE = process.env.EGP_BASE || 'https://www.egp.gov.bt';
/** Visited first, for a session cookie. */
export const LISTING_PATH = '/resources/common/AdvTenderListing.jsp?h=t';
/** Where the rows actually come from. */
export const SERVLET_PATH = '/TenderDetailsServlet';
/** A notice's own page. Pinned to the real portal so a test or staging override cannot be published as a
 *  citation. */
export const noticeUrl = id => `https://www.egp.gov.bt/resources/common/ViewNotice.jsp?id=${encodeURIComponent(id)}&h=t`;
export const PUBLIC_LISTING_URL = 'https://www.egp.gov.bt/resources/common/TenderListing.jsp?h=t';

export const SOURCE = {
  id: 'egp',
  name: 'e-GP – Electronic Government Procurement System, Royal Government of Bhutan',
  url: PUBLIC_LISTING_URL,
  kind: 'scrape',
  notes: 'Tender notices from the public register of e-GP (Procurement Management and Development Division, Ministry of Finance). e-GP offers no API, so the page\'s own row request is made directly and each notice links to its own e-GP page. The newest notices are read, not the whole register (about 14,600 notices on 2026-10-11); a notice keeps the status word e-GP prints for it, and no amount is shown because the register publishes none. A run that cannot read the rows fails and leaves the previous notices in place.',
};

/** The search form's fields, with the values the portal's own script sends for an unfiltered search. */
export const SEARCH_FIELDS = {
  funName: 'AllTenders', viewType: 'Live', departmentId: '0', office: '', procNature: '', procType: '',
  procMethod: '0', tenderId: '0', refNo: '', pubDtFrm: '', pubDtTo: '', closeDtFrm: '', closeDtTo: '',
  cpvCategory: '', h: 't', district: '0', thana: '', devpartner: '',
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

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ', '&#39;': "'" };
const strip = s => String(s ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, m => ENT[m.toLowerCase()] ?? ' ')
  .replace(/\s+/g, ' ').trim();

/** Split a cell on its <br>s, which is how e-GP stacks two or three values into one column. */
const lines = html => String(html ?? '').split(/<br\s*\/?>/i).map(strip).filter(Boolean);
const trimComma = s => String(s ?? '').replace(/,$/, '').trim();

/**
 * Pull the data rows out of the servlet's response. Accepts the bare <tr> run the servlet returns, and also
 * a full <table id="resultTable"> in case the portal ever wraps it. Returns raw cell text only — no
 * interpretation — so a change in the portal's wording cannot quietly become a wrong record.
 */
export function parseTenderRows(html) {
  const s = String(html ?? '');
  const table = s.match(/<table[^>]*\bid=["']resultTable["'][\s\S]*?<\/table>/i);
  const scope = table ? table[0] : s;
  const rows = [];
  for (const m of scope.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1]);
    if (cells.length < 6) continue; // a header row carries <th> only
    const [, idCell, titleCell, nodeCell, typeCell, dateCell] = cells;
    const ids = lines(idCell), cat = lines(titleCell), dates = lines(dateCell).join(' ').split('|');
    const note = ids.slice(2).join(' ');
    rows.push({
      tenderId: trimComma(ids[0]),
      reference: trimComma(ids[1]) || null,
      // e-GP prints either its status word ("Live", "Cancelled") or an amendment notice in this spot.
      statusText: /issued\s*:/i.test(note) ? null : (note || null),
      amendments: Number(/issued\s*:\s*(\d+)/i.exec(note)?.[1] ?? 0),
      noticeId: /ViewNotice\.jsp\?id=(\d+)/i.exec(titleCell)?.[1] ?? null,
      category: trimComma(cat[0]) || null,
      title: cat.slice(1).join(' ').trim(),
      hierarchy: lines(nodeCell).map(trimComma).filter(n => n && n.toLowerCase() !== 'root'),
      type: trimComma(lines(typeCell)[0]) || null,
      method: trimComma(lines(typeCell)[1]) || null,
      publishedText: (dates[0] ?? '').trim(),
      closingText: (dates[1] ?? '').trim(),
    });
  }
  return rows;
}

/** How many pages the register has, as the response reports it. */
export const totalPages = html => {
  const m = String(html ?? '').match(/id=["']totalPages["']\s+value=["'](\d+)["']/i);
  return m ? Number(m[1]) : null;
};

/**
 * Turn parsed cells into tender records. The dzongkhag is taken from the procuring agency's hierarchy only —
 * never from the title, where a place name is usually where the work is rather than who is buying it — and
 * only when the hierarchy names exactly one; anything else stays national.
 */
export function toTenders(parsed, matcher, { fetchedAt = new Date().toISOString() } = {}) {
  const retrieved = fetchedAt.slice(0, 10);
  return parsed.map(r => {
    const hierarchy = r.hierarchy.join(' · ');
    const hits = matcher ? matcher.findAll(hierarchy) : [];
    const id = r.noticeId ?? r.tenderId;
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
      value: null, currency: null, // the register publishes no estimated value
      published_on: egpDate(r.publishedText),
      closing_on: egpDate(r.closingText),
      status: r.statusText, // e-GP's own word for it, or null when the cell carried an amendment notice
      url: noticeUrl(id),
      source_name: SOURCE.name,
      retrieved_on: retrieved,
    };
  });
}

/** Reject anything that does not look like the register, so a broken page can never overwrite good rows. */
export function validateTenders(rows) {
  const errs = [];
  if (!rows.length) errs.push('the tender register came back with no readable rows');
  const seen = new Set();
  for (const r of rows) {
    const who = r.tender_id ? `tender ${r.tender_id}` : 'a row';
    if (!/^\d+$/.test(r.tender_id ?? '')) errs.push(`${who}: no numeric e-GP tender ID`);
    if (!r.title) errs.push(`${who}: no title`);
    if (!/^https:\/\/www\.egp\.gov\.bt\//.test(r.url ?? '')) errs.push(`${who}: citation is not an e-GP URL`);
    if (!r.published_on) errs.push(`${who}: publishing date could not be read`);
    if (!r.closing_on) errs.push(`${who}: closing date could not be read`);
    if (r.published_on && r.closing_on && r.closing_on < r.published_on) errs.push(`${who}: closes (${r.closing_on}) before it was published (${r.published_on})`);
    if (seen.has(r.id)) errs.push(`${who}: appears twice`);
    seen.add(r.id);
  }
  return errs;
}

const cookiesFrom = res => (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).filter(Boolean).join('; ');

/**
 * Read the newest notices: one session, then one POST per page. `maxPages` keeps the job well inside a
 * serverless time limit — the register is far too large to mirror, and the newest pages are what a reader
 * needs. A page that returns nothing stops the loop.
 */
export async function fetchEgpTenders(matcher, { fetchedAt = new Date().toISOString(), pageSize = 20, maxPages = 3, timeoutMs = 15000 } = {}) {
  const headers = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' };
  const listing = `${BASE}${LISTING_PATH}`;
  const first = await fetch(listing, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!first.ok) throw new Error(`HTTP ${first.status} for the e-GP tender page`);
  const cookie = cookiesFrom(first);

  const parsed = [];
  let pages = null;
  for (let page = 1; page <= maxPages; page++) {
    const body = new URLSearchParams({ ...SEARCH_FIELDS, pageNo: String(page), size: String(pageSize) });
    const res = await fetch(`${BASE}${SERVLET_PATH}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', referer: listing, ...(cookie ? { cookie } : {}) },
      body, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for e-GP tender page ${page}`);
    const html = await res.text();
    pages ??= totalPages(html);
    const rows = parseTenderRows(html);
    if (!rows.length) break;
    for (const r of rows) if (!parsed.some(p => p.tenderId === r.tenderId)) parsed.push(r);
    if (pages && page >= pages) break;
  }
  return { rows: toTenders(parsed, matcher, { fetchedAt }), fetchedAt, registerPages: pages };
}

/** Does the portal answer at all? Used by the Data sources page diagnostics. */
export const pingEgp = () => fetch(`${BASE}${LISTING_PATH}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) })
  .then(r => r.ok, () => false);
