import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentParliament, dzLookup, fetchLeaders, NA_SEATS, NA_TOTAL, NC_ELECTED, tidyConstituency, validateLeaders } from '../pipeline/leaders.mjs';
import { flagsFrom, looksLikeLeadershipChange, parseFeed } from '../pipeline/news.mjs';

const DZ = JSON.parse(readFileSync('shared/dzongkhags.json', 'utf8')).dzongkhags;
const NA = JSON.parse(readFileSync('tests/fixtures/parliament-na.json', 'utf8'));
const NC = JSON.parse(readFileSync('tests/fixtures/parliament-nc.json', 'utf8'));

/** Answer the two Parliament endpoints from the captured fixtures. */
function mockApi({ na = NA, nc = NC }: { na?: unknown; nc?: unknown } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = String(url).includes('na-members') ? na : nc;
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe('Parliament collector', () => {
  it('maps Parliament spellings onto dzongkhags, including "ha" and "Monggar"', () => {
    const to = dzLookup(DZ);
    expect(to('ha')?.slug).toBe('haa');
    expect(to('Monggar')?.slug).toBe('mongar');
    expect(to('Chhukha')?.slug).toBe('chukha');
    expect(to('Lhuentse')?.slug).toBe('lhuntse');
    expect(to('Pema Gatshel')?.slug).toBe('pemagatshel');
    expect(to('Tashi Yangtse')?.slug).toBe('trashiyangtse');
    expect(to('Samdrup Jongkhar')?.slug).toBe('samdrup-jongkhar');
    expect(to('Wangduephodrang')?.slug).toBe('wangdue-phodrang');
    expect(to('')).toBeNull();
    expect(to('Nowhere')).toBeNull();
  });

  it('tidies the constituency spellings used by the API', () => {
    expect(tidyConstituency('Kabisa_Talog')).toBe('Kabisa-Talog');
    expect(tidyConstituency('Menbi -Tsenkhar')).toBe('Menbi-Tsenkhar');
    expect(tidyConstituency('Nanong_shumar')).toBe('Nanong-Shumar');
    expect(tidyConstituency(null)).toBeNull();
  });

  it('picks the newest full Parliament, so it survives the next election', () => {
    expect(currentParliament(NA.data)).toBe('parliament-4');
    const withFifth = [...NA.data.filter((r: { parliament: string }) => r.parliament === 'parliament-4')
      .map((r: object) => ({ ...r, parliament: 'parliament-5' })), ...NA.data];
    expect(currentParliament(withFifth)).toBe('parliament-5');
    // a handful of rows for a new term must NOT win before that term is fully seated
    expect(currentParliament([...NA.data, { parliament: 'parliament-9' }, { parliament: 'parliament-9' }])).toBe('parliament-4');
  });

  it('fetches a complete, valid Parliament from the live response shape', async () => {
    mockApi();
    const { parliament, rows } = await fetchLeaders(DZ);
    expect(parliament).toBe('parliament-4');
    expect(validateLeaders(rows)).toEqual([]);

    const na = rows.filter(r => r.house === 'na');
    expect(na).toHaveLength(NA_TOTAL);
    expect(na.every(r => r.dzongkhag && r.constituency)).toBe(true);
    expect(Object.values(NA_SEATS).reduce((a, b) => a + b, 0)).toBe(NA_TOTAL);

    const nc = rows.filter(r => r.house === 'nc');
    expect(nc.filter(r => !r.eminent)).toHaveLength(NC_ELECTED);
    expect(nc.filter(r => r.eminent)).toHaveLength(5);
    expect(nc.every(r => r.eminent === (r.dzongkhag === null))).toBe(true);

    expect(rows.find(r => r.role === 'Prime Minister')?.name).toContain('Tshering Tobgay');
    expect(na.find(r => r.constituency === 'Kabisa-Talog')?.role).toBe('Minister');
    // only the current term is kept
    expect(rows.every(r => r.parliament === 'parliament-4')).toBe(true);
  });

  it('rejects an incomplete or mangled House rather than publishing a gap', async () => {
    mockApi();
    const { rows } = await fetchLeaders(DZ);

    expect(validateLeaders(rows.filter((_, i) => i !== 0)).length).toBeGreaterThan(0);

    const noDz = rows.map(r => (r.house === 'na' && r.constituency === 'Sangbaykha' ? { ...r, dzongkhag: null, dzongkhag_slug: null } : r));
    expect(validateLeaders(noDz).join(' ')).toMatch(/no dzongkhag matched/);

    const dupe = rows.map(r => (r.constituency === 'Sangbaykha' ? { ...r, constituency: 'Gelephu' } : r));
    expect(validateLeaders(dupe).join(' ')).toMatch(/share the constituency/);

    // a dzongkhag losing a seat (e.g. a row quietly dropped upstream) must fail
    const short = rows.filter(r => !(r.house === 'na' && r.dzongkhag_slug === 'trashigang' && r.role === 'Member of Parliament'));
    expect(validateLeaders(short).join(' ')).toMatch(/trashigang: expected 5/);

    const noNc = rows.filter(r => r.house !== 'nc');
    expect(validateLeaders(noNc).join(' ')).toMatch(/expected 20 elected National Council members/);
  });

  it('fails loudly when the API returns nothing usable', async () => {
    mockApi({ na: { data: [] }, nc: { data: [] } });
    await expect(fetchLeaders(DZ)).rejects.toThrow(/no parliament/i);
  });
});

describe('news watch', () => {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>The Bhutanese</title>
    <item><title>New Dzongdag appointed for Trashigang</title><link>https://thebhutanese.bt/a</link>
      <pubDate>Mon, 05 Oct 2026 09:07:58 +0000</pubDate><description><![CDATA[The Dzongkhag welcomed the new Dasho Dzongdag.]]></description></item>
    <item><title>Punakha farmers report a good harvest</title><link>https://thebhutanese.bt/b</link>
      <pubDate>Sun, 04 Oct 2026 09:07:58 +0000</pubDate><description>Paddy yields are up.</description></item>
    <item><title>Dzongdag opens the new school in Paro</title><link>https://thebhutanese.bt/c</link>
      <pubDate>Sat, 03 Oct 2026 09:07:58 +0000</pubDate><description>A routine visit.</description></item>
  </channel></rss>`;
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Kuensel</title>
    <entry><title>Mongar gets a new Dzongdag</title><link rel="alternate" href="https://kuenselonline.com/x"/>
      <published>2026-10-02T04:00:00Z</published><summary>Dasho takes charge.</summary></entry>
  </feed>`;
  const now = Date.parse('2026-10-11T00:00:00Z');
  const feed = { id: 'f', name: 'The Bhutanese', url: '', home: 'https://thebhutanese.bt/' };

  it('reads both RSS and Atom', () => {
    const r = parseFeed(rss);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ title: 'New Dzongdag appointed for Trashigang', url: 'https://thebhutanese.bt/a' });
    expect(r[0].published).toBe('2026-10-05T09:07:58.000Z');
    const a = parseFeed(atom);
    expect(a[0]).toMatchObject({ title: 'Mongar gets a new Dzongdag', url: 'https://kuenselonline.com/x' });
  });

  it('only flags articles that read like a change of office-holder', () => {
    expect(looksLikeLeadershipChange('New Dzongdag appointed for Trashigang')).toBe(true);
    expect(looksLikeLeadershipChange('Dzongdag opens the new school in Paro A routine visit.')).toBe(true); // "new" — deliberately generous
    expect(looksLikeLeadershipChange('Punakha farmers report a good harvest')).toBe(false);
    expect(looksLikeLeadershipChange('Dzongdag chairs the quarterly meeting')).toBe(false);
  });

  it('attaches flags to the dzongkhag named in the headline, and never carries a name', () => {
    const flags = flagsFrom(parseFeed(rss), DZ, { feed, now });
    expect(flags.map(f => f.dzongkhag)).toContain(DZ.find((d: { slug: string }) => d.slug === 'trashigang').id);
    expect(flags.every(f => f.title && f.source_name === 'The Bhutanese')).toBe(true);
    for (const f of flags) expect(Object.keys(f)).not.toContain('name');
    // the harvest story names Punakha but is not a leadership story
    expect(flags.some(f => f.dzongkhag === DZ.find((d: { slug: string }) => d.slug === 'punakha').id)).toBe(false);
  });

  it('drops stale articles', () => {
    const old = rss.replace(/2026/g, '2019');
    expect(flagsFrom(parseFeed(old), DZ, { feed, now })).toHaveLength(0);
  });
});

describe('parliament label', () => {
  it('names the term from the code, so it is right after the next election', async () => {
    const { parliamentLabel } = await import('../src/components/RefViews');
    expect(parliamentLabel('parliament-4')).toBe('4th Parliament');
    expect(parliamentLabel('parliament-5')).toBe('5th Parliament');
    expect(parliamentLabel('parliament-1')).toBe('1st Parliament');
    expect(parliamentLabel('parliament-2')).toBe('2nd Parliament');
    expect(parliamentLabel('parliament-3')).toBe('3rd Parliament');
    expect(parliamentLabel('parliament-11')).toBe('11th Parliament');
    expect(parliamentLabel(undefined)).toBe('Parliament of Bhutan');
  });
});
