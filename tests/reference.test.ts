import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DZONGKHAGS, health, population } from '@/lib/reference';

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
