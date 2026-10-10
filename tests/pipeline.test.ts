// @ts-nocheck
// Fixtures below are SHAPE fixtures for parser tests only. They are not real Bhutan data and never ship in /data.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeGeoMatcher, parseAmount, resolveLocations } from '../pipeline/lib.mjs';
import { normalizeWorldBank } from '../pipeline/worldbank.mjs';
import { parseIati } from '../pipeline/iati.mjs';
import { parseCsv, buildBudget, buildAllocations } from '../pipeline/ingest-manual.mjs';
import { tagFeatures } from '../pipeline/boundaries.mjs';
import { validateProjects } from '../pipeline/validate.mjs';
import { parseOpenMeteo, openMeteoUrl } from '../pipeline/weather.mjs';
import { buildTenders, buildOffices } from '../pipeline/ingest-manual.mjs';

const dz = JSON.parse(readFileSync('shared/dzongkhags.json', 'utf8')).dzongkhags;
const matcher = makeGeoMatcher(dz);

test('20 dzongkhags with unique ids and grid cells', () => {
  assert.equal(dz.length, 20);
  assert.equal(new Set(dz.map((d: any) => d.id)).size, 20);
  assert.equal(new Set(dz.map((d: any) => d.grid_col + ',' + d.grid_row)).size, 20);
});

test('geo matcher: aliases, word boundaries, multiple hits', () => {
  assert.equal(matcher.findAll('Road upgrade in Tashigang and Monggar').length, 2);
  assert.ok(matcher.findAll('Road upgrade in Tashigang and Monggar').includes('BT-41'));
  assert.ok(matcher.findAll('Road upgrade in Tashigang and Monggar').includes('BT-42'));
  assert.deepEqual(matcher.findAll('Shaa and Haanover'), []); // "Haa" must not match inside words
  assert.deepEqual(matcher.findAll('Samdrup Jongkhar'), ['BT-45']);
  assert.equal(matcher.byName('Wangdi Phodrang Dzongkhag'), 'BT-24');
  assert.equal(matcher.byName('Atlantis'), null);
});

test('explicit location fields beat text matching', () => {
  const r = resolveLocations({ explicitNames: ['Paro'], text: 'mentions Thimphu' }, matcher);
  assert.deepEqual(r, { ids: ['BT-11'], confidence: 'location-field' });
  assert.equal(resolveLocations({ text: 'nationwide' }, matcher).confidence, 'none');
});

test('parseAmount', () => {
  assert.equal(parseAmount('35,000,000'), 35000000);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
});

