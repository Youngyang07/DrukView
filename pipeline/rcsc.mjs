// Civil-service vacancies from the Royal Civil Service Commission's Zhiyog Recruitment System
// (jobs.rcsc.gov.bt).
//
// The vacancy page is an ASP.NET shell whose list is filled by its own script. The requests were observed
// against the live site on 2026-11-27:
//
//   1. GET  /Application/Vacancy                     → sets the session and antiforgery cookies
//   2. GET  /AgencyCommon/Get…Data                   → the filter lists the page builds its dropdowns from
//   3. POST /Application/GetVacancyAnnouncement      → a JSON array of announcements, one page at a time;
//      every row repeats `totaL_ROW_COUNT`, the number of announcements matching the filters
//   4. /Application/VacancyDetail/<agencyID>/<recruitmentID> is each announcement's own page
//
// An empty filter does NOT mean "everything": with Condition02–05 blank the endpoint returns []. The page
// sends every option of every dropdown, as a comma-terminated list, and so does this collector — the lists
// are read from step 2 each run rather than pinned, so an agency group or dzongkhag the Commission adds is
// included rather than silently filtered out.
//
// What the data must respect:
//   * Pay is the position's pay scale in ngultrum per month, as the Commission prints it. It is never
//     converted, and never summed into anything else.
//   * A vacancy's place is the Commission's own location flags. An announcement open in several dzongkhags
//     is listed in each; one with no flag set is not given a place.
//   * The site publishes no closed announcements in this list, so what is read is what is open.
//
// The parser is pure and tested against a captured response (tests/rcsc.test.ts); the job is all-or-nothing,
// so a response that does not look like the list fails the run and the previous vacancies stay published.
import { createHash } from 'node:crypto';
import { UA } from './lib.mjs';

export const BASE = process.env.RCSC_BASE || 'https://jobs.rcsc.gov.bt';
export const PAGE_PATH = '/Application/Vacancy';
export const LIST_PATH = '/Application/GetVacancyAnnouncement';
/** Pinned to the real site so a test or staging override can never be published as a citation. */
export const PUBLIC_URL = 'https://jobs.rcsc.gov.bt/Application/Vacancy';
export const detailUrl = (agencyId, recruitmentId) =>
  `https://jobs.rcsc.gov.bt/Application/VacancyDetail/${encodeURIComponent(agencyId)}/${encodeURIComponent(recruitmentId)}`;

export const SOURCE = {
  id: 'rcsc',
  name: 'Zhiyog Recruitment System – Royal Civil Service Commission',
  url: PUBLIC_URL,
  kind: 'scrape',
  notes: 'Every civil-service vacancy announcement currently open, read from the Royal Civil Service Commission\'s Zhiyog Recruitment System through the page\'s own list request. Each row links to its announcement on Zhiyog. Pay is the position\'s monthly pay scale in ngultrum as printed. A run that cannot read the list fails and leaves the previous vacancies in place.',
};

/** The page's filter lists: endpoint → the field that carries the value the search expects. */
export const FILTERS = [
  ['GetSuperStructureData', 'superStructureID', 'Condition02'],
  ['GetEmploymentTypeData', 'employmentTypeCD', 'Condition03'],
  ['GetCategoryData', 'categoryCD', 'Condition04'],
  ['GetDzongkhagData', 'dzongkhagName', 'Condition05'],
];

/** The Commission's location flags, in its own order, with the name each stands for. */
export const LOCATION_FLAGS = {
  locHaa: 'Haa', locChukha: 'Chukha', locParo: 'Paro', locThimphu: 'Thimphu', locPunakha: 'Punakha', locGasa: 'Gasa',
  locWangduePhodrang: 'Wangdue Phodrang', locDagana: 'Dagana', locTrongsa: 'Trongsa', locBumthang: 'Bumthang',
  locZhemgang: 'Zhemgang', locLhuentse: 'Lhuentse', locMongar: 'Mongar', locTrashigang: 'Trashigang',
  locPemagatshel: 'Pemagatshel', locSamdrupjongkhar: 'Samdrupjongkhar', locSarpang: 'Sarpang', locTsirang: 'Tsirang',
  locSamtse: 'Samtse', locTrashiyangtse: 'Trashiyangtse',
};

