import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = resolve(ROOT, 'data');
export const UA = 'DrukView-data-bot/0.1 (+https://github.com/youngyang07/drukview)';

export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { if (fallback !== undefined) return fallback; throw e; }
}

export async function writeJson(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(obj, null, 2) + '\n');
}

export async function fetchWithRetry(url, { retries = 3, timeoutMs = 60000, accept } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, ...(accept ? { accept } : {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (e) {
      last = e;
      if (i < retries) await new Promise(r => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw last;
}

export const fetchJson = async (url, o) => (await fetchWithRetry(url, { accept: 'application/json', ...o })).json();
export const fetchText = async (url, o) => (await fetchWithRetry(url, o)).text();

/** Parse "35,000,000" / 35000000 / "" -> number | null */
export function parseAmount(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function isoDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function httpsUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; }
  catch { return null; }
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build a matcher that finds dzongkhag names/aliases in free text. */
export function makeGeoMatcher(dzongkhags) {
  const entries = [];
  for (const d of dzongkhags) for (const a of d.aliases) entries.push({ id: d.id, re: new RegExp(`(?<![\\p{L}])${esc(a)}(?![\\p{L}])`, 'iu') });
  return {
    /** -> unique dzongkhag ids mentioned in text */
    findAll(text) {
      if (!text) return [];
      const ids = new Set();
      for (const e of entries) if (e.re.test(text)) ids.add(e.id);
      return [...ids];
    },
    /** exact-ish name -> id | null (for boundary shapeName etc.) */
    byName(name) {
      if (!name) return null;
      const n = name.trim().toLowerCase().replace(/\s+(dzongkhag|district)$/i, '');
      for (const d of dzongkhags) if (d.aliases.some(a => a.toLowerCase() === n) || d.name.toLowerCase() === n) return d.id;
      return null;
    },
  };
}

export async function loadDzongkhags() {
  return (await readJson(resolve(ROOT, 'shared/dzongkhags.json'))).dzongkhags;
}

/** Compute project locations. Explicit location fields beat text matching. */
export function resolveLocations({ explicitNames = [], text = '' }, matcher) {
  const fromFields = new Set();
  for (const n of explicitNames) { const id = matcher.byName(n) ?? matcher.findAll(n)[0]; if (id) fromFields.add(id); }
  if (fromFields.size) return { ids: [...fromFields], confidence: 'location-field' };
  const fromText = matcher.findAll(text);
  if (fromText.length) return { ids: fromText, confidence: 'text-match' };
  return { ids: [], confidence: 'none' };
}
