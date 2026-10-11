import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DZONGKHAGS, health, leaders, population, schools } from '@/lib/reference';

const slugs = DZONGKHAGS.map(d => d.slug).sort();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('reference data integrity', () => {
  it('covers exactly the 20 dzongkhags, by the same slugs as the database seed', () => {
    const seed = JSON.parse(readFileSync('shared/dzongkhags.json', 'utf8')).dzongkhags.map((d: { slug: string }) => d.slug).sort();
    expect(slugs).toEqual(seed);
    expect(Object.keys(population.dzongkhags).sort()).toEqual(slugs);
    expect(Object.keys(health.dzongkhags).sort()).toEqual(slugs);
  });

  it('census rows add up to the NSB national totals (2017 and 2005)', () => {
    const rows = Object.values(population.dzongkhags);
    for (const r of rows) expect(r.male + r.female).toBe(r.total);
    expect(sum(rows.map(r => r.total))).toBe(population.national.enumerated);
    expect(sum(rows.map(r => r.male))).toBe(population.national.male);
    expect(sum(rows.map(r => r.female))).toBe(population.national.female);
    expect(sum(rows.map(r => r.total2005))).toBe(population.national.total2005);
    for (const r of rows) if (r.thromde) { expect(r.thromde.male + r.thromde.female).toBe(r.thromde.total); expect(r.thromde.total).toBeLessThan(r.total); }
  });

  it('health facility lists match the Bulletin totals rows, and totals match the Grand Total', () => {
    const keys = ['hospitals', 'beds', 'phc', 'subpost', 'hisc', 'orcs'] as const;
    for (const k of keys) expect(sum(Object.values(health.dzongkhags).map(d => d.totals[k]))).toBe(health.grandTotal[k]);
    const known = new Set(['trongsa:subpost']); // documented: totals row says 4, only 3 are named in Table 6.1
    for (const [slug, d] of Object.entries(health.dzongkhags)) {
      const n = (t: string) => d.facilities.filter(f => f.type === t).length;
      expect(n('hospital'), slug).toBe(d.totals.hospitals);
      expect(n('phc'), slug).toBe(d.totals.phc);
      expect(n('hisc'), slug).toBe(d.totals.hisc);
      if (!known.has(`${slug}:subpost`)) expect(n('subpost'), slug).toBe(d.totals.subpost);
      expect(sum(d.facilities.map(f => f.beds ?? 0)), slug).toBe(d.totals.beds);
      expect(new Set(d.facilities.map(f => `${f.type}:${f.name}`)).size, `${slug} has duplicate names`).toBe(d.facilities.length);
    }
    expect(health.notes.some(n => n.startsWith('Trongsa'))).toBe(true);
  });

  it('every reference file cites an https source', () => {
    for (const s of [health.source, population.source]) { expect(s.url).toMatch(/^https:\/\//); expect(s.checked).toMatch(/^\d{4}-\d\d-\d\d$/); }
  });
});

describe('schools and leaders reference data', () => {
  it('school lists match the MoESD totals (566 schools, Table A levels)', () => {
    const d = Object.values(schools.dzongkhags);
    expect(Object.keys(schools.dzongkhags).sort()).toEqual(slugs);
    for (const x of d) {
      expect(x.schools.length).toBe(x.total);
      expect(sum(Object.values(x.byLevel))).toBe(x.total);
      for (const l of ['ECR', 'PS', 'LSS', 'MSS', 'HSS', 'other'] as const) expect(x.schools.filter(s => s.level === l).length).toBe(x.byLevel[l]);
    }
    const N = schools.national;
    expect(sum(d.map(x => x.total))).toBe(N.total);
    expect(N.ECR + N.PS + N.LSS + N.MSS + N.HSS + N.special).toBe(N.total);
    expect(sum(d.map(x => x.byLevel.ECR))).toBe(N.ECR);
    expect(sum(d.map(x => x.byLevel.PS))).toBe(N.PS);
    expect(sum(d.map(x => x.byLevel.LSS))).toBe(N.LSS);
    expect(sum(d.map(x => x.byLevel.other))).toBe(N.special);
    expect(sum(d.map(x => x.byLevel.MSS + x.byLevel.HSS))).toBe(N.MSS + N.HSS); // only the combined figure is exact
    for (const x of d) for (const s of x.schools) expect(s.name, 'no replacement characters').not.toMatch(/�/);
  });

  it('Parliament: 47 National Assembly seats with the constitutional split, one elected NC member per dzongkhag + 5 eminent', () => {
    expect(Object.keys(leaders.dzongkhags).sort()).toEqual(slugs);
    const na = Object.values(leaders.dzongkhags).flatMap(x => x.nationalAssembly);
    expect(na.length).toBe(47);
    expect(new Set(na.map(m => m.constituency)).size).toBe(47);
    const seats = (s: string) => leaders.dzongkhags[s].nationalAssembly.length;
    expect([seats('trashigang'), seats('samtse'), seats('mongar'), seats('pemagatshel')]).toEqual([5, 4, 3, 3]);
    for (const [s, x] of Object.entries(leaders.dzongkhags)) {
      expect(x.nationalCouncil.length, s).toBe(1);
      expect(x.nationalAssembly.length, s).toBeGreaterThanOrEqual(2);
    }
    expect(leaders.nationalCouncilEminent.length).toBe(5);
    expect(leaders.cabinet.some(m => m.role === 'Prime Minister')).toBe(true);
    for (const src of Object.values(leaders.sources)) expect(src.url).toMatch(/^https:\/\//);
  });
});