/** The search form, as the page's script sends it for "all vacancies, newest first". */
export function searchBody(lists, { skip = 0, take = 10 } = {}) {
  const f = { IsSearch: 'true', Condition01: '' };
  for (const [, , cond] of FILTERS) f[cond] = (lists[cond] ?? []).map(v => `${v},`).join('');
  Object.assign(f, { Condition06: '', Condition07: '', Condition08: '', Condition09: 'false', Condition10: 'D', Condition11: String(skip), Condition12: String(take) });
  // jQuery posts `{ Condition: data }`, which it encodes as Condition[Field]=value.
  return new URLSearchParams(Object.entries(f).map(([k, v]) => [`Condition[${k}]`, v]));
}

/** "2026-12-09T00:00:00" → "2026-12-09" | null */
export const rcscDate = v => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

const clean = s => (s == null ? null : String(s).replace(/\s+/g, ' ').trim() || null);
const int = v => (Number.isInteger(v) ? v : (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null));

/** The announcement rows of one response. Anything that is not the expected array is no rows. */
export function parseRcscPage(json) {
  if (!Array.isArray(json)) return { rows: [], total: null };
  const rows = json.filter(r => r && typeof r === 'object');
  return { rows, total: int(rows[0]?.totaL_ROW_COUNT) };
}

/**
 * Turn announcement rows into records. Location ids come only from the Commission's flags, matched by name
 * against the dzongkhag list; a flag that matches no dzongkhag is reported by the validator, not dropped.
 * @param {any[]} raw
 * @param {{ byName(name: string): string | null } | null | undefined} matcher
 * @param {{ fetchedAt?: string }} [opts]
 */
export function toVacancies(raw, matcher, { fetchedAt = new Date().toISOString() } = {}) {
  return raw.map(r => {
    const places = Object.entries(LOCATION_FLAGS).filter(([k]) => r[k] === true).map(([, name]) => name);
    const ids = places.map(n => matcher?.byName(n) ?? null);
    const minPay = int(r.minPayScale), maxPay = int(r.maxPayScale);
    return {
      id: `rcsc-${r.agencyID}-${r.recruitmentID}`,
      agency_id: int(r.agencyID),
      recruitment_id: int(r.recruitmentID),
      title: clean(r.positionTitle) ?? clean(r.recruitmentName),
      announcement: clean(r.recruitmentName),
      position_level: clean(r.positionLevelName),
      agency: clean(r.agencyName),
      service: clean(r.superStructureName),
      employment_type: clean(r.employmentTypeName),
      category: clean(r.categoryName),
      qualification: /^n\/?a$/i.test(clean(r.qualificationName) ?? '') ? null : clean(r.qualificationName), // "na" is the form's blank
      slots: int(r.slots),
      pay_min: minPay, pay_max: maxPay, pay_currency: minPay != null || maxPay != null ? 'BTN' : null,
      published_on: rcscDate(r.vaPublishDate),
      closing_on: rcscDate(r.vaEndDate),
      reannounced: r.vaOldEndDate1 != null,
      applicants: int(r.applicantsCount),
      places,
      dzongkhags: ids,
      url: r.agencyID != null && r.recruitmentID != null ? detailUrl(r.agencyID, r.recruitmentID) : null,
      source_name: SOURCE.name,
      fetched_at: fetchedAt,
    };
  });
}

/**
 * Reject anything that does not look like the Commission's list, so a broken response never replaces good rows.
 * @param {any[]} rows
 * @param {{ total?: number | null }} [opts]
 */
