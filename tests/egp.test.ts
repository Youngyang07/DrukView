import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { egpDate, noticeUrl, parseTenderRows, SEARCH_FIELDS, SOURCE, toTenders, totalPages, validateTenders } from '../pipeline/egp.mjs';
import { makeGeoMatcher } from '../pipeline/lib.mjs';

const DZ = JSON.parse(readFileSync('shared/dzongkhags.json', 'utf8')).dzongkhags;
const matcher = makeGeoMatcher(DZ.map((d: { id: string; name: string; aliases: string[] }) => ({ id: d.id, name: d.name, aliases: d.aliases })));
const slug = (id: string | null) => DZ.find((d: { id: string }) => d.id === id)?.slug ?? null;

/** The portal's own response to the row request, captured 2026-10-11 (3 of its 20 rows). */
const REAL = readFileSync('tests/fixtures/egp-tender-rows-real.html', 'utf8');
/** Hand-written rows for cases the captured response does not contain. */
const SYNTH = readFileSync('tests/fixtures/egp-tender-rows-synthetic.html', 'utf8');
const AT = '2026-10-11T00:00:00.000Z';

describe('e-GP register', () => {
  it('reads the portal date format and refuses anything else', () => {
    expect(egpDate('26-Oct-2026 14:00')).toBe('2026-10-26');
    expect(egpDate('09-Oct-2026 10:00')).toBe('2026-10-09');
    expect(egpDate('2026-10-26')).toBeNull();
    expect(egpDate('32-Oct-2026')).toBeNull();
    expect(egpDate('26-Xyz-2026')).toBeNull();
    expect(egpDate('')).toBeNull();
  });

  it('parses the bare row run the servlet actually returns', () => {
    const rows = parseTenderRows(REAL);
    expect(rows).toHaveLength(3);
    expect(totalPages(REAL)).toBe(731);

    // the newest notice: status word, no amendment, agency hierarchy with no "Root"
    expect(rows[0]).toMatchObject({
      tenderId: '28925', reference: 'MoENR/Pro-01/2026-2027/Tender-31', statusText: 'Live',
      amendments: 0, noticeId: '28925', category: 'Goods (Large)', type: 'NCB', method: 'OTM',
      publishedText: '11-Oct-2026 17:30', closingText: '26-Oct-2026 09:00',
    });
    expect(rows[0].title).toContain('Procurement of Drones');
    expect(rows[0].title).toContain('5 % GST'); // the whole brief, entities decoded
    expect(rows[0].hierarchy).toEqual(['Ministry of Energy and Natural Resources', 'Office of the Secretary']);

    // an amendment notice sits where the status word normally goes: count it, claim no status
    expect(rows[1]).toMatchObject({ tenderId: '28917', amendments: 1, statusText: null });
    // "Root" is a tree artefact, not an agency
    expect(rows[1].hierarchy[0]).toBe('Autonomus Bodies');

    // the portal labels this one Cancelled even in its "Live" tab
    expect(rows[2]).toMatchObject({ tenderId: '28790', statusText: 'Cancelled', amendments: 0 });
  });

  it('returns nothing rather than guessing when the rows are gone', () => {
    expect(parseTenderRows('<html><body><p>Page not found</p></body></html>')).toEqual([]);
    expect(parseTenderRows('')).toEqual([]);
    expect(parseTenderRows('<table id="resultTable"><thead><tr><th>Sl.</th></tr></thead><tbody></tbody></table>')).toEqual([]);
    expect(totalPages('<p>nothing</p>')).toBeNull();
  });

  it('sends the fields the portal\'s own script sends', () => {
    expect(SEARCH_FIELDS.funName).toBe('AllTenders');
    expect(SEARCH_FIELDS.viewType).toBe('Live');
    expect(SEARCH_FIELDS.h).toBe('t');
    // numeric "no filter" sentinels, not empty strings — the servlet rejects the request otherwise
    expect(SEARCH_FIELDS).toMatchObject({ departmentId: '0', district: '0', procMethod: '0', tenderId: '0' });
  });

  it('builds records that cite the notice\'s own e-GP page', () => {
    const rows = toTenders(parseTenderRows(REAL), matcher, { fetchedAt: AT });
    expect(validateTenders(rows)).toEqual([]);

    expect(rows[0]).toMatchObject({
      id: 'egp-28925', source: 'egp', tender_id: '28925', dzongkhag: null,
      agency: 'Office of the Secretary', value: null, currency: null,
      published_on: '2026-10-11', closing_on: '2026-10-26', status: 'Live',
      source_name: SOURCE.name, retrieved_on: '2026-10-11',
    });
    expect(rows[0].url).toBe('https://www.egp.gov.bt/resources/common/ViewNotice.jsp?id=28925&h=t');
    expect(noticeUrl('28790')).toContain('id=28790');
    // a citation always points at the real portal, never at a test or staging override
    expect(rows.every((r: { url: string }) => r.url.startsWith('https://www.egp.gov.bt/'))).toBe(true);

    // a thromde's own notice is placed in its dzongkhag
    expect(slug(rows[2].dzongkhag)).toBe('samdrup-jongkhar');
    expect(rows[2].status).toBe('Cancelled');
  });

  it('never takes geography from a title, and leaves an ambiguous agency national', () => {
    const rows = toTenders(parseTenderRows(SYNTH), matcher, { fetchedAt: AT });
    // the hierarchy names Paro and Haa: ambiguous, so national rather than picking one
    expect(rows[0].title).toContain('Paro and Haa');
    expect(rows[0].dzongkhag).toBeNull();
    // and where the hierarchy names exactly one, it is used
    expect(slug(rows[1].dzongkhag)).toBe('trashigang');
  });

  it('fails the run rather than publishing a half-read register', () => {
    const rows: Record<string, unknown>[] = toTenders(parseTenderRows(REAL), matcher, { fetchedAt: AT });
    expect(validateTenders([]).join(' ')).toMatch(/no readable rows/);
    expect(validateTenders(rows.map(r => ({ ...r, closing_on: null }))).join(' ')).toMatch(/closing date could not be read/);
    expect(validateTenders(rows.map(r => ({ ...r, title: '' }))).join(' ')).toMatch(/no title/);
    expect(validateTenders(rows.map(r => ({ ...r, tender_id: 'abc' }))).join(' ')).toMatch(/numeric e-GP tender ID/);
    expect(validateTenders(rows.map(r => ({ ...r, url: 'https://example.com/x' }))).join(' ')).toMatch(/not an e-GP URL/);
    expect(validateTenders([rows[0], rows[0]]).join(' ')).toMatch(/appears twice/);
    expect(validateTenders([{ ...rows[0], closing_on: '2026-01-01' }]).join(' ')).toMatch(/closes .* before it was published/);
    // the synthetic row with unreadable dates must fail, not load as null
    const bad = toTenders(parseTenderRows(SYNTH), matcher, { fetchedAt: AT });
    expect(validateTenders([bad[1]]).join(' ')).toMatch(/date could not be read/);
  });
});
