import { describe, expect, it } from 'vitest';

/**
 * An empty section must say which kind of empty it is. "There is none here" is a claim about Bhutan; "we
 * could not read the source" is a claim about DrukView. Passing the second off as the first is how the
 * Tenders page came to tell readers there were no tenders while 203 were open (docs/adr/0002), so the rule
 * is pinned here rather than left to review.
 */
describe('EmptyOr', () => {
  const render = async (health: { id: string; status: string; last_success: string | null }[], ids: string[]) => {
    const { EmptyOr } = await import('../src/components/ui');
    const { renderToStaticMarkup } = await import('react-dom/server');
    return renderToStaticMarkup(EmptyOr({ health, ids, what: 'the e-GP tender register', children: 'Nothing is out to bid here.' }) as never);
  };
  const ok = (id: string) => ({ id, status: 'ok', last_success: '2026-10-11 00:00:00+00' });

  it('shows the caller\'s own wording only when every source has refreshed successfully', async () => {
    const html = await render([ok('egp')], ['egp']);
    expect(html).toContain('Nothing is out to bid here.');
    expect(html).not.toContain('gap in DrukView');
  });

  it('names a gap when a source has never succeeded — rather than claiming there is nothing', async () => {
    for (const health of [[], [{ id: 'egp', status: 'error', last_success: null }]]) {
      const html = await render(health, ['egp']);
      expect(html).toContain('gap in DrukView, not a statement about Bhutan');
      expect(html).toContain('has not been collected yet');
      // the negation is the whole point of the sentence: assert it, do not just assert the string we wrote
      expect(html).not.toMatch(/data has been collected yet/);
      expect(html).not.toContain('Nothing is out to bid here.');
    }
  });

  it('names a gap when the last refresh failed, even though older data once arrived', async () => {
    for (const status of ['error', 'stale']) {
      const html = await render([{ id: 'egp', status, last_success: '2026-10-01 00:00:00+00' }], ['egp']);
      expect(html).toContain('the last refresh of the e-GP tender register failed');
      expect(html).not.toContain('Nothing is out to bid here.');
    }
  });

  it('requires every source behind a section, not just one of them', async () => {
    const both = ['worldbank', 'adb'];
    // one collector has never run: the view is incomplete, so it cannot claim an absence
    const partial = await render([ok('worldbank')], both);
    expect(partial).toContain('has not been fully collected yet');
    // both ran: the absence is real and the caller's wording is used
    const full = await render([ok('worldbank'), ok('adb')], both);
    expect(full).toContain('Nothing is out to bid here.');
  });
});