export function validateRcsc(rows, { total = null } = {}) {
  const errs = [];
  if (total !== null && rows.length !== total) errs.push(`the list reports ${total} announcements but ${rows.length} were read`);
  const seen = new Set();
  for (const r of rows) {
    const who = r.title ? `"${r.title}" (${r.id})` : r.id;
    if (r.agency_id == null || r.recruitment_id == null) errs.push(`${who}: no agency or recruitment number`);
    if (!r.title) errs.push(`${who}: no position title`);
    if (!r.agency) errs.push(`${who}: no agency`);
    if (!/^https:\/\/jobs\.rcsc\.gov\.bt\//.test(r.url ?? '')) errs.push(`${who}: citation is not a Zhiyog URL`);
    if (!r.published_on) errs.push(`${who}: publishing date could not be read`);
    if (!r.closing_on) errs.push(`${who}: closing date could not be read`);
    if (r.published_on && r.closing_on && r.closing_on < r.published_on) errs.push(`${who}: closes (${r.closing_on}) before it was published (${r.published_on})`);
    if (r.slots == null || r.slots < 1) errs.push(`${who}: no number of posts`);
    if (r.pay_min != null && r.pay_max != null && r.pay_max < r.pay_min) errs.push(`${who}: pay scale runs backwards (${r.pay_min}–${r.pay_max})`);
    r.dzongkhags.forEach((id, i) => { if (!id) errs.push(`${who}: location "${r.places[i]}" matches no dzongkhag`); });
    if (seen.has(r.id)) errs.push(`${who}: appears twice`);
    seen.add(r.id);
  }
  return errs;
}

const cookiesFrom = res => (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).filter(Boolean);

/** fetch with a few retries: the site intermittently drops connections mid-response. */
async function attempt(fn, what, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; if (i < tries - 1) await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
  throw new Error(`${what}: ${last?.message ?? last}${last?.cause?.code ? ` (${last.cause.code})` : ''}`);
}

/**
 * Read every open announcement: one session, the four filter lists, then pages of `take` until the list's
 * own row count is reached. `maxPages` is a ceiling so an unexpected count cannot run past the job deadline.
 */
export async function fetchRcscVacancies(matcher, { fetchedAt = new Date().toISOString(), take = 50, maxPages = 10, timeoutMs = 12000 } = {}) {
  const page = `${BASE}${PAGE_PATH}`;
  const base = { 'user-agent': UA };
  const jar = new Map();
  const keep = res => { for (const c of cookiesFrom(res)) { const i = c.indexOf('='); jar.set(c.slice(0, i), c.slice(i + 1)); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

  await attempt(async () => {
    const res = await fetch(page, { headers: { ...base, accept: 'text/html' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    keep(res); await res.text();
  }, 'Zhiyog vacancy page');

  const xhr = { ...base, accept: 'application/json, text/javascript, */*; q=0.01', 'x-requested-with': 'XMLHttpRequest', referer: page };
  const lists = {};
  for (const [endpoint, field, cond] of FILTERS) {
    const items = await attempt(async () => {
      const res = await fetch(`${BASE}/AgencyCommon/${endpoint}`, { headers: { ...xhr, cookie: cookie() }, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      keep(res); return res.json();
    }, `Zhiyog filter list ${endpoint}`);
    const values = Array.isArray(items) ? items.map(x => x?.[field]).filter(v => v != null && v !== '') : [];
    if (!values.length) throw new Error(`Zhiyog filter list ${endpoint} came back empty, so the search would match nothing`);
    lists[cond] = values;
  }

  const raw = [];
  let total = null;
  for (let p = 0; p < maxPages; p++) {
    const { rows, total: t } = await attempt(async () => {
      const res = await fetch(`${BASE}${LIST_PATH}`, {
        method: 'POST', headers: { ...xhr, 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', cookie: cookie() },
        body: searchBody(lists, { skip: p * take, take }), signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      keep(res); return parseRcscPage(await res.json());
    }, `Zhiyog vacancy list page ${p + 1}`);
    total ??= t;
    for (const r of rows) if (!raw.some(x => x.agencyID === r.agencyID && x.recruitmentID === r.recruitmentID)) raw.push(r);
    if (!rows.length || (total !== null && raw.length >= total)) break;
  }
  return { rows: toVacancies(raw, matcher, { fetchedAt }), total: total ?? 0, fetchedAt };
}

/**
 * What a vacancy says, as a fingerprint. Applicant counts and the read time are left out: they move every
 * hour without the vacancy itself changing, and would otherwise turn every refresh into an update.
 * @param {any} v
 */
export function vacancyHash(v) {
  const { fetched_at, applicants, ...content } = v; // eslint-disable-line no-unused-vars
  return createHash('sha256').update(JSON.stringify(content, Object.keys(content).sort())).digest('hex');
}

/**
 * Compare a fresh read with what is stored, by the Commission's own announcement id. A vacancy is added
 * once, updated only when what it says has changed, and removed when Zhiyog no longer lists it; the rest
 * are left untouched. Incoming duplicates of one id collapse to the first.
 * @param {Map<string, string>} stored  id -> content hash
 * @param {any[]} incoming
 */
export function diffVacancies(stored, incoming) {
  const seen = new Set(), added = [], changed = [], unchanged = [];
  for (const v of incoming) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    const hash = vacancyHash(v);
    const before = stored.get(v.id);
    if (before === undefined) added.push({ ...v, hash });
    else if (before !== hash) changed.push({ ...v, hash });
    else unchanged.push(v.id);
  }
  const removed = [...stored.keys()].filter(id => !seen.has(id));
  return { added, changed, unchanged, removed };
}
