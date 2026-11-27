import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budget, dzongdags, DZONGKHAGS, economy, health, isOpen, leaders, population, schools, vacancyNotices } from '@/lib/reference';

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

describe('national budget reference data', () => {
  const B = budget;
  it('reconciles with the Ministry of Finance totals', () => {
    const N = B.national;
    expect(N.current + N.capital).toBe(N.totalExpenditure);
    expect(N.domesticRevenue).toBe(N.tax + N.nonTax);
    expect(N.externalResources).toBe(N.programGrants + N.projectTiedGrants);
    expect(N.internalResources).toBeLessThan(N.totalResources);
    // Sector table: parent and standalone rows add up to the appropriation; children sit inside a parent.
    expect(sum(B.sectors.filter(s => s.level !== 'child').map(s => s.total))).toBe(N.totalAppropriation);
    // Printed to 3 decimals of a million, so a row may be Nu 1,000 off its own printed total.
    for (const s of B.sectors) expect(Math.abs(s.current + s.capital - s.total), s.name).toBeLessThanOrEqual(10_000);
  });

  it('local government: dzongkhag, gewog and thromde tables match their printed totals', () => {
    const LG = B.localGovernment;
    expect(Object.keys(B.dzongkhags).sort()).toEqual(slugs);
    expect(B.gewogs.length).toBe(205);
    expect(B.thromdes.length).toBe(4);
    for (const d of Object.values(B.dzongkhags)) {
      expect(d.current + d.capital).toBe(d.total);
      expect(d.capitalBlock + d.capitalProjectExternal + d.capitalProjectRgob + d.capitalCentral).toBe(d.capital);
    }
    // Annexure 1 prints millions to 3 decimals, so its rows sum to Nu 1,000 over its own total.
    expect(Math.abs(sum(Object.values(B.dzongkhags).map(d => d.total)) - LG.dzongkhags.total)).toBeLessThanOrEqual(10_000);
    expect(sum(B.gewogs.map(g => g.total))).toBe(LG.gewogsTotal);
    expect(sum(B.thromdes.map(t => t.total))).toBe(LG.thromdesTotal);
    expect(LG.dzongkhags.total + LG.gewogsTotal + LG.thromdesTotal).toBe(LG.total);
    for (const g of B.gewogs) expect(slugs).toContain(g.dz);
    for (const t of B.thromdes) expect(slugs).toContain(t.dz);
  });

  it('only attaches a gewog to a map boundary when the name matches that dzongkhag', () => {
    const geo = JSON.parse(readFileSync('public/geo/bhutan-gewogs.json', 'utf8'));
    const byId: Record<string, string> = Object.fromEntries(DZONGKHAGS.map(d => [d.id, d.slug]));
    const inDz = new Map<string, Set<string>>();
    for (const f of geo.features) {
      const slug = byId[f.properties.dz];
      if (!inDz.has(slug)) inDz.set(slug, new Set());
      inDz.get(slug)!.add(String(f.properties.name).toLowerCase());
    }
    const matched = B.gewogs.filter(g => g.mapName);
    expect(matched.length).toBeGreaterThan(150);
    for (const g of matched) expect(inDz.get(g.dz)?.has(g.mapName!.toLowerCase()), `${g.gewog} → ${g.mapName}`).toBe(true);
    // one boundary may never carry two gewogs' money
    for (const [slug] of inDz) {
      const used = matched.filter(g => g.dz === slug).map(g => g.mapName!.toLowerCase());
      expect(new Set(used).size).toBe(used.length);
    }
  });
});

describe('budget themes (report §5.4-5.8)', () => {
  const T = budget.themes;
  const M = 1_000_000;

  it('climate tagging: every column and every agency row reconciles with Table 5.7', () => {
    const C = T.climate;
    for (const k of ['recommended', 'mitigation', 'adaptation', 'enabling', 'noRelevance'] as const) {
      const col = sum(C.agencies.map(a => a[k]));
      expect(col, k).toBe(k === 'recommended' ? C.taggedBudget : C[k]);
    }
    for (const a of C.agencies) expect(a.mitigation + a.adaptation + a.enabling + a.noRelevance, a.agency).toBe(a.recommended);
    // the text prints the climate total to one decimal of a million (Nu 11,179.7m); the table gives it to three
    expect(Math.abs(C.mitigation + C.adaptation + C.enabling - C.printedTotal)).toBeLessThan(0.05 * M);
    expect(C.agencies).toHaveLength(12);
    // tagging covers only part of the budget, so it must never be presented as a share of the whole
    expect(C.taggedBudget).toBeLessThan(budget.national.totalAppropriation);
  });

  it('grants, subsidies and the general reserve match Tables 5.5 and 5.6', () => {
    for (const g of T.transfers.groups) {
      expect(sum(g.lines.map(l => l.total)), g.name).toBe(g.total);
      for (const l of g.lines) expect(l.current + l.capital, l.name).toBe(l.total);
    }
    expect(sum(T.transfers.groups.map(g => g.total))).toBe(T.transfers.total);
    expect(T.transfers.total).toBe(1_775_722_000);
    expect(sum(T.reserve.lines.map(l => l.current))).toBe(T.reserve.current);
    expect(sum(T.reserve.lines.map(l => l.capital))).toBe(T.reserve.capital);
    expect(T.reserve.current + T.reserve.capital).toBe(T.reserve.total);
  });

  it('every theme cites a section and page of the same report, and amounts are whole ngultrum', () => {
    expect(T.source.url).toBe(budget.source.url);
    for (const th of [T.climate, T.gender, T.stimulus, T.reserve, T.transfers]) {
      expect(th.section).toMatch(/^5\.[4-8] /);
      expect(th.page).toBeGreaterThan(40);
    }
    const walk = (o: unknown): number[] => typeof o === 'number' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(walk) : [];
    for (const n of walk({ ...T, source: null })) expect(Number.isInteger(n), String(n)).toBe(true);
  });
});

