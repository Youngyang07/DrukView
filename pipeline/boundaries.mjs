import { fetchJson } from './lib.mjs';

export const SOURCE = {
  id: 'boundaries',
  name: 'geoBoundaries – Bhutan ADM1 (dzongkhag) boundaries',
  url: 'https://www.geoboundaries.org/countries.html?country=BTN',
  kind: 'api',
  notes: 'Open boundary data (geoBoundaries; licence as published with each release, CC BY 3.0 as of 2026-10). Used only to draw the map; boundaries carry no legal or political meaning.',
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

export async function fetchBoundaries(matcher) {
  const meta = await fetchJson('https://www.geoboundaries.org/api/current/gbOpen/BTN/ADM1/', { retries: 1 });
  const url = meta.simplifiedGeometryGeoJSON || meta.gjDownloadURL;
  if (!url) throw new Error('geoBoundaries metadata has no GeoJSON URL');
  const { fc, unmatched } = tagFeatures(await fetchJson(url, { timeoutMs: 20000, retries: 1 }), matcher);
  if (fc.features.length !== 20) throw new Error(`Expected 20 dzongkhag shapes, matched ${fc.features.length} (unmatched: ${unmatched.join(', ') || 'none'}). Add the new spelling to shared/dzongkhags.json aliases.`);
  return { fc, unmatched, license: meta.boundaryLicense ?? null };
}
