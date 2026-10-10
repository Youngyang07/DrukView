import { XMLParser } from 'fast-xml-parser';
import { fetchText, parseAmount, isoDate, resolveLocations } from './lib.mjs';

const arr = v => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const narrative = n => {
  const first = arr(n?.narrative)[0];
  if (first === undefined) return typeof n === 'string' ? n : '';
  return String(typeof first === 'object' ? first['#text'] ?? '' : first).trim();
};

// IATI activity-status codes. 3 = "Finalisation": physical work done, only financial closing left. ADB's own project page
// shows such projects as "Closed" (verified against adb.org/projects/39221-022), so it maps to completed, not active.
const STATUS = { 1: 'pipeline', 2: 'active', 3: 'completed', 4: 'completed', 5: 'cancelled', 6: 'suspended' };
const STATUS_RANK = ['active', 'pipeline', 'suspended', 'completed', 'cancelled', 'unknown'];
const GEO_RANK = ['location-field', 'text-match', 'none'];
const best = (list, order) => order.find(o => list.includes(o)) ?? order[order.length - 1];

/** Merge several activities (e.g. the separate loans/grants of one project) into one project record. Same-currency only. */
function mergeGroup(rows, key, { sourceId, projectUrl }) {
  if (rows.length === 1 && !projectUrl) return rows;
  if (new Set(rows.map(r => r.currency)).size > 1) return rows; // never add different currencies
  const sum = k => { const v = rows.map(r => r[k]).filter(x => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const dates = k => rows.map(r => r[k]).filter(Boolean).sort();
  const seen = new Set(), locations = [];
  for (const l of rows.flatMap(r => r.locations)) if (!seen.has(l.dzongkhag)) { seen.add(l.dzongkhag); locations.push(l); }
  const first = rows[0];
  return [{
    ...first,
    id: `${sourceId}:${key}`,
    description: rows.map(r => r.description).find(Boolean) ?? '',
    status: best(rows.map(r => r.status), STATUS_RANK),
    sector: rows.map(r => r.sector).find(Boolean) ?? null,
    implementing_agency: rows.map(r => r.implementing_agency).find(Boolean) ?? null,
    amount_committed: sum('amount_committed'),
    amount_disbursed: sum('amount_disbursed'),
    start_date: dates('start_date')[0] ?? null,
    end_date: dates('end_date').slice(-1)[0] ?? null,
    locations,
    geo_confidence: best(rows.map(r => r.geo_confidence), GEO_RANK),
    url: projectUrl ? projectUrl(key) : first.url,
  }];
}

/**
 * Parse an IATI 2.x activity file into DrukView project records.
 * Commitments = transactions of type 2 (or 11); disbursements = type 3 (or 4).
 * Options: projectKey(identifier) → groups activities that belong to one project (e.g. ADB's "39221-022");
 *          sectorNames {code: name} resolves DAC sector codes; countryFilter keeps only activities for that country.
 */
export function parseIati(xml, { sourceId, funder, matcher, fetchedAt, countryFilter = 'BT', projectUrl, projectKey, sectorNames = {} }) {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', parseTagValue: false });
  const doc = p.parse(xml);
  const rows = [];
  for (const a of arr(doc?.['iati-activities']?.['iati-activity'])) {
    const idRaw = String(a['iati-identifier']?.['#text'] ?? a['iati-identifier'] ?? '').trim();
    if (!idRaw) continue;
    const countries = arr(a['recipient-country']).map(c => c['@code']);
    const splits = countries.length > 1; // shared across countries -> amounts not attributable to BT
    if (countryFilter && countries.length && !countries.includes(countryFilter)) continue;

    let committed = 0, disbursed = 0, currency = a['@default-currency'] || null, sawCommit = false, sawDisb = false;
    for (const t of arr(a.transaction)) {
      const type = String(t['transaction-type']?.['@code']);
      const v = parseAmount(t.value?.['#text'] ?? t.value);
      if (v === null) continue;
      currency = t.value?.['@currency'] || currency;
      if (type === '2' || type === '11') { committed += v; sawCommit = true; }
      if (type === '3' || type === '4') { disbursed += v; sawDisb = true; }
    }
    if (!sawCommit) { // fall back to budget total
      for (const b of arr(a.budget)) { const v = parseAmount(b.value?.['#text'] ?? b.value); if (v !== null) { committed += v; sawCommit = true; currency = b.value?.['@currency'] || currency; } }
    }

    const dates = {};
    for (const d of arr(a['activity-date'])) dates[d['@type']] = d['@iso-date'];
    const title = narrative(a.title) || idRaw;
    const description = narrative(a.description);
    const locNames = arr(a.location).map(l => narrative(l.name) || narrative(l.description)).filter(Boolean);
    const loc = resolveLocations({ explicitNames: locNames, text: `${title}. ${description}` }, matcher);
    const implementing = arr(a['participating-org']).find(o => o['@role'] === '4');
    // main sector = highest percentage (default 100 when only one); vocabulary 1 = DAC 5-digit purpose code
    const sec = [...arr(a.sector)].filter(s => !s['@vocabulary'] || s['@vocabulary'] === '1').sort((x, y) => (parseAmount(y['@percentage']) ?? 0) - (parseAmount(x['@percentage']) ?? 0))[0];
    const key = projectKey ? projectKey(idRaw) : null;

    rows.push({
      _key: key,
      id: `${sourceId}:${idRaw}`,
      source: sourceId,
      funder,
      title,
      description: description.slice(0, 600),
      status: STATUS[a['activity-status']?.['@code']] ?? 'unknown',
      sector: sec ? (sectorNames[sec['@code']] ?? narrative(sec) ?? null) || null : null,
      implementing_agency: implementing ? narrative(implementing) || implementing['@ref'] || null : null,
      amount_committed: sawCommit && !splits ? committed : null,
      amount_disbursed: sawDisb && !splits ? disbursed : null,
      currency: currency || 'USD',
      start_date: isoDate(dates['2'] || dates['1']),
      end_date: isoDate(dates['4'] || dates['3']),
      locations: loc.ids.map(id => ({ dzongkhag: id, gewog: null, village: null })),
      geo_confidence: loc.confidence,
      url: projectUrl ? projectUrl(key ?? idRaw) : null,
      fetched_at: fetchedAt,
    });
  }

  if (!projectKey) return rows.map(({ _key, ...r }) => r);
  const groups = new Map(), out = [];
  for (const r of rows) { if (r._key) (groups.get(r._key) ?? groups.set(r._key, []).get(r._key)).push(r); else out.push([r]); }
  const merged = [...groups].flatMap(([key, g]) => mergeGroup(g, key, { sourceId, projectUrl }));
  return [...out.flat(), ...merged].map(({ _key, ...r }) => r);
}

export async function fetchIati(url, opts) {
  const xml = await fetchText(url, { timeoutMs: 120000 });
  const rows = parseIati(xml, opts);
  if (!rows.length) throw new Error(`IATI file at ${url} yielded zero Bhutan activities`);
  return rows;
}
