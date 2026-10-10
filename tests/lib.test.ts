import { describe, expect, test } from 'vitest';
import { ago, classer, money, moneyFull, safeUrl } from '../src/lib/format';
import { csvCell, toCsv } from '../src/lib/csv';

describe('format', () => {
  test('money & null honesty', () => {
    expect(money(35_000_000, 'USD')).toBe('US$35M'); expect(money(1_200_000_000, 'BTN')).toBe('Nu.1.2B');
    expect(money(null, 'USD')).toBe('n/a'); expect(moneyFull(null, 'USD')).toBe('amount not reported'); expect(moneyFull(1234567.4, 'BTN')).toBe('Nu.1,234,567');
  });
  test('ago', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(ago(null, now)).toBe('never'); expect(ago('2026-10-10T11:59:00Z', now)).toBe('just now'); expect(ago('2026-10-10T09:00:00Z', now)).toBe('3 h ago');
    expect(ago('2026-10-09T09:00:00Z', now)).toBe('yesterday'); expect(ago('2026-10-05T12:00:00Z', now)).toBe('5 days ago'); expect(ago('garbage', now)).toBe('never');
    expect(ago('2026-10-10 08:59:00.123456+00', now)).toBe('3 h ago'); // Postgres timestamptz::text
    expect(ago('2026-10-10 14:59:00+06', now)).toBe('3 h ago'); expect(ago('2026-10-05', now)).toBe('5 days ago');
  });
  test('safeUrl only allows https', () => { expect(safeUrl('https://a.org/x')).toBe('https://a.org/x'); expect(safeUrl('javascript:alert(1)')).toBeNull(); expect(safeUrl('http://a.org')).toBeNull(); expect(safeUrl(null)).toBeNull(); });
  test('classer: 0 = no figures, 1..5 monotonic', () => {
    const c = classer([0, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(c(0)).toBe(0); expect(c(10)).toBe(1); expect(c(100)).toBe(5); expect(c(50)).toBeGreaterThanOrEqual(c(30)); expect(classer([0, 0])(5)).toBe(0);
  });
});
describe('csv', () => {
  test('quoting and formula-injection guard', () => {
    expect(csvCell('a,b')).toBe('"a,b"'); expect(csvCell('say "hi"')).toBe('"say ""hi"""'); expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5')).toBe('-5'); expect(csvCell('@cmd')).toBe("'@cmd"); expect(csvCell(null)).toBe('');
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('a,b\n1,x\n');
  });
});