describe('MoICE industry/jobs and Dzongdag reference data', () => {
  it('vacancy snapshot: dzongkhag and qualification counts both add up to the portal total', () => {
    const vac = economy.metrics.find(m => m.key === 'vacancies')!;
    expect(Object.keys(vac.dzongkhags).sort()).toEqual(slugs);
    expect(sum(Object.values(vac.dzongkhags).map(d => d.total))).toBe(vac.national.total);
    expect(sum(vac.breakdown!.rows.map(r => r.count))).toBe(vac.national.total);
    expect(vac.national.total).toBe(762);
    // a snapshot must say which day it is, and cite the government portal it was read from
    expect(vac.asOf).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(vac.source.url).toMatch(/^https:\/\/www\.blmis\.gov\.bt\//);
    // the notes must send readers to the live list rather than let a dated count pass as current
    expect(vac.notes.join(' ')).toMatch(/snapshot/i);
    expect(vac.notes.join(' ')).toMatch(/Civil-service vacancies .* not included/);
  });


  it('industry licences reconcile with the Annual Industry Report totals', () => {
    const ind = economy.metrics.find(m => m.key === 'industry')!;
    expect(Object.keys(ind.dzongkhags).sort()).toEqual(slugs);
    for (const k of ['cottage', 'small', 'medium', 'large', 'total']) {
      expect(sum(Object.values(ind.dzongkhags).map(d => d[k])), k).toBe(ind.national[k]);
    }
    for (const [slug, d] of Object.entries(ind.dzongkhags)) expect(d.cottage + d.small + d.medium + d.large, slug).toBe(d.total);
    expect(ind.national.total).toBe(31_952);
  });

  it('job placements cover every dzongkhag and stay within the published total', () => {
    const plc = economy.metrics.find(m => m.key === 'placements')!;
    expect(Object.keys(plc.dzongkhags).sort()).toEqual(slugs);
    const named = sum(Object.values(plc.dzongkhags).map(d => d.total));
    // one record in the report has no dzongkhag, so the named rows are one short of the national total
    expect(plc.national.total - named).toBe(1);
  });

  it('every Dzongdag entry carries a confidence level and a source', () => {
    expect(Object.keys(dzongdags.dzongkhags).sort()).toEqual(slugs);
    for (const [slug, e] of Object.entries(dzongdags.dzongkhags)) {
      const d = e.dzongdag;
      if (!d) continue;
      expect(['confirmed', 'website', 'unconfirmed'], slug).toContain(d.confidence);
      expect(d.sourceUrl, `${slug} needs a source link`).toMatch(/^https?:\/\//);
      expect(d.name.length, slug).toBeGreaterThan(2);
      // anything not confirmed by a dated notice must explain itself on the page
      if (d.confidence !== 'confirmed') expect(d.note, `${slug} needs a caveat`).toBeTruthy();
      if (d.confidence === 'confirmed') expect(d.note, slug).toBeTruthy();
    }
    expect(dzongdags.checked).toMatch(/^\d{4}-\d\d-\d\d$/);
  });
});

describe('vacancy notices (employers’ own sites)', () => {
  const V = vacancyNotices;
  const host = (u: string) => new URL(u).hostname.replace(/^www\./, '');

  it('every notice links the employer’s own site, never social media or an aggregator', () => {
    for (const n of V.notices) {
      expect(n.url, n.title).toMatch(/^https:\/\//);
      expect(host(n.url), n.url).not.toMatch(/facebook|instagram|tiktok|x\.com|twitter|dziseldra|unjobs|unjobnet|untalent|linkedin/);
    }
  });

  it('dates are real, in order, and the check date is stated', () => {
    expect(V.checked).toMatch(/^\d{4}-\d\d-\d\d$/);
    for (const n of V.notices) {
      for (const d of [n.posted, n.closes]) if (d) expect(Number.isNaN(Date.parse(d)), d).toBe(false);
      if (n.posted) expect(n.posted <= V.checked, n.title).toBe(true);
      if (n.posted && n.closes) expect(n.posted <= n.closes, n.title).toBe(true);
      // a notice must have been open on the day it was read, or it should not have been recorded
      expect(isOpen(n, V.checked), n.title).toBe(true);
    }
  });

  it('a closed notice drops out, and one with no closing date stays until the next check', () => {
    const n = { employer: 'X', group: 'listed' as const, title: 'T', posted: '2026-11-01', url: 'https://x.bt/' };
    expect(isOpen({ ...n, closes: '2026-11-30' }, '2026-11-30')).toBe(true);   // open through the closing day
    expect(isOpen({ ...n, closes: '2026-11-30' }, '2026-12-01')).toBe(false);
    expect(isOpen({ ...n, closes: null }, '2027-06-01')).toBe(true);
  });

  it('the sources table agrees with the notices, and says why nothing is listed where nothing is', () => {
    const openEmployers = new Set(V.sources.filter(s => s.status === 'open').map(s => s.employer));
    expect(new Set(V.notices.map(n => n.employer))).toEqual(openEmployers);
    for (const s of V.sources) {
      expect(['open', 'none', 'social', 'not-found', 'unreadable'], s.employer).toContain(s.status);
      expect(s.note.length, s.employer).toBeGreaterThan(10);
      if (s.status === 'open' || s.status === 'none' || s.status === 'unreadable') expect(s.page, s.employer).toMatch(/^https:\/\//);
    }
    // every group the user asked about is covered, even where the answer is "could not be read"
    expect(new Set(V.sources.map(s => s.group))).toEqual(new Set(['listed', 'un', 'ngo', 'foundation', 'media']));
  });
});
