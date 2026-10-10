import { fetchJson, makeGeoMatcher, loadDzongkhags } from './lib.mjs';

export const SOURCE = {
  id: 'boundaries',
  name: 'geoBoundaries – Bhutan ADM1 (dzongkhag) boundaries',
  url: 'https://www.geoboundaries.org/countries.html?country=BTN',
  kind: 'api',
  notes: 'Open boundary data (CC BY 4.0 / per-layer licence). Used only to draw the map; boundaries carry no legal or political meaning.',
};

/** Attach dzongkhag ids to features; drop geometry-less ones; report unmatched shapes. */
export function tagFeatures(fc, matcher) {
  const features = [], unmatched = [];
  for (const f of fc.features ?? []) {
    const name = f.properties?.shapeName ?? f.properties?.NAME_1 ?? f.properties?.ADM1_EN;
    const id = matcher.byName(name);
    if (!id || !f.geometry) { unmatched.push(name ?? '(unnamed)'); continue; }
    features.push({ type: 'Feature', properties: { dzongkhag_id: id, name }, geometry: f.geometry });
  }
  return { fc: { type: 'FeatureCollection', features }, unmatched };
}

export async function fetchBoundaries() {
  const matcher = makeGeoMatcher(await loadDzongkhags());
  const meta = await fetchJson('https://www.geoboundaries.org/api/current/gbOpen/BTN/ADM1/');
  const url = meta.simplifiedGeometryGeoJSON || meta.gjDownloadURL;
  if (!url) throw new Error('geoBoundaries metadata has no GeoJSON URL');
  const { fc, unmatched } = tagFeatures(await fetchJson(url, { timeoutMs: 120000 }), matcher);
  if (fc.features.length < 15) throw new Error(`Only ${fc.features.length}/20 dzongkhag shapes matched (unmatched: ${unmatched.join(', ')})`);
  return { fc, unmatched, license: meta.boundaryLicense ?? null };
}
