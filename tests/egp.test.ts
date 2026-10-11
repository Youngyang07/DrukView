import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { egpDate, parseTenderRows, PUBLIC_LISTING_URL, SOURCE, toTenders, validateTenders } from '../pipeline/egp.mjs';
import { makeGeoMatcher } from '../pipeline/lib.mjs';

const DZ = JSON.parse(readFileSync('shared/dzongkhags.json', 'utf8')).dzongkhags;
const matcher = makeGeoMatcher(DZ.map((d: { id: string; name: string; aliases: string[] }) => ({ id: d.id, name: d.name, aliases: d.aliases })));
const slug = (id: string | null) => DZ.find((d: { id: string }) => d.id === id)?.slug ?? null;
const HTML = readFileSync('tests/fixtures/egp-tender-listing.html', 'utf8');

describe('e-GP tender list', () => {
  it('reads the portal date format and refuses anything else', () => {
    expect(egpDate('26-Oct-2026 14:00')).toBe('2026-10-26');
    expect(egpDate('01-Sep-2026 09:00')).toBe('2026-09-01');
    expect(egpDate('2026-10-26')).toBeNull();
    expect(egpDate('32-Oct-2026')).toBeNull();
    expect(egpDate('26-Xyz-2026')).toBeNull();
    expect(egpDate('')).toBeNull();
  });

  it('parses the result table the portal actually returns', () => {
    const rows = parseTenderRows(HTML);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      tenderId: '28917',
      reference: 'JDWNRH/PPMD/26/2026-27/30',
      amendments: 1,
      category: 'Goods (Small)',
      type: 'NCB',
      method: 'OTM',
      publishedText: '10-Oct-2026 16:00',
      closingText: '26-Oct-2026 14:00',
    });
    expect(rows[0].title).toBe('Procurement, Installation, Testing, and Commissioning of an advanced CCTV Surveillance System');
    // "Root" is a tree artefact, not an agency
    expect(rows[0].hierarchy[0]).toBe('Autonomus Bodies');
    expect(rows[1].amendments).toBe(0);
  });

  it('returns nothing rather than guessing when the table is gone', () => {
    expect(parseTenderRows('<html><body><p>Page not found</p></body></html>')).toEqual([]);
    expect(parseTenderRows('')).toEqual([]);
    expect(parseTenderRows('<table id="resultTable"><thead><tr><th>Sl.</th></tr></thead><tbody></tbody></table>')).toEqual([]);
  });

  it('builds cited records, and only claims a dzongkhag when the agency names exactly one', () => {
    const rows = toTenders(parseTenderRows(HTML), matcher, { fetchedAt: '2026-10-11T00:00:00.000Z' });
    expect(validateTenders(rows)).toEqual([]);

    expect(rows[0]).toMatchObject({
      id: 'egp-28917', source: 'egp', tender_id: '28917', dzongkhag: null,
      agency: 'Procurement Division, JDWNRH', value: null, currency: null,
      published_on: '2026-10-10', closing_on: '2026-10-26', status: 'live',
      url: PUBLIC_LISTING_URL, source_name: SOURCE.name, retrieved_on: '2026-10-11',
    });
    expect(rows[0].hierarchy).toContain('Jigme Dorji Wangchuck National Referrel Hospital');

    // a dzongkhag administration's own notice is placed in that dzongkhag
    expect(slug(rows[1].dzongkhag)).toBe('trashigang');
    // the title names Kanglung and Thrimshing, but geography is never taken from a title
    expect(rows[1].title).toContain('Kanglung');
    // two dzongkhags in one hierarchy is ambiguous, so the notice stays national instead of picking one
    expect(rows[2].dzongkhag).toBeNull();
  });

  it('fails the run rather than publishing a half-read list', () => {
    const rows: Record<string, unknown>[] = toTenders(parseTenderRows(HTML), matcher, { fetchedAt: '2026-10-11T00:00:00.000Z' });
    expect(validateTenders([]).join(' ')).toMatch(/no readable rows/);
    expect(validateTenders(rows.map(r => ({ ...r, closing_on: null }))).join(' ')).toMatch(/closing date could not be read/);
    expect(validateTenders(rows.map(r => ({ ...r, title: '' }))).join(' ')).toMatch(/no title/);
    expect(validateTenders(rows.map(r => ({ ...r, tender_id: 'abc' }))).join(' ')).toMatch(/numeric e-GP tender ID/);
    expect(validateTenders([rows[0], rows[0]]).join(' ')).toMatch(/appears twice/);
    expect(validateTenders([{ ...rows[0], closing_on: '2026-01-01' }]).join(' ')).toMatch(/closes .* before it was published/);
  });
});
