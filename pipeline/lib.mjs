export const UA = 'DrukView-data-bot/0.1 (+https://github.com/youngyang07/drukview)';

// Defaults keep a whole job well inside a 60 s serverless limit (worst case ≈ 3 × 15 s + 3 s backoff).
export async function fetchWithRetry(url, { retries = 2, timeoutMs = 15000, accept } = {}) {
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
      const cause = e?.cause?.code || e?.cause?.message || (e?.name === 'TimeoutError' ? 'timeout' : '');
      last = e?.message?.startsWith('HTTP ') ? e : new Error(`${e?.message ?? e}${cause ? ` (${cause})` : ''} for ${url}`);
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

/** -> "YYYY-MM-DD" | null. Accepts ISO ("2024-12-11T00:00:00Z") and US style ("12/31/2027 12:00:00 AM"); timezone-independent. */
export function isoDate(v) {
  if (!v) return null;
  const t = String(v).trim();
  let y, m, d;
  let r = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (r) [, y, m, d] = r;
  else if ((r = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { y = r[3]; m = r[1].padStart(2, '0'); d = r[2].padStart(2, '0'); }
  else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  return dt.getUTCFullYear() === +y && dt.getUTCMonth() === +m - 1 && dt.getUTCDate() === +d ? `${y}-${m}-${d}` : null;
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

/** Compute project locations. Explicit location fields beat text matching. */
export function resolveLocations({ explicitNames = [], text = '' }, matcher) {
  const fromFields = new Set();
  for (const n of explicitNames) { const id = matcher.byName(n) ?? matcher.findAll(n)[0]; if (id) fromFields.add(id); }
  if (fromFields.size) return { ids: [...fromFields], confidence: 'location-field' };
  const fromText = matcher.findAll(text);
  if (fromText.length) return { ids: fromText, confidence: 'text-match' };
  return { ids: [], confidence: 'none' };
}
