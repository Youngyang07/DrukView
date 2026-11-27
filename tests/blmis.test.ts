import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { livewireData, parseBlmis, sameCounts, toCountRows, validateBlmis } from '../pipeline/blmis.mjs';
import { makeGeoMatcher } from '../pipeline/lib.mjs';

const DZ = JSON.parse(readFileSync('shared/dzongkhags.json', 'utf8')).dzongkhags;
const matcher = makeGeoMatcher(DZ.map((d: { id: string; name: string; aliases: string[] }) => ({ id: d.id, name: d.name, aliases: d.aliases })));
/** The portal's job-seeker page, captured 2026-11-27 and projected by scripts/trim-blmis-capture.mjs:
 *  all four panels and every row, only the fields read plus ids. */
const REAL = readFileSync('tests/fixtures/blmis-jobseeker-real.html', 'utf8');
const AT = '2026-11-27T08:00:00.000Z';
const rows = () => toCountRows(parseBlmis(REAL)!, matcher, { fetchedAt: AT });
const total = (dim: string) => rows().filter(r => r.dimension === dim).reduce((s, r) => s + r.count, 0);

describe('BLMIS vacancy counts', () => {
  it('finds the job-seeker panels inside the escaped Livewire attribute', () => {
    const d = livewireData(REAL)!;
    expect(d.job_by_location).toHaveLength(17);
    expect(d.job_by_company).toHaveLength(378);
  });

  it('the four breakdowns of the captured page agree on one total, and it validates', () => {
    for (const dim of ['dzongkhag', 'qualification', 'occupation', 'employer']) expect(total(dim), dim).toBe(762);
    expect(validateBlmis(rows())).toEqual([]);
  });

  it('matches the snapshot already published from the same day', () => {
    // data/reference/economy.json was read off the same page by hand on 2026-11-27
    const econ = JSON.parse(readFileSync('data/reference/economy.json', 'utf8'));
    const vac = econ.metrics.find((m: { key: string }) => m.key === 'vacancies');
    expect(vac.national.total).toBe(total('dzongkhag'));
    const slugOf = (id: string) => DZ.find((d: { id: string }) => d.id === id).slug;
    for (const r of rows().filter(r => r.dimension === 'dzongkhag')) expect(vac.dzongkhags[slugOf(r.dzongkhag!)].total, r.label!).toBe(r.count);
  });

  it('maps the portal\'s dzongkhag spellings, merges same-named groups, and keeps an unnamed group', () => {
    const dz = rows().filter(r => r.dimension === 'dzongkhag');
    expect(dz.find(r => r.label === 'Samdrupjongkhar')?.dzongkhag).toBe('BT-45');
    expect(dz.find(r => r.label === 'Wangdue Phodrang')?.dzongkhag).toBe('BT-24');
    expect(dz[0]).toMatchObject({ label: 'Thimphu', count: 324 }); // largest first
    // 378 employer groups carry 375 distinct names; merging keeps every listing counted
    expect(rows().filter(r => r.dimension === 'employer')).toHaveLength(375);
    expect(rows().find(r => r.dimension === 'qualification' && r.label === null)?.count).toBe(1);
  });

  // Synthetic cases below: the captured page does not contain them.
  it('returns nothing for a page without the panels', () => {
    expect(parseBlmis('<html><body>Maintenance</body></html>')).toBeNull();
    expect(parseBlmis('<div wire:initial-data="{not json">')).toBeNull();
  });

  it('rejects breakdowns that disagree, are missing, or name an unknown place', () => {
    const r = rows();
    const short = r.filter(x => !(x.dimension === 'employer' && x.label === r.find(y => y.dimension === 'employer')!.label));
    expect(validateBlmis(short).join('\n')).toMatch(/disagree on the total/);
    expect(validateBlmis(r.filter(x => x.dimension !== 'occupation')).join('\n')).toMatch(/occupation breakdown is missing/);
    const odd = r.map(x => (x.dimension === 'dzongkhag' && x.label === 'Haa' ? { ...x, dzongkhag: null } : x));
    expect(validateBlmis(odd).join('\n')).toMatch(/"Haa" matches no dzongkhag/);
    const frac = r.map(x => (x.dimension === 'qualification' && x.label === 'NFE' ? { ...x, count: 1.5 } : x));
    expect(validateBlmis(frac).join('\n')).toMatch(/not a whole number/);
  });

  it('an identical read is recognised as unchanged, whatever its order or read time', () => {
    const a = rows(), b = [...rows()].reverse().map(r => ({ ...r, fetched_at: '2026-11-27T10:00:00Z' }));
    expect(sameCounts(a, b)).toBe(true);
    expect(sameCounts(a, b.map(r => (r.dimension === 'dzongkhag' && r.label === 'Haa' ? { ...r, count: 8 } : r)))).toBe(false);
    expect(sameCounts(a, b.slice(1))).toBe(false);
  });
});
