// Elected leaders, refreshed from Parliament of Bhutan's own public content API.
//
// Verified live on 2026-10-11: /api/na-members and /api/nc-members return Strapi-style
// {data:[{name,dzongkhag,designation,constituency,parliament,start,end}], meta:{pagination}}.
// The 4th Parliament returns exactly 47 National Assembly members and 25 National Council
// members (20 elected, one per dzongkhag, plus 5 eminent members appointed by His Majesty).
//
// Names are only ever taken from Parliament. News feeds are read separately (news.mjs) and can
// only raise a "check this" flag — they never supply or change a name.
import { fetchJson, fetchWithRetry } from './lib.mjs';

export const PARLIAMENT_API = process.env.PARLIAMENT_API || 'https://cms.parliament.gov.bt/api';

export const SOURCE = {
  id: 'parliament',
  name: 'Parliament of Bhutan – National Assembly and National Council members',
  url: 'https://nab.parliament.gov.bt/current-members',
  kind: 'api',
  notes: 'Members of the current Parliament, read from Parliament\'s public member records. A refresh is rejected unless it returns a complete House (47 National Assembly seats with the constitutional split, and one elected National Council member per dzongkhag), so a partial or broken response can never overwrite a good list.',
};

/** Designation code in the API → the title shown on the site. */
export const ROLE = {
  'prime-minister': 'Prime Minister',
  minister: 'Minister',
  speaker: 'Speaker',
  'deputy-speaker': 'Deputy Speaker',
  'leader-of-opposition': 'Leader of the Opposition',
  'member-of-parliament': 'Member of Parliament',
  chairperson: 'Chairperson',
  'deputy-chairperson': 'Deputy Chairperson',
  member: 'Member',
  'eminent-member': 'Eminent Member (appointed by His Majesty)',
};
const NA_DEFAULT_ROLE = 'Member of Parliament';
const NC_DEFAULT_ROLE = 'Member';

/**
 * National Assembly seats per dzongkhag, fixed by the constituency delimitation: every dzongkhag has at
 * least two, and the larger ones more. Keyed by slug so it cannot drift from the dzongkhag id scheme.
 */
export const NA_SEATS = {
  bumthang: 2, chukha: 2, dagana: 2, gasa: 2, haa: 2, lhuntse: 2, mongar: 3, paro: 2, pemagatshel: 3,
  punakha: 2, 'samdrup-jongkhar': 2, samtse: 4, sarpang: 2, thimphu: 2, trashigang: 5, trashiyangtse: 2,
  trongsa: 2, tsirang: 2, 'wangdue-phodrang': 2, zhemgang: 2,
};
export const NA_TOTAL = 47;
export const NC_ELECTED = 20;

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
/** Parliament spells several dzongkhags its own way ("Monggar", "ha", "Pema Gatshel"). */
const EXTRA = { ha: 'haa', monggar: 'mongar', mongger: 'mongar', monger: 'mongar', chhukha: 'chukha', lhuentse: 'lhuntse', pemagatshel: 'pemagatshel', pemagaschel: 'pemagatshel', tashiyangtse: 'trashiyangtse', trashiyangtse: 'trashiyangtse', samdrupjongkhar: 'samdrupjongkhar', wangduephodrang: 'wangduephodrang' };

/** Build text → dzongkhag id lookup from the seeded dzongkhag list (id, name, slug, aliases). */
export function dzLookup(dzongkhags) {
  const byText = new Map();
  for (const d of dzongkhags) {
    for (const t of [d.name, d.slug, ...(d.aliases ?? [])]) byText.set(norm(t), d);
  }
  return text => {
    const n = norm(text);
    if (!n) return null;
    return byText.get(n) ?? byText.get(norm(EXTRA[n])) ?? null;
  };
}

/** "Kabisa_Talog" / "Menbi -Tsenkhar" / "Nanong_shumar" → "Kabisa-Talog" / "Menbi-Tsenkhar" / "Nanong-Shumar" */
export function tidyConstituency(c) {
  if (!c) return null;
  const parts = String(c).replace(/[_\s]*-[_\s]*/g, '-').replace(/[_\s]+/g, '-').split('-').filter(Boolean);
  if (!parts.length) return null;
  return parts.map(w => w[0].toUpperCase() + w.slice(1)).join('-');
}

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// The two endpoints do not carry the same columns: nc-members has no `constituency` and rejects the
// whole request with a 400 if it is asked for, so each resource names its own fields.
export const FIELDS = {
  'na-members': ['name', 'dzongkhag', 'designation', 'constituency', 'parliament', 'start', 'end'],
  'nc-members': ['name', 'dzongkhag', 'designation', 'parliament', 'start', 'end'],
};

async function fetchAll(resource) {
  const out = [];
  const fields = FIELDS[resource].map((f, i) => `&fields[${i}]=${f}`).join('');
  for (let page = 1; page <= 4; page++) {
    const url = `${PARLIAMENT_API}/${resource}?pagination[page]=${page}&pagination[pageSize]=100` + fields;
    const body = await fetchJson(url);
    const rows = Array.isArray(body?.data) ? body.data : [];
    out.push(...rows);
    const p = body?.meta?.pagination;
    if (!p || !p.pageCount || page >= p.pageCount) break;
  }
  return out;
}

