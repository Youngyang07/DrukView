// The installable-app pieces: the manifest must point at icons that exist, and the service worker must never
// serve a saved copy of a page or an API response — DrukView's figures carry dates, and a cached page would not.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../src/app/manifest';

describe('installable app', () => {
  const m = manifest();
  it('has what browsers require to offer installation', () => {
    expect(m.display).toBe('standalone');
    expect(m.start_url!.startsWith('/en')).toBe(true);
    const sizes = (m.icons ?? []).map(i => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect((m.icons ?? []).some(i => i.purpose === 'maskable')).toBe(true);
  });
  it('points only at icons that ship with the site', () => {
    for (const i of m.icons ?? []) expect(existsSync(`public${i.src}`), i.src).toBe(true);
    expect(existsSync('src/app/apple-icon.png')).toBe(true);
    expect(existsSync('public/offline.html')).toBe(true);
  });
  it('the service worker falls back to the offline page, caches only hashed assets, and never touches /api/', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    expect(sw).toMatch(/req\.mode === 'navigate'[\s\S]*fetch\(req\)\.catch\(\(\) => caches\.match\(OFFLINE\)\)/);
    expect(sw).toMatch(/startsWith\('\/api\/'\)\) return/);
    expect(sw).not.toMatch(/cache\.put\(req[^)]*\)[\s\S]*navigate/); // pages are never written to the cache
    expect(sw.match(/c\.put\(/g)).toHaveLength(1); // the one write is for /_next/static and /icons
  });
});
