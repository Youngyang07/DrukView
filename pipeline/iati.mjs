import { XMLParser } from 'fast-xml-parser';
import { fetchText, parseAmount, isoDate, resolveLocations } from './lib.mjs';

const arr = v => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const narrative = n => {
  const first = arr(n?.narrative)[0];
  if (first === undefined) return typeof n === 'string' ? n : '';
  return String(typeof first === 'object' ? first['#text'] ?? '' : first).trim();
};

// IATI activity-status codes
const STATUS = { 1: 'pipeline', 2: 'active', 3: 'active', 4: 'completed', 5: 'cancelled', 6: 'suspended' };

/**
 * Parse an IATI 2.x activity file into DrukView project records.
 * Commitments = transactions of type 2 (or 11); disbursements = type 3 (or 4).
 * Only activities that list Bhutan (BT) as recipient country, or whose
 * transactions/recipient-regions can't contradict it, are kept when countryFilter is set.
 */
export function parseIati(xml, { sourceId, funder, matcher, fetchedAt, countryFilter = 'BT', projectUrl }) {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', parseTagValue: false });
  const doc = p.parse(xml);
  const out = [];
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
    const adminNames = arr(a.location).flatMap(l => arr(l.administrative).map(x => x['@code'])).filter(Boolean);
    const loc = resolveLocations({ explicitNames: [...locNames, ...adminNames], text: `${title}. ${description}` }, matcher);
    const parts = arr(a['participating-org']);
    const implementing = parts.find(o => o['@role'] === '4');
    const sectorEl = arr(a.sector)[0];

    out.push({
      id: `${sourceId}:${idRaw}`,
      source: sourceId,
      funder,
      title,
      description: description.slice(0, 600),
      status: STATUS[a['activity-status']?.['@code']] ?? 'unknown',
      sector: sectorEl ? (narrative(sectorEl) || sectorEl['@code'] || null) : null,
      implementing_agency: implementing ? narrative(implementing) || implementing['@ref'] || null : null,
      amount_committed: sawCommit && !splits ? committed : null,
      amount_disbursed: sawDisb && !splits ? disbursed : null,
      currency: currency || 'USD',
      start_date: isoDate(dates['2'] || dates['1']),
      end_date: isoDate(dates['4'] || dates['3']),
      locations: loc.ids.map(id => ({ dzongkhag: id, gewog: null, village: null })),
      geo_confidence: loc.confidence,
      url: projectUrl ? projectUrl(idRaw) : null,
      fetched_at: fetchedAt,
    });
  }
  return out;
}

export async function fetchIati(url, opts) {
  const xml = await fetchText(url, { timeoutMs: 120000 });
  const rows = parseIati(xml, opts);
  if (!rows.length) throw new Error(`IATI file at ${url} yielded zero Bhutan activities`);
  return rows;
}