/** Highest-numbered parliament that looks like a full National Assembly — so this keeps working after the next election. */
export function currentParliament(naRows) {
  const byTerm = new Map();
  for (const r of naRows) {
    const key = clean(r.parliament);
    if (!key) continue;
    byTerm.set(key, (byTerm.get(key) ?? 0) + 1);
  }
  const full = [...byTerm.entries()].filter(([, n]) => n >= 40);
  if (!full.length) throw new Error(`no parliament in the member records has a full National Assembly (largest: ${Math.max(0, ...byTerm.values())} members)`);
  full.sort((a, b) => (Number(a[0].match(/\d+/)?.[0] ?? 0) - Number(b[0].match(/\d+/)?.[0] ?? 0)));
  return full[full.length - 1][0];
}

function toRow(house, r, toDz, fetchedAt, parliament) {
  const name = clean(r.name);
  const designation = clean(r.designation);
  const role = ROLE[designation] || (house === 'na' ? NA_DEFAULT_ROLE : NC_DEFAULT_ROLE);
  const eminent = designation === 'eminent-member';
  const dz = eminent ? null : toDz(r.dzongkhag);
  return {
    house, name, role,
    constituency: house === 'na' ? tidyConstituency(r.constituency) : null,
    dzongkhag: dz?.id ?? null,
    dzongkhag_slug: dz?.slug ?? null,
    dzongkhag_text: clean(r.dzongkhag) || null,
    eminent,
    parliament,
    term_start: clean(r.start) || null,
    term_end: clean(r.end) || null,
    source_name: SOURCE.name,
    source_url: house === 'na' ? 'https://nab.parliament.gov.bt/current-members' : 'https://ncb.parliament.gov.bt/',
    fetched_at: fetchedAt,
  };
}

/**
 * Fetch the current Parliament's members.
 * @param dzongkhags rows of {id, name, slug, aliases}
 */
export async function fetchLeaders(dzongkhags, { fetchedAt = new Date().toISOString() } = {}) {
  const toDz = dzLookup(dzongkhags);
  const [naAll, ncAll] = await Promise.all([fetchAll('na-members'), fetchAll('nc-members')]);
  const parliament = currentParliament(naAll);
  const na = naAll.filter(r => clean(r.parliament) === parliament).map(r => toRow('na', r, toDz, fetchedAt, parliament));
  const nc = ncAll.filter(r => clean(r.parliament) === parliament).map(r => toRow('nc', r, toDz, fetchedAt, parliament));
  return { parliament, rows: [...na, ...nc] };
}

/**
 * Reject anything that is not a complete Parliament. Returning fewer seats than the Constitution
 * provides means the source is broken or mid-edit; we keep the previous list rather than publish a gap.
 */
export function validateLeaders(rows, seats = NA_SEATS) {
  const errs = [];
  const na = rows.filter(r => r.house === 'na'), nc = rows.filter(r => r.house === 'nc');
  if (na.length !== NA_TOTAL) errs.push(`expected ${NA_TOTAL} National Assembly members, got ${na.length}`);

  for (const r of rows) {
    if (!r.name) errs.push(`${r.house}: a member has no name`);
    if (!r.eminent && !r.dzongkhag) errs.push(`${r.house}: no dzongkhag matched for "${r.name}" (source said "${r.dzongkhag_text ?? ''}")`);
    if (r.house === 'na' && !r.constituency) errs.push(`na: no constituency for "${r.name}"`);
  }
  const cons = na.map(r => r.constituency).filter(Boolean);
  const dupe = cons.find((c, i) => cons.indexOf(c) !== i);
  if (dupe) errs.push(`two National Assembly members share the constituency "${dupe}"`);

  const naBy = {};
  for (const r of na) if (r.dzongkhag_slug) naBy[r.dzongkhag_slug] = (naBy[r.dzongkhag_slug] ?? 0) + 1;
  for (const [slug, n] of Object.entries(seats)) {
    if ((naBy[slug] ?? 0) !== n) errs.push(`${slug}: expected ${n} National Assembly seats, got ${naBy[slug] ?? 0}`);
  }

  const elected = nc.filter(r => !r.eminent);
  if (elected.length !== NC_ELECTED) errs.push(`expected ${NC_ELECTED} elected National Council members, got ${elected.length}`);
  const ncBy = {};
  for (const r of elected) ncBy[r.dzongkhag_slug] = (ncBy[r.dzongkhag_slug] ?? 0) + 1;
  for (const slug of Object.keys(seats)) if ((ncBy[slug] ?? 0) !== 1) errs.push(`${slug}: expected 1 elected National Council member, got ${ncBy[slug] ?? 0}`);

  return errs;
}

/** Does the Parliament API answer at all? Used by the Data sources page diagnostics. */
export const pingParliament = () => fetchWithRetry(`${PARLIAMENT_API}/na-members?pagination[pageSize]=1`, { retries: 0, timeoutMs: 8000 }).then(() => true, () => false);
