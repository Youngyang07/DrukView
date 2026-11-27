import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detailUrl, diffVacancies, FILTERS, LOCATION_FLAGS, parseRcscPage, rcscDate, searchBody, toVacancies, validateRcsc, vacancyHash } from '../pipeline/rcsc.mjs';
import { makeGeoMatcher } from '../pipeline/lib.mjs';

const DZ = JSON.parse(readFileSync('shared/dzongkhags.json', 'utf8')).dzongkhags;
const matcher = makeGeoMatcher(DZ.map((d: { id: string; name: string; aliases: string[] }) => ({ id: d.id, name: d.name, aliases: d.aliases })));
/** Zhiyog's own answer to the list request, captured 2026-11-27: every open announcement, verbatim. */
const REAL = JSON.parse(readFileSync('tests/fixtures/rcsc-vacancies-real.json', 'utf8'));
const AT = '2026-11-27T08:00:00.000Z';
const parsed = () => toVacancies(parseRcscPage(REAL).rows, matcher, { fetchedAt: AT });

describe('Zhiyog vacancy list', () => {
  it('sends the search the way the page does: nested fields, every option, comma-terminated', () => {
    const b = searchBody({ Condition02: [1, 2], Condition03: ['R', 'C'], Condition04: ['N'], Condition05: ['Thimphu', 'Pema Gatshel'] }, { skip: 10, take: 10 });
    expect(b.get('Condition[IsSearch]')).toBe('true');
    expect(b.get('Condition[Condition02]')).toBe('1,2,');
    expect(b.get('Condition[Condition05]')).toBe('Thimphu,Pema Gatshel,');
    expect(b.get('Condition[Condition10]')).toBe('D');
    expect(b.get('Condition[Condition11]')).toBe('10');
    expect(b.get('Condition[Condition12]')).toBe('10');
    // a bare field name is what the first, failing version sent; the server answers it with HTTP 500
    expect(b.has('Condition02')).toBe(false);
    expect(FILTERS.map(f => f[2])).toEqual(['Condition02', 'Condition03', 'Condition04', 'Condition05']);
  });

  it('reads the date format and refuses anything else', () => {
    expect(rcscDate('2026-12-09T00:00:00')).toBe('2026-12-09');
    expect(rcscDate('2026-02-30T00:00:00')).toBeNull();
    expect(rcscDate('09/12/2026')).toBeNull();
    expect(rcscDate(null)).toBeNull();
  });

  it('reads every announcement in the captured response, and the count agrees with the list\'s own total', () => {
    const { rows, total } = parseRcscPage(REAL);
    expect(total).toBe(16);
    expect(rows).toHaveLength(16);
    const v = parsed();
    expect(validateRcsc(v, { total })).toEqual([]);
  });

  it('keeps the Commission\'s fields and cites each announcement\'s own page', () => {
    const s = parsed().find(v => v.title === 'Surveyor I')!;
    expect(s).toMatchObject({
      id: 'rcsc-12844-131', agency: 'Ministry of Infrastructure and Transport', announcement: 'Surveyor', position_level: 'S2',
      employment_type: 'Regular', category: 'Normal Recruitment', slots: 1, pay_min: 18095, pay_max: 23570, pay_currency: 'BTN',
      published_on: '2026-11-26', closing_on: '2026-12-09', places: ['Thimphu'], dzongkhags: ['BT-15'],
      url: 'https://jobs.rcsc.gov.bt/Application/VacancyDetail/12844/131', fetched_at: AT,
    });
    expect(s.qualification).toBe('Class XII with Diploma in Surveying');
  });

  it('lists a multi-dzongkhag announcement in every dzongkhag it names, from the Commission\'s flags only', () => {
    const lab = parsed().find(v => v.title === 'Asst. Laboratory Technician I')!;
    expect(lab.places).toHaveLength(9);
    expect(lab.dzongkhags).toContain('BT-GA');
    expect(lab.dzongkhags).toContain('BT-TY');
    // every flag the Commission uses names a real dzongkhag
    for (const name of Object.values(LOCATION_FLAGS)) expect(matcher.byName(name), name).not.toBeNull();
    expect(Object.keys(LOCATION_FLAGS)).toHaveLength(20);
  });

  it('does not invent a pay scale the Commission did not print', () => {
    const p = parsed().find(v => v.title === 'Asst. Planning Officer')!;
    expect(p.pay_min).toBeNull();
    expect(p.pay_max).toBeNull();
    expect(p.pay_currency).toBeNull();
  });

  // Synthetic cases below: the captured response does not contain them.
  it('rejects a response that is not the list, or is short of its own total', () => {
    expect(parseRcscPage({ error: 'x' }).rows).toEqual([]);
    const v = parsed();
    expect(validateRcsc(v.slice(0, 15), { total: 16 })[0]).toMatch(/reports 16 announcements but 15/);
  });

  it('rejects rows that cannot be cited, dated or placed', () => {
    const [base] = parseRcscPage(REAL).rows;
    const bad = toVacancies([
      { ...base, vaEndDate: 'soon' },
      { ...base, recruitmentID: 999, vaEndDate: '2026-11-01T00:00:00' },
      { ...base, recruitmentID: 998, slots: 0 },
      { ...base, recruitmentID: 997, minPayScale: 20000, maxPayScale: 100 },
    ], { byName: (n: string) => (n === 'Thimphu' ? null : 'X') }, { fetchedAt: AT });
    const errs = validateRcsc(bad).join('\n');
    expect(errs).toMatch(/closing date could not be read/);
    expect(errs).toMatch(/closes \(2026-11-01\) before it was published/);
    expect(errs).toMatch(/no number of posts/);
    expect(errs).toMatch(/pay scale runs backwards/);
    expect(errs).toMatch(/location "Thimphu" matches no dzongkhag/);
    expect(validateRcsc([...parsed(), parsed()[0]]).join('\n')).toMatch(/appears twice/);
  });

  it('pins citations to the real site', () => {
    expect(detailUrl(1, 2)).toBe('https://jobs.rcsc.gov.bt/Application/VacancyDetail/1/2');
  });

  describe('hourly refresh: each announcement once, rewritten only when it changes', () => {
    const fresh = () => parsed();
    const storedFrom = (rows: { id: string }[]) => new Map(rows.map(r => [r.id, vacancyHash(r)]));

    it('a second identical read changes nothing', () => {
      const d = diffVacancies(storedFrom(fresh()), fresh());
      expect([d.added.length, d.changed.length, d.removed.length, d.unchanged.length]).toEqual([0, 0, 0, 16]);
    });
    it('the read time and applicant counts move every hour but are not changes', () => {
      const later = fresh().map(v => ({ ...v, fetched_at: '2026-11-27T09:00:00.000Z', applicants: (v.applicants ?? 0) + 7 }));
      expect(diffVacancies(storedFrom(fresh()), later).changed).toHaveLength(0);
    });
    it('a new closing date (a re-announcement keeps its id) is one change, not a second vacancy', () => {
      const later = fresh();
      later[0] = { ...later[0], closing_on: '2026-12-20', reannounced: true };
      const d = diffVacancies(storedFrom(fresh()), later);
      expect(d.changed.map(v => v.id)).toEqual([later[0].id]);
      expect(d.added).toHaveLength(0);
    });
    it('new announcements are added, withdrawn ones removed', () => {
      const all = fresh();
      const d = diffVacancies(storedFrom(all.slice(1)), all.slice(0, 15));
      expect(d.added.map(v => v.id)).toEqual([all[0].id]);
      expect(d.removed).toEqual([all[15].id]);
    });
    it('the same announcement twice in one read is kept once', () => {
      const all = fresh();
      const d = diffVacancies(new Map(), [...all, all[3]]);
      expect(d.added).toHaveLength(16);
    });
  });
});