test('World Bank normalisation', () => {
  const raw = { total: 2, projects: {
    P000001: { id: 'P000001', project_name: 'Test Roads Project', status: 'Active', boardapprovaldate: '2021-03-04T00:00:00Z', closingdate: '2027-06-30T00:00:00Z', totalcommamt: '35,000,000', sector1: { Name: 'Transportation' }, impagency: 'Ministry X', pdo: 'Improve roads in Trongsa and Zhemgang.' },
    P000002: { id: 'P000002', project_name: 'Old Nationwide Thing', status: 'Closed', totalcommamt: 0 },
  } };
  const [a, b] = normalizeWorldBank(raw, matcher, '2026-01-01T00:00:00Z');
  assert.equal(a.status, 'active'); assert.equal(a.amount_committed, 35000000); assert.equal(a.currency, 'USD');
  assert.equal(a.start_date, '2021-03-04'); assert.deepEqual(a.locations.map(l => l.dzongkhag).sort(), ['BT-32', 'BT-34']);
  assert.equal(a.geo_confidence, 'text-match'); assert.match(a.url, /^https:\/\/projects\.worldbank\.org\//);
  assert.equal(b.status, 'completed'); assert.equal(b.locations.length, 0); assert.equal(b.geo_confidence, 'none');
  assert.deepEqual(validateProjects([a, b], new Set(dz.map((d: any) => d.id))), []);
});

const IATI = `<?xml version="1.0"?><iati-activities version="2.03">
<iati-activity default-currency="USD"><iati-identifier>XX-1-12345</iati-identifier>
 <title><narrative>Rural water supply</narrative></title><description><narrative>Water schemes</narrative></description>
 <activity-status code="2"/><activity-date type="2" iso-date="2020-01-15"/><activity-date type="3" iso-date="2026-12-31"/>
 <recipient-country code="BT"/><participating-org role="4"><narrative>Dept of Water</narrative></participating-org>
 <location><name><narrative>Dagana</narrative></name></location>
 <transaction><transaction-type code="2"/><value currency="USD">10000000</value></transaction>
 <transaction><transaction-type code="3"/><value currency="USD">2500000</value></transaction>
 <transaction><transaction-type code="3"/><value currency="USD">1500000</value></transaction></iati-activity>
<iati-activity><iati-identifier>XX-1-777</iati-identifier><title><narrative>Regional power</narrative></title>
 <recipient-country code="BT"/><recipient-country code="IN"/><activity-status code="4"/>
 <transaction><transaction-type code="2"/><value currency="USD">99</value></transaction></iati-activity>
<iati-activity><iati-identifier>XX-1-888</iati-identifier><title><narrative>Elsewhere</narrative></title><recipient-country code="NP"/></iati-activity>
</iati-activities>`;

test('IATI parsing: sums, status, location, shared-country guard, country filter', () => {
  const rows = parseIati(IATI, { sourceId: 'adb', funder: 'Asian Development Bank', matcher, fetchedAt: 'x', projectUrl: id => `https://example.org/${id}` });
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.equal(a.amount_committed, 10000000); assert.equal(a.amount_disbursed, 4000000); assert.equal(a.status, 'active');
  assert.deepEqual(a.locations.map(l => l.dzongkhag), ['BT-22']); assert.equal(a.geo_confidence, 'location-field');
  assert.equal(a.start_date, '2020-01-15'); assert.equal(a.end_date, '2026-12-31'); assert.equal(a.implementing_agency, 'Dept of Water');
  assert.equal(b.amount_committed, null, 'multi-country activity must not claim a Bhutan amount'); assert.equal(b.status, 'completed');
});

test('manual CSV: parsing quotes + strict citation rules', () => {
  const rows = parseCsv('a,b\n"x, y","say ""hi"""\n');
  assert.deepEqual(rows, [{ a: 'x, y', b: 'say "hi"' }]);

  const good = parseCsv('fiscal_year,agency,budget_type,amount,currency,funding_source,source_name,source_url,document,page,retrieved_on\n2024-25,Test Agency,capital,"1,000",BTN,RGoB,MoF,https://example.org/doc.pdf,Budget Report,12,2026-01-01\n');
  const g = buildBudget(good); assert.deepEqual(g.errs, []); assert.equal(g.out[0].amount, 1000);

  const bad = parseCsv('fiscal_year,agency,budget_type,amount,currency,funding_source,source_name,source_url,document,page,retrieved_on\n2024-25,Test Agency,capital,1000,BTN,RGoB,MoF,http://insecure.example,,,\n');
  const e = buildBudget(bad).errs.join('|'); assert.match(e, /missing document/); assert.match(e, /https/);

  const al = buildAllocations(parseCsv('fiscal_year,dzongkhag,gewog,village,sector,funding_source,amount,currency,source_name,source_url,document,page,retrieved_on\n2024-25,Atlantis,,,Health,RGoB,5,BTN,MoF,https://example.org/x,Doc,,\n'), matcher);
  assert.match(al.errs.join('|'), /unknown dzongkhag/);
});

test('boundary tagging maps shapeName variants and reports unmatched', () => {
  const fc = { features: [
    { properties: { shapeName: 'Monggar' }, geometry: { type: 'Polygon', coordinates: [] } },
    { properties: { shapeName: 'Narnia' }, geometry: { type: 'Polygon', coordinates: [] } },
  ] };
  const { fc: out, unmatched } = tagFeatures(fc, matcher);
  assert.equal(out.features[0].properties.dzongkhag_id, 'BT-42'); assert.deepEqual(unmatched, ['Narnia']);
});

test('dzongkhag reference data: slugs unique, coordinates inside Bhutan bounds', () => {
  assert.equal(new Set(dz.map((d: any) => d.slug)).size, 20);
  for (const d of dz) { assert.ok(d.lat > 26.6 && d.lat < 28.4, d.name); assert.ok(d.lon > 88.7 && d.lon < 92.2, d.name); }
});

test('Open-Meteo parsing: forecast flag, null handling, location count guard', () => {
  const two = [{ id: 'A', lat: 1, lon: 2 }, { id: 'B', lat: 3, lon: 4 }];
  const mk = () => ({ daily: { time: ['2026-10-09', '2026-10-11'], temperature_2m_max: [20, 22], temperature_2m_min: [10, null], precipitation_sum: [0, 5.5] } });
  const rows = parseOpenMeteo([mk(), mk()], two, '2026-10-10', 'x');
  assert.equal(rows.length, 4);
  assert.equal(rows[0].is_forecast, false); assert.equal(rows[1].is_forecast, true); assert.equal(rows[1].tmin_c, null); assert.equal(rows[2].dzongkhag, 'B');
  assert.throws(() => parseOpenMeteo([mk()], two, '2026-10-10', 'x'), /expected 2/);
  assert.equal(parseOpenMeteo(mk(), [two[0]], '2026-10-10', 'x').length, 2); // single-location responses are a bare object
  assert.match(openMeteoUrl(two), /latitude=1,3&longitude=2,4/);
});

test('tenders / offices CSV validation', () => {
  const t = buildTenders([{ id: 'T1', dzongkhag: 'Paro', title: 'Bridge', url: 'https://example.org/t', source_name: 'e-GP', value: '1000', currency: 'BTN', published_on: '2026-01-05' }], matcher);
  assert.deepEqual(t.errs, []); assert.equal(t.out[0].dzongkhag, 'BT-11');
  const bad = buildTenders([{ id: 'T2', dzongkhag: 'Nowhere', title: 'X', url: 'http://x', source_name: '', value: '5', currency: '', published_on: '05/01/2026' }], matcher).errs.join('|');
  assert.match(bad, /unknown dzongkhag/); assert.match(bad, /https/); assert.match(bad, /currency/); assert.match(bad, /YYYY-MM-DD/); assert.match(bad, /source_name/);
  const o = buildOffices([{ kind: 'boss', name: 'N', source_name: 'S', source_url: 'https://example.org' }], matcher).errs.join('|');
  assert.match(o, /leader or office/);
});

test('project validation rejects bad batches', () => {
  const ok = { id: 'x:1', source: 'x', title: 'T', status: 'active', amount_committed: 5, currency: 'USD', url: 'https://e.org', locations: [] };
  const ids = new Set(dz.map((d: any) => d.id));
  assert.deepEqual(validateProjects([ok], ids), []);
  const e = validateProjects([ok, { ...ok, status: 'weird', amount_committed: -1, url: 'http://e', locations: [{ dzongkhag: 'ZZ' }] }], ids).join('|');
  assert.match(e, /duplicate id/); assert.match(e, /bad status/); assert.match(e, /bad amount/); assert.match(e, /https/); assert.match(e, /unknown dzongkhag/);
});
