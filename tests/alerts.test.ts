// The rule these pin: a source is judged by the AGE OF ITS LAST SUCCESS, not by its status. The failure
// this exists for — a cron that stopped firing — leaves status 'ok' behind, so any check that trusts status
// cannot see it. These tests are pure; tests/db.test.ts runs the same logic against a real database.
import { describe, expect, test } from 'vitest';
import { alertText, classify, overdueBy, REALERT_AFTER_H, type SourceAge } from '../src/server/alerts';

const H = 3_600_000;
const NOW = Date.parse('2026-10-12T12:00:00Z');
const hAgo = (h: number) => new Date(NOW - h * H).toISOString();
const src = (over: Partial<SourceAge> = {}): SourceAge =>
  ({ id: 'egp', name: 'e-GP tender notices', status: 'ok', error: null, last_success: hAgo(1), last_attempt: hAgo(1), alerted_at: null, ...over });

describe('which sources are overdue', () => {
  test('a source whose status is still "ok" is overdue once its last success is old enough', () => {
    // the whole point: the job is not failing, it is not running, and nothing else in the app notices
    const quietlyDead = src({ status: 'ok', error: null, last_success: hAgo(100), last_attempt: hAgo(100) });
    expect(overdueBy(quietlyDead, NOW, 72)).toBeCloseTo(100, 5);
    expect(classify([quietlyDead], NOW, 72).overdue.map(s => s.id)).toEqual(['egp']);
  });

  test('the threshold is the threshold: 71 h is not overdue, 73 h is', () => {
    expect(overdueBy(src({ last_success: hAgo(71) }), NOW, 72)).toBeNull();
    expect(overdueBy(src({ last_success: hAgo(73) }), NOW, 72)).toBeCloseTo(73, 5);
  });

  test('a source that has never succeeded is judged on when it was last tried', () => {
    expect(overdueBy(src({ last_success: null, last_attempt: hAgo(100) }), NOW, 72)).toBeCloseTo(100, 5);
    expect(overdueBy(src({ last_success: null, last_attempt: hAgo(2) }), NOW, 72)).toBeNull();
    // never tried at all (a source row that exists but has not run yet) is not an alert
    expect(overdueBy(src({ last_success: null, last_attempt: null }), NOW, 72)).toBeNull();
  });

  test('an unreadable timestamp does not become an alert', () => {
    expect(overdueBy({ last_success: 'not a date', last_attempt: null }, NOW, 72)).toBeNull();
  });
});

describe('how often it speaks', () => {
  test('an overdue source already reported today is overdue but not re-alerted', () => {
    const rows = [src({ last_success: hAgo(100), alerted_at: hAgo(REALERT_AFTER_H - 1) })];
    const r = classify(rows, NOW, 72);
    expect(r.overdue).toHaveLength(1);
    expect(r.alert).toHaveLength(0);
  });

  test('…and is reported again once a day has passed', () => {
    const rows = [src({ last_success: hAgo(200), alerted_at: hAgo(REALERT_AFTER_H + 1) })];
    expect(classify(rows, NOW, 72).alert.map(s => s.id)).toEqual(['egp']);
  });

  test('a source that was reported and is now fresh counts as recovered, and only once', () => {
    const r = classify([src({ last_success: hAgo(1), alerted_at: hAgo(5) })], NOW, 72);
    expect(r.overdue).toHaveLength(0);
    expect(r.recovered.map(s => s.id)).toEqual(['egp']);
    // with alerted_at cleared (what checkStaleSources does after announcing it), there is nothing left to say
    expect(classify([src({ last_success: hAgo(1), alerted_at: null })], NOW, 72).recovered).toHaveLength(0);
  });
});

describe('what the message says', () => {
  const text = alertText(
    [{ id: 'egp', name: 'e-GP tender notices', status: 'stale', error: 'e-GP tender list rejected (3 problems), previous notices kept.', hours: 100, last_success: hAgo(100) },
      { id: 'adb', name: 'ADB projects', status: 'error', error: null, hours: null, last_success: null }],
    [src({ id: 'weather', name: 'Open-Meteo weather' })], 72, 'https://drukview.vercel.app/');

  test('names each source, how old it is, and the error to act on', () => {
    expect(text).toContain('e-GP tender notices (egp)');
    expect(text).toContain('last succeeded 4 days ago');
    expect(text).toContain('e-GP tender list rejected');
    expect(text).toContain('ADB projects (adb)');
    expect(text).toContain('never succeeded');
  });

  test('says the pages are still showing data that old, because that is the consequence', () => {
    expect(text).toContain('readers are seeing figures that old');
  });

  test('reports a recovery and links the status page without a double slash', () => {
    expect(text).toContain('Open-Meteo weather (weather) is refreshing again');
    expect(text).toContain('https://drukview.vercel.app/en/data-sources');
  });

  test('a recovery on its own is not phrased as an alert', () => {
    const only = alertText([], [src({ id: 'weather', name: 'Open-Meteo weather' })], 72, 'https://x.test');
    expect(only).not.toMatch(/have not refreshed|has not refreshed/);
    expect(only).toContain('is refreshing again');
  });
});
